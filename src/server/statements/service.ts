import "server-only";
import { Prisma, type LinkStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requireCaseAccess, requirePermission } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import { listMeta, ListResult } from "@/server/api/router";
import type { CurrentUser } from "@/server/auth/principal";
import { enqueue } from "@/server/jobs/queue";
import { nextYearReference } from "@/server/references";
import { exportResponse } from "@/server/services/exporter";
import { getSetting } from "@/server/services/settings";
import { readStoredFile, sha256, storeFile, STATEMENT_EXTENSIONS, validateUpload } from "@/server/storage";
import { selectParser, type StatementFileFormat } from "@/server/statements/parsers";
import { ENUMS } from "@/lib/enums";
import { maskAccount } from "@/lib/masking";
import { can, canSeeSensitiveIdentifiers } from "@/lib/permissions";
import { parseDateInput } from "@/lib/resources/schema";
import { aggregateFlows, counterpartyKey, detectFlags, entityResolver, FLAGS, suggestLinks, type KnownEntity, type Txn } from "@/lib/statements/analysis";
import { money, sum, toDbString } from "@/lib/money";
import { stringArray } from "@/lib/string-array";

const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const INTEREST_ROLES = new Set(["PERSON_OF_INTEREST", "SUSPECT_REPORTED_TO_AUTHORITIES", "EMPLOYEE"]);

const uploadSchema = z.object({
  caseId: z.string().min(1).max(64),
  subFileId: z.string().max(64).optional(),
  ownerName: z.string().trim().min(1, "Enter the statement owner.").max(200),
  relatedPartyId: z.string().max(64).optional(),
  institutionType: z.enum(ENUMS.InstitutionType),
  institution: z.string().trim().min(1, "Enter the bank or institution.").max(200),
  accountType: z.string().max(100).optional(),
  account: z.string().trim().min(3, "Enter the account or telephone number.").max(40),
  periodStart: z.string().max(40).optional(),
  periodEnd: z.string().max(40).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("KES"),
  source: z.string().max(200).optional(),
  dateReceived: z.string().max(40).optional(),
  processingAuthority: z.string().trim().min(3, "Record the authority for processing this statement.").max(500),
  format: z.enum(ENUMS.StatementFormat),
});

// ───────────────────── Upload and parsing ─────────────────────

export async function uploadStatement(user: CurrentUser, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose the statement file.");
  const input = uploadSchema.parse(Object.fromEntries([...uploadSchema.keyof().options].map((k) => [k, blank(form.get(k))])));
  const subject = await requireCaseAccess(user, input.caseId, "STATEMENTS", "CREATE");
  if (subject.status === "CLOSED") throw new ApiError(409, "INVALID_TRANSITION", "This case is closed.");
  if (input.relatedPartyId && !(await prisma.party.findFirst({ where: { id: input.relatedPartyId, caseId: input.caseId, isDeleted: false } })))
    throw badRequest("Related person not found in this case.");
  if (input.subFileId && !(await prisma.subFile.findFirst({ where: { id: input.subFileId, caseId: input.caseId, isDeleted: false } }))) throw badRequest("Sub-file not found in this case.");
  const maxMb = await getSetting("uploads.maxFileMb");
  const upload = await validateUpload(file, { allowed: STATEMENT_EXTENSIONS, maxBytes: maxMb * 1024 * 1024 });
  const expectExt = input.format === "CSV" ? "csv" : input.format === "XLSX" ? "xlsx" : "pdf";
  if (upload.ext !== expectExt) throw badRequest(`A ${input.format.replace("_", " ").toLowerCase()} statement must be a .${expectExt} file.`);

  return prisma.$transaction(async (tx) => {
    const original = await storeFile(tx, { ...upload, uploadedById: user.id, readOnly: true });
    const reference = await nextYearReference(tx, "statement");
    const st = await tx.financialStatement.create({
      data: {
        reference,
        caseId: input.caseId,
        subFileId: input.subFileId ?? null,
        ownerName: input.ownerName,
        relatedPartyId: input.relatedPartyId ?? null,
        institutionType: input.institutionType,
        institution: input.institution,
        accountType: input.accountType ?? null,
        // Only a masked identifier is stored.
        maskedAccount: maskAccount(input.account)!,
        periodStart: input.periodStart ? parseDateInput(input.periodStart) : null,
        periodEnd: input.periodEnd ? parseDateInput(input.periodEnd) : null,
        currency: input.currency,
        source: input.source ?? null,
        dateReceived: input.dateReceived ? parseDateInput(input.dateReceived) : null,
        processingAuthority: input.processingAuthority,
        format: input.format,
        originalFileId: original.id,
        originalFilename: upload.originalName,
        sha256: upload.sha256,
        uploadedById: user.id,
        status: "QUEUED",
      },
    });
    await enqueue(tx, "STATEMENT_PARSE", { statementId: st.id, userId: user.id });
    await tx.case.update({ where: { id: input.caseId }, data: { lastActivityAt: new Date() } });
    await audit(
      {
        action: "statements.upload",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "financialStatement",
        entityId: st.id,
        caseId: input.caseId,
        after: { reference, sha256: upload.sha256, format: input.format },
      },
      tx,
    );
    return { id: st.id, reference, sha256: upload.sha256, status: st.status };
  });
}

/** Background job: parse a derived copy of the original and store normalised transactions. */
export async function runStatementParse(statementId: string) {
  const st = await prisma.financialStatement.findUnique({ where: { id: statementId } });
  if (!st) return { skipped: "statement not found" };
  await prisma.financialStatement.update({ where: { id: statementId }, data: { status: "PARSING", parseMessage: null } });
  const original = await prisma.storedFile.findUniqueOrThrow({ where: { id: st.originalFileId } });
  const bytes = await readStoredFile(original.storageKey);
  if (sha256(bytes) !== st.sha256) {
    await prisma.financialStatement.update({ where: { id: statementId }, data: { status: "FAILED", parseMessage: "The original failed its integrity check; parsing stopped." } });
    return { error: "hash mismatch" };
  }
  const derived = Buffer.from(bytes); // analysis always works on a copy
  const parser = await selectParser();
  let result;
  try {
    result = await parser.parse({ buffer: derived, format: st.format as StatementFileFormat });
  } catch (e) {
    await prisma.financialStatement.update({ where: { id: statementId }, data: { status: "FAILED", parserUsed: parser.name, parseMessage: (e as Error).message.slice(0, 1000) } });
    throw e;
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.statementTransaction.deleteMany({ where: { statementId } });
      const batch = 1000;
      for (let i = 0; i < result.transactions.length; i += batch) {
        await tx.statementTransaction.createMany({
          data: result.transactions.slice(i, i + batch).map((t) => ({
            statementId,
            rowNumber: t.rowNumber,
            txnDate: t.txnDate,
            txnTime: t.txnTime,
            reference: t.reference,
            description: t.description,
            // Flags are set by analyseCase after the statement is parsed.
            flags: [],
            debit: t.debit,
            credit: t.credit,
            balance: t.balance,
            counterpartyName: t.counterpartyName,
            counterpartyPhone: t.counterpartyPhone,
            counterpartyAccount: t.counterpartyAccount,
            isDemo: st.isDemo,
          })),
        });
      }
      const dates = result.transactions.map((t) => t.txnDate.getTime());
      await tx.financialStatement.update({
        where: { id: statementId },
        data: {
          status: result.needsManualReview ? "NEEDS_MANUAL_REVIEW" : "PARSED",
          parserUsed: parser.name,
          parseMessage: result.warnings.slice(0, 50).join("\n") || null,
          transactionCount: result.transactions.length,
          periodStart: st.periodStart ?? (dates.length ? new Date(Math.min(...dates)) : null),
          periodEnd: st.periodEnd ?? (dates.length ? new Date(Math.max(...dates)) : null),
        },
      });
    },
    { timeout: 120_000 },
  );
  const analysis = await analyseCase(st.caseId);
  await audit({
    action: "statements.parse",
    actorLabel: "system",
    entityType: "financialStatement",
    entityId: statementId,
    caseId: st.caseId,
    details: { parser: parser.name, transactions: result.transactions.length, warnings: result.warnings.length, ...analysis },
  });
  return { transactions: result.transactions.length, parser: parser.name, ...analysis };
}

// ───────────────────── Case-wide analysis ─────────────────────

async function caseContext(caseId: string) {
  const [parties, accounts, statements, invoices, cheques] = await Promise.all([
    prisma.party.findMany({ where: { caseId, isDeleted: false }, select: { id: true, name: true, role: true, telephone: true } }),
    prisma.knownAccount.findMany({ where: { caseId, isDeleted: false }, select: { id: true, partyId: true, holderName: true, accountRef: true, telephone: true } }),
    prisma.financialStatement.findMany({ where: { caseId, isDeleted: false }, select: { id: true, ownerName: true, relatedPartyId: true } }),
    prisma.invoice.findMany({
      where: { caseId, isDeleted: false },
      select: { id: true, invoiceNumber: true, invoiceDate: true, invoiceAmount: true, amountPaid: true, customerName: true, deliveryNoteNumber: true },
    }),
    prisma.cheque.findMany({ where: { caseId, isDeleted: false }, select: { id: true, chequeNumber: true, amount: true, issuer: true } }),
  ]);
  const entities = new Map<string, KnownEntity>();
  for (const p of parties) entities.set(p.id, { id: p.id, kind: "PARTY", name: p.name, phones: p.telephone ? [p.telephone] : [], accounts: [], ofInterest: INTEREST_ROLES.has(p.role) });
  for (const a of accounts) {
    const target = a.partyId ? entities.get(a.partyId) : undefined;
    if (target) {
      if (a.telephone) target.phones.push(a.telephone);
      if (a.accountRef) target.accounts.push(a.accountRef);
    } else {
      entities.set(a.id, { id: a.id, kind: "KNOWN_ACCOUNT", name: a.holderName, phones: a.telephone ? [a.telephone] : [], accounts: a.accountRef ? [a.accountRef] : [], ofInterest: false });
    }
  }
  const statementOwner: Record<string, string> = {};
  for (const s of statements) {
    if (s.relatedPartyId && entities.has(s.relatedPartyId)) statementOwner[s.id] = s.relatedPartyId;
    else {
      const id = `owner:${s.id}`;
      entities.set(id, { id: s.id, kind: "STATEMENT_OWNER", name: s.ownerName, phones: [], accounts: [], ofInterest: false });
      statementOwner[s.id] = s.id;
    }
  }
  return {
    entities: [...entities.values()],
    statementOwner,
    statementIds: statements.map((s) => s.id),
    invoices: invoices.map((i) => ({ ...i, invoiceAmount: i.invoiceAmount.toString(), outstanding: toDbString(money(i.invoiceAmount).minus(i.amountPaid)) })),
    cheques: cheques.map((c) => ({ ...c, amount: c.amount.toString() })),
  };
}

const toTxn = (t: {
  id: string;
  statementId: string;
  txnDate: Date;
  reference: string | null;
  description: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  counterpartyAccount: string | null;
}): Txn => ({
  ...t,
  debit: t.debit.toString(),
  credit: t.credit.toString(),
});

/** Recomputes pattern flags and link suggestions for every statement in a case. Reviewed links are kept. */
export async function analyseCase(caseId: string) {
  const ctx = await caseContext(caseId);
  const rows = await prisma.statementTransaction.findMany({
    where: { statementId: { in: ctx.statementIds }, excluded: false },
    select: { id: true, statementId: true, txnDate: true, reference: true, description: true, debit: true, credit: true, counterpartyName: true, counterpartyPhone: true, counterpartyAccount: true },
  });
  const txns = rows.map(toTxn);
  const flags = detectFlags(txns, ctx);
  const suggestions = suggestLinks(txns, ctx);
  // One UPDATE per distinct flag combination rather than per row.
  const groups = new Map<string, string[]>();
  for (const [id, set] of flags) {
    const key = FLAGS.filter((f) => set.has(f)).join(",");
    const ids = groups.get(key);
    if (ids) ids.push(id);
    else groups.set(key, [id]);
  }
  await prisma.$transaction(
    async (tx) => {
      for (const [key, ids] of groups) {
        for (let i = 0; i < ids.length; i += 5000) {
          await tx.statementTransaction.updateMany({ where: { id: { in: ids.slice(i, i + 5000) } }, data: { flags: key ? key.split(",") : [] } });
        }
      }
      await tx.transactionLink.deleteMany({ where: { status: "SUGGESTED", transaction: { statementId: { in: ctx.statementIds } } } });
      // Reviewed (confirmed or rejected) links are kept and must not be suggested again. Only those
      // known duplicates are skipped; any other insert failure is raised (no INSERT IGNORE).
      const reviewed = await tx.transactionLink.findMany({
        where: { transaction: { statementId: { in: ctx.statementIds } } },
        select: { transactionId: true, targetType: true, targetId: true },
      });
      const linkKey = (l: { transactionId: string; targetType: string; targetId: string }) => JSON.stringify([l.transactionId, l.targetType, l.targetId]);
      const taken = new Set(reviewed.map(linkKey));
      const fresh = suggestions.filter((s) => (taken.has(linkKey(s)) ? false : (taken.add(linkKey(s)), true)));
      for (let i = 0; i < fresh.length; i += 2000) {
        await tx.transactionLink.createMany({ data: fresh.slice(i, i + 2000) });
      }
      await tx.financialStatement.updateMany({ where: { id: { in: ctx.statementIds } }, data: { analysedAt: new Date() } });
    },
    { timeout: 120_000 },
  );
  return { flagged: [...flags.values()].filter((s) => s.size).length, suggestions: suggestions.length };
}

// ───────────────────── Reads and reviews ─────────────────────

async function loadStatement(user: CurrentUser, id: string, action: "VIEW" | "EDIT" = "VIEW") {
  const st = await prisma.financialStatement.findUnique({ where: { id } });
  if (!st || st.isDeleted) throw notFound("Statement");
  await requireCaseAccess(user, st.caseId, "STATEMENTS", action);
  return st;
}

export async function statementHeader(user: CurrentUser, id: string) {
  const st = await loadStatement(user, id);
  const [flagCounts, linkCounts, totals, job, c] = await Promise.all([
    // flags is a JSON array of strings; JSON_TABLE turns each element into a row.
    prisma.$queryRaw<{ flag: string; n: bigint }[]>`
      SELECT jt.flag AS flag, COUNT(*) AS n
      FROM \`StatementTransaction\` t, JSON_TABLE(t.flags, '$[*]' COLUMNS (flag VARCHAR(64) PATH '$')) AS jt
      WHERE t.\`statementId\` = ${id} AND NOT t.excluded
      GROUP BY jt.flag`,
    prisma.transactionLink.groupBy({ by: ["status"], where: { transaction: { statementId: id } }, _count: { _all: true } }),
    prisma.statementTransaction.aggregate({ where: { statementId: id, excluded: false }, _sum: { debit: true, credit: true } }),
    prisma.job.findFirst({
      where: { type: "STATEMENT_PARSE", payload: { path: "$.statementId", equals: id } },
      orderBy: { createdAt: "desc" },
      select: { status: true, attempts: true, lastError: true },
    }),
    prisma.case.findUniqueOrThrow({ where: { id: st.caseId }, select: { id: true, reference: true, title: true } }),
  ]);
  return {
    statement: st,
    case: c,
    flags: Object.fromEntries(flagCounts.map((f) => [f.flag, Number(f.n)])),
    links: Object.fromEntries(linkCounts.map((l) => [l.status, l._count._all])),
    totals: { debit: toDbString(money(totals._sum.debit)), credit: toDbString(money(totals._sum.credit)) },
    job,
  };
}

const txnQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  flag: z.enum(FLAGS).optional(),
  direction: z.enum(["DEBIT", "CREDIT"]).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  minAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  excluded: z.enum(["only", "include"]).optional(),
});
export { txnQuery };

function txnWhere(statementId: string, q: z.output<typeof txnQuery>): Prisma.StatementTransactionWhereInput {
  const and: Prisma.StatementTransactionWhereInput[] = [{ statementId }];
  if (q.excluded === "only") and.push({ excluded: true });
  else if (q.excluded !== "include") and.push({ excluded: false });
  // flags is a JSON array of strings; array_contains matches one element.
  if (q.flag) and.push({ flags: { array_contains: [q.flag] } });
  if (q.direction === "DEBIT") and.push({ debit: { gt: 0 } });
  if (q.direction === "CREDIT") and.push({ credit: { gt: 0 } });
  if (q.q)
    and.push({
      OR: [{ description: { contains: q.q } }, { reference: { contains: q.q } }, { counterpartyName: { contains: q.q } }, { counterpartyPhone: { contains: q.q } }],
    });
  const from = q.from ? parseDateInput(q.from) : null;
  const to = q.to ? parseDateInput(q.to) : null;
  if (from) and.push({ txnDate: { gte: from } });
  if (to) and.push({ txnDate: { lte: new Date(to.getTime() + 86_399_999) } });
  if (q.minAmount) and.push({ OR: [{ debit: { gte: q.minAmount } }, { credit: { gte: q.minAmount } }] });
  return { AND: and };
}

export async function listTransactions(user: CurrentUser, id: string, q: z.output<typeof txnQuery>) {
  await loadStatement(user, id);
  const where = txnWhere(id, q);
  const [total, rows] = await Promise.all([
    prisma.statementTransaction.count({ where }),
    prisma.statementTransaction.findMany({
      where,
      orderBy: [{ txnDate: "asc" }, { rowNumber: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { links: { select: { id: true, status: true, linkClass: true, targetLabel: true, targetType: true, score: true } } },
    }),
  ]);
  const showFull = canSeeSensitiveIdentifiers(user);
  const shaped = rows.map((r) => ({
    ...r,
    counterpartyPhone: showFull ? r.counterpartyPhone : r.counterpartyPhone ? r.counterpartyPhone.slice(0, -6) + "•••" + r.counterpartyPhone.slice(-3) : null,
    counterpartyAccount: showFull ? r.counterpartyAccount : maskAccount(r.counterpartyAccount),
  }));
  return new ListResult(shaped, listMeta(q.page, q.pageSize, total));
}

export async function listLinks(user: CurrentUser, id: string, status: LinkStatus | undefined, page: number, pageSize: number) {
  await loadStatement(user, id);
  const where: Prisma.TransactionLinkWhereInput = { transaction: { statementId: id }, ...(status ? { status } : {}) };
  const [total, rows] = await Promise.all([
    prisma.transactionLink.count({ where }),
    prisma.transactionLink.findMany({
      where,
      orderBy: [{ score: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { transaction: { select: { id: true, txnDate: true, reference: true, description: true, debit: true, credit: true, counterpartyName: true } } },
    }),
  ]);
  return new ListResult(rows, listMeta(page, pageSize, total));
}

export async function reviewLink(user: CurrentUser, linkId: string, input: { status: "CONFIRMED" | "REJECTED"; note?: string }) {
  const link = await prisma.transactionLink.findUnique({ where: { id: linkId }, include: { transaction: { select: { statementId: true, statement: { select: { caseId: true } } } } } });
  if (!link) throw notFound("Link");
  await requireCaseAccess(user, link.transaction.statement.caseId, "STATEMENTS", "EDIT");
  if (input.status === "REJECTED" && !input.note?.trim()) throw badRequest("Explain why the suggested link is rejected.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.transactionLink.update({ where: { id: linkId }, data: { status: input.status, reviewedById: user.id, reviewedAt: new Date(), reviewNote: input.note ?? null } });
    await audit(
      {
        action: input.status === "CONFIRMED" ? "statements.match.confirm" : "statements.match.reject",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "transactionLink",
        entityId: linkId,
        caseId: link.transaction.statement.caseId,
        reason: input.note ?? null,
        before: { status: link.status },
        after: { status: input.status, linkClass: link.linkClass, target: link.targetLabel },
      },
      tx,
    );
    return updated;
  });
}

const TARGET_MODELS = { PARTY: "party", INVOICE: "invoice", CHEQUE: "cheque", KNOWN_ACCOUNT: "knownAccount" } as const;

export async function addManualLink(user: CurrentUser, transactionId: string, input: { targetType: keyof typeof TARGET_MODELS; targetId: string; note?: string }) {
  const t = await prisma.statementTransaction.findUnique({ where: { id: transactionId }, include: { statement: { select: { caseId: true } } } });
  if (!t) throw notFound("Transaction");
  const caseId = t.statement.caseId;
  await requireCaseAccess(user, caseId, "STATEMENTS", "EDIT");
  const model = TARGET_MODELS[input.targetType];
  const target = await (prisma as unknown as Record<string, { findFirst(a: unknown): Promise<Record<string, unknown> | null> }>)[model]!.findFirst({
    where: { id: input.targetId, caseId, isDeleted: false },
  });
  if (!target) throw badRequest("The target does not belong to this case.");
  const label = String(target.name ?? target.holderName ?? (target.invoiceNumber ? `Invoice ${target.invoiceNumber}` : `Cheque ${target.chequeNumber}`));
  return prisma.$transaction(async (tx) => {
    const link = await tx.transactionLink.upsert({
      where: { transactionId_targetType_targetId: { transactionId, targetType: input.targetType, targetId: input.targetId } },
      update: { status: "CONFIRMED", linkClass: "USER_CONFIRMED_MATCH", reviewedById: user.id, reviewedAt: new Date(), reviewNote: input.note ?? null },
      create: {
        transactionId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetLabel: label,
        linkClass: "USER_CONFIRMED_MATCH",
        score: 100,
        rationale: "Linked manually by an investigator.",
        status: "CONFIRMED",
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: input.note ?? null,
      },
    });
    await audit(
      {
        action: "statements.match.manual",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "transactionLink",
        entityId: link.id,
        caseId,
        reason: input.note ?? null,
        after: { target: label },
      },
      tx,
    );
    return link;
  });
}

export async function setTransactionExcluded(user: CurrentUser, transactionId: string, excluded: boolean, reason: string) {
  const t = await prisma.statementTransaction.findUnique({ where: { id: transactionId }, include: { statement: { select: { caseId: true } } } });
  if (!t) throw notFound("Transaction");
  await requireCaseAccess(user, t.statement.caseId, "STATEMENTS", "EDIT");
  if (!reason.trim()) throw badRequest("A reason is required.");
  await prisma.$transaction(async (tx) => {
    await tx.statementTransaction.update({ where: { id: transactionId }, data: { excluded } });
    await audit(
      {
        action: excluded ? "statements.txn.exclude" : "statements.txn.include",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "statementTransaction",
        entityId: transactionId,
        caseId: t.statement.caseId,
        reason,
      },
      tx,
    );
  });
  return { excluded };
}

export async function reparseStatement(user: CurrentUser, id: string) {
  const st = await loadStatement(user, id, "EDIT");
  if (["QUEUED", "PARSING"].includes(st.status)) throw new ApiError(409, "CONFLICT", "The statement is already being processed.");
  await prisma.$transaction(async (tx) => {
    await tx.financialStatement.update({ where: { id }, data: { status: "QUEUED" } });
    await enqueue(tx, "STATEMENT_PARSE", { statementId: id, userId: user.id });
    await audit({ action: "statements.reparse", actorId: user.id, actorLabel: user.username, entityType: "financialStatement", entityId: id, caseId: st.caseId }, tx);
  });
  return { queued: true };
}

export async function reanalyse(user: CurrentUser, id: string) {
  const st = await loadStatement(user, id, "EDIT");
  const r = await analyseCase(st.caseId);
  await audit({ action: "statements.analyse", actorId: user.id, actorLabel: user.username, entityType: "financialStatement", entityId: id, caseId: st.caseId, details: r });
  return r;
}

export async function markReviewed(user: CurrentUser, id: string) {
  const st = await loadStatement(user, id, "EDIT");
  if (!["PARSED", "NEEDS_MANUAL_REVIEW"].includes(st.status)) throw new ApiError(409, "INVALID_TRANSITION", "Only parsed statements can be marked as reviewed.");
  await prisma.$transaction(async (tx) => {
    await tx.financialStatement.update({ where: { id }, data: { status: "REVIEWED", reviewedById: user.id, reviewedAt: new Date() } });
    await audit({ action: "statements.review", actorId: user.id, actorLabel: user.username, entityType: "financialStatement", entityId: id, caseId: st.caseId }, tx);
  });
  return { status: "REVIEWED" };
}

export async function exportSchedule(user: CurrentUser, id: string, format: "csv" | "xlsx") {
  const st = await loadStatement(user, id);
  if (!can(user, "STATEMENTS", "EXPORT")) await requirePermission(user, "REPORTS", "EXPORT");
  const rows = await prisma.statementTransaction.findMany({
    where: { statementId: id, excluded: false },
    orderBy: [{ txnDate: "asc" }, { rowNumber: "asc" }],
  });
  // Joined on the statement, not included per row (see moneyMovement: the 32,767-parameter limit).
  const confirmedLinks = await prisma.transactionLink.findMany({
    where: { status: "CONFIRMED", transaction: { statementId: id } },
    orderBy: { reviewedAt: "asc" },
    select: { transactionId: true, targetLabel: true },
  });
  const confirmedByTxn = new Map<string, string[]>();
  for (const l of confirmedLinks) {
    const labels = confirmedByTxn.get(l.transactionId);
    if (labels) labels.push(l.targetLabel);
    else confirmedByTxn.set(l.transactionId, [l.targetLabel]);
  }
  await audit({ action: "statements.export", actorId: user.id, actorLabel: user.username, entityType: "financialStatement", entityId: id, caseId: st.caseId, details: { rows: rows.length, format } });
  const showFull = canSeeSensitiveIdentifiers(user);
  return exportResponse(
    format,
    `transaction-schedule-${st.reference}`,
    [
      { key: "rowNumber", label: "Row" },
      { key: "txnDate", label: "Date" },
      { key: "txnTime", label: "Time" },
      { key: "reference", label: "Reference" },
      { key: "description", label: "Description" },
      { key: "debit", label: "Debit", money: true },
      { key: "credit", label: "Credit", money: true },
      { key: "balance", label: "Balance", money: true },
      { key: "counterpartyName", label: "Counterparty" },
      { key: "counterpartyPhone", label: "Telephone" },
      { key: "counterpartyAccount", label: "Account" },
      { key: "flags", label: "Pattern flags (leads, not proof)" },
      { key: "confirmed", label: "Investigator-confirmed links" },
    ],
    rows.map((r) => ({
      ...r,
      txnDate: r.txnDate.toISOString().slice(0, 10),
      debit: r.debit.toString(),
      credit: r.credit.toString(),
      balance: r.balance?.toString() ?? "",
      counterpartyPhone: showFull ? r.counterpartyPhone : r.counterpartyPhone ? r.counterpartyPhone.slice(0, -6) + "•••" + r.counterpartyPhone.slice(-3) : "",
      counterpartyAccount: showFull ? r.counterpartyAccount : maskAccount(r.counterpartyAccount),
      flags: stringArray(r.flags, "flags").join(", "),
      confirmed: (confirmedByTxn.get(r.id) ?? []).join("; "),
    })),
    [`Transaction schedule — ${st.reference} — ${st.ownerName} (${st.institution} ${st.maskedAccount})`, "Automated pattern flags are investigative leads requiring human verification, not proof."],
  );
}

// ───────────────────── Money movement ─────────────────────

export async function moneyMovement(user: CurrentUser, caseId: string, opts: { minAmount?: string; statementId?: string }) {
  await requireCaseAccess(user, caseId, "STATEMENTS", "VIEW");
  const ctx = await caseContext(caseId);
  const statements = await prisma.financialStatement.findMany({
    where: { caseId, isDeleted: false, ...(opts.statementId ? { id: opts.statementId } : {}) },
    select: { id: true, ownerName: true, institution: true, maskedAccount: true, relatedPartyId: true },
  });
  // Every figure below depends only on the statement, the direction, the counterparty fields, the
  // confirmed link and the day, so the database sums exact decimals per group and only the groups
  // (thousands, not hundreds of thousands of rows) come back to be labelled.
  const statementIds = statements.map((s) => s.id);
  const minAmount = opts.minAmount ?? null;
  type GroupRow = {
    statementId: string;
    outgoing: number | bigint | boolean;
    counterpartyName: string | null;
    counterpartyPhone: string | null;
    counterpartyAccount: string | null;
    description: string | null;
    linkTargetId: string | null;
    linkTargetLabel: string | null;
    debit: string;
    credit: string;
    count: number | bigint;
    flagged: number | bigint;
  };
  type DayRow = { date: string; inflow: string; outflow: string; count: number | bigint };
  // Prisma.join([]) is invalid SQL, and no statements means no rows.
  const inStatements = statementIds.length ? Prisma.sql`t.\`statementId\` IN (${Prisma.join(statementIds)})` : null;
  // DECIMAL(18,2), not a string, so the comparison with the money columns is exact.
  const minFilter = minAmount === null ? Prisma.empty : Prisma.sql`AND (t.debit >= CAST(${minAmount} AS DECIMAL(18,2)) OR t.credit >= CAST(${minAmount} AS DECIMAL(18,2)))`;
  const groupRows = inStatements
    ? await prisma.$queryRaw<GroupRow[]>`
    SELECT t.\`statementId\` AS \`statementId\`, t.debit > 0 AS outgoing,
           t.\`counterpartyName\` AS \`counterpartyName\`, t.\`counterpartyPhone\` AS \`counterpartyPhone\`, t.\`counterpartyAccount\` AS \`counterpartyAccount\`,
           CASE WHEN COALESCE(t.\`counterpartyName\`, '') = '' AND COALESCE(t.\`counterpartyPhone\`, '') = '' AND COALESCE(t.\`counterpartyAccount\`, '') = ''
                THEN LEFT(t.description, 40) END AS description,
           l.\`targetId\` AS \`linkTargetId\`, l.\`targetLabel\` AS \`linkTargetLabel\`,
           CAST(SUM(t.debit) AS CHAR) AS debit, CAST(SUM(t.credit) AS CHAR) AS credit, COUNT(*) AS count,
           SUM(CASE WHEN JSON_LENGTH(t.flags) > 0 THEN 1 ELSE 0 END) AS flagged
    FROM \`StatementTransaction\` t
    -- First confirmed link per transaction (earliest review first, unreviewed last). MariaDB has no
    -- LATERAL join, so the links are ranked once in a derived table and joined on rank 1.
    LEFT JOIN (
      SELECT tl.\`transactionId\`, tl.\`targetId\`, tl.\`targetLabel\`,
             ROW_NUMBER() OVER (PARTITION BY tl.\`transactionId\` ORDER BY tl.\`reviewedAt\` IS NULL, tl.\`reviewedAt\`, tl.id) AS rn
      FROM \`TransactionLink\` tl
      JOIN \`StatementTransaction\` t ON t.id = tl.\`transactionId\`
      WHERE tl.status = 'CONFIRMED' AND ${inStatements}
    ) l ON l.\`transactionId\` = t.id AND l.rn = 1
    WHERE ${inStatements} AND NOT t.excluded ${minFilter}
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
    ORDER BY MIN(t.\`rowNumber\`), 1, 2`
    : [];
  const dayRows = inStatements
    ? await prisma.$queryRaw<DayRow[]>`
    SELECT DATE_FORMAT(t.\`txnDate\`, '%Y-%m-%d') AS date, CAST(SUM(t.credit) AS CHAR) AS inflow, CAST(SUM(t.debit) AS CHAR) AS outflow, COUNT(*) AS count
    FROM \`StatementTransaction\` t
    WHERE ${inStatements} AND NOT t.excluded ${minFilter}
    GROUP BY 1 ORDER BY 1`
    : [];
  // MariaDB returns COUNT/SUM of integers as BigInt and comparisons as 0/1.
  const groups = groupRows.map((g) => ({ ...g, outgoing: Boolean(Number(g.outgoing)), count: Number(g.count), flagged: Number(g.flagged) }));
  const days = dayRows.map((d) => ({ ...d, count: Number(d.count) }));

  const owners = Object.fromEntries(statements.map((s) => [s.id, s]));
  // One aggregated "transaction" per group; `count` carries how many real transactions it stands for.
  const txns = groups.map((g, i) => {
    const s = owners[g.statementId]!;
    return {
      id: `g${i}`,
      statementId: g.statementId,
      txnDate: new Date(0),
      reference: null,
      description: g.description ?? "",
      debit: g.outgoing ? g.debit : "0",
      credit: g.outgoing ? "0" : g.credit,
      counterpartyName: g.counterpartyName,
      counterpartyPhone: g.counterpartyPhone,
      counterpartyAccount: g.counterpartyAccount,
      ownerKey: ctx.statementOwner[s.id] ?? s.id,
      ownerLabel: s.ownerName,
      count: g.count,
      flagged: g.flagged,
      confirmed: g.linkTargetId ? { targetId: g.linkTargetId, targetLabel: g.linkTargetLabel ?? "" } : undefined,
    };
  });
  const entityName = new Map(ctx.entities.map((e) => [e.id, e.name]));
  const resolve = entityResolver(ctx.entities);
  const resolved = new Map(txns.map((t) => [t.id, resolve(t)]));
  const labelFor = (t: Txn & { confirmed?: { targetId: string; targetLabel: string } }) => {
    if (t.confirmed) return { key: t.confirmed.targetId, label: t.confirmed.targetLabel };
    const e = resolved.get(t.id);
    if (e) return { key: e.id, label: entityName.get(e.id) ?? e.name };
    const k = counterpartyKey(t) ?? `desc:${t.description.slice(0, 30)}`;
    return { key: k, label: t.counterpartyName ?? t.counterpartyAccount ?? t.counterpartyPhone ?? t.description.slice(0, 40) };
  };
  const flows = aggregateFlows(txns, labelFor);

  // Counterparty summary.
  const cps = new Map<string, { key: string; label: string; inflow: ReturnType<typeof money>; outflow: ReturnType<typeof money>; count: number; flagged: number; known: boolean }>();
  for (const t of txns) {
    const l = labelFor(t);
    const e = cps.get(l.key) ?? { key: l.key, label: l.label, inflow: money(0), outflow: money(0), count: 0, flagged: 0, known: Boolean(t.confirmed) || Boolean(resolved.get(t.id)) };
    e.inflow = e.inflow.plus(t.credit);
    e.outflow = e.outflow.plus(t.debit);
    e.count += t.count;
    e.flagged += t.flagged;
    cps.set(l.key, e);
  }
  const transactionCount = groups.reduce((n, g) => n + g.count, 0);
  const ownerNodes = flows.nodes.filter((n) => n.kind === "OWNER").sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  const topCounterparties = [...cps.values()].sort((a, b) => b.inflow.plus(b.outflow).comparedTo(a.inflow.plus(a.outflow))).slice(0, 25);
  const edgeTotal = new Map(flows.edges.map((e) => [`${e.from}→${e.to}`, e.total]));
  const matrix = ownerNodes.map((o) => ({
    owner: o.label,
    ownerId: o.id,
    cells: topCounterparties.map((c) => {
      return { counterparty: c.label, out: edgeTotal.get(`${o.id}→${c.key}`) ?? "0.00", in: edgeTotal.get(`${c.key}→${o.id}`) ?? "0.00" };
    }),
  }));
  await audit({ action: "statements.money_movement.view", actorId: user.id, actorLabel: user.username, caseId, details: { transactions: transactionCount } });
  return {
    notice: "Automated analysis produces investigative leads that require human verification. It is not proof.",
    transactionCount,
    totals: { inflow: toDbString(sum(txns.map((t) => t.credit))), outflow: toDbString(sum(txns.map((t) => t.debit))) },
    nodes: flows.nodes,
    edges: flows.edges,
    matrix: { counterparties: topCounterparties.map((c) => c.label), rows: matrix },
    timeline: days.map((d) => ({ date: d.date, inflow: money(d.inflow).toFixed(2), outflow: money(d.outflow).toFixed(2), count: d.count })),
    counterparties: [...cps.values()].sort((a, b) => b.inflow.plus(b.outflow).comparedTo(a.inflow.plus(a.outflow))).map((c) => ({ ...c, inflow: c.inflow.toFixed(2), outflow: c.outflow.toFixed(2) })),
  };
}
