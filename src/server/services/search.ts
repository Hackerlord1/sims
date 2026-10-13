import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { caseVisibilityWhere } from "@/server/authz";
import type { CurrentUser } from "@/server/auth/principal";
import { canSeeSensitiveIdentifiers, can, visibleLevels } from "@/lib/permissions";
import { maskAccount, maskPhone, normalisePhone } from "@/lib/masking";
import { isMoneyText, toDbString } from "@/lib/money";
import { parseDateInput } from "@/lib/resources/schema";

export const SEARCH_TYPES = ["cases", "parties", "invoices", "cheques", "criminal", "civil", "transactions", "accounts"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export interface SearchHit {
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  reference: string | null;
  caseId: string;
  href: string;
}

const LIMIT = 10;
// Case-insensitive: every text column uses the utf8mb4_unicode_ci collation, so LIKE ignores case.
const ci = (q: string) => ({ contains: q });

export async function search(user: CurrentUser, input: { q: string; types?: SearchType[]; from?: string; to?: string }) {
  const q = input.q.trim();
  const types = new Set(input.types?.length ? input.types : SEARCH_TYPES);
  const from = input.from ? parseDateInput(input.from) : null;
  const to = input.to ? parseDateInput(input.to) : null;
  const range = (field: string) => (from || to ? { [field]: { ...(from ? { gte: from } : {}), ...(to ? { lte: new Date(to.getTime() + 86_399_999) } : {}) } } : {});
  const amount = isMoneyText(q.replace(/^kes\s*/i, "")) ? toDbString(q.replace(/^kes\s*/i, "").replace(/,/g, "")) : null;
  const phone = /^[+\d\s-]{7,}$/.test(q) ? normalisePhone(q) : null;
  const sensitive = canSeeSensitiveIdentifiers(user);
  const vis = (m: Parameters<typeof caseVisibilityWhere>[1]) => ({ AND: [caseVisibilityWhere(user, m), { isDeleted: false }] });
  const tasks: Promise<SearchHit[]>[] = [];

  if (types.has("cases") && can(user, "CASES", "VIEW")) {
    tasks.push(
      prisma.case
        .findMany({
          where: {
            AND: [
              vis("CASES"),
              range("openedAt"),
              { OR: [{ reference: ci(q) }, { title: ci(q) }, { location: ci(q) }, { businessUnit: ci(q) }, ...(amount ? [{ grossAmount: amount }, { amountConfirmedRecoverable: amount }] : [])] },
            ],
          },
          take: LIMIT,
          orderBy: { openedAt: "desc" },
          select: { id: true, reference: true, title: true, status: true, location: true },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "cases" as const,
            id: r.id,
            title: r.title,
            subtitle: [r.status.replace(/_/g, " ").toLowerCase(), r.location].filter(Boolean).join(" · "),
            reference: r.reference,
            caseId: r.id,
            href: `/cases/${r.id}`,
          })),
        ),
    );
  }
  if (types.has("parties") && can(user, "PARTIES", "VIEW")) {
    tasks.push(
      prisma.party
        .findMany({
          where: {
            AND: [
              { isDeleted: false, case: vis("PARTIES"), accessClassification: { in: visibleLevels(user) } },
              {
                OR: [
                  { name: ci(q) },
                  { organisation: ci(q) },
                  { customerCode: ci(q) },
                  { employeeNumber: ci(q) },
                  ...(phone ? [{ telephone: { contains: phone.slice(-9) } }] : []),
                  ...(sensitive ? [{ idNumber: ci(q) }] : []),
                ],
              },
            ],
          },
          take: LIMIT,
          select: { id: true, name: true, role: true, telephone: true, caseId: true, case: { select: { reference: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "parties" as const,
            id: r.id,
            title: r.name,
            subtitle: `${r.role.replace(/_/g, " ").toLowerCase()}${r.telephone ? " · " + (sensitive ? r.telephone : maskPhone(r.telephone)) : ""}`,
            reference: r.case.reference,
            caseId: r.caseId,
            href: `/cases/${r.caseId}?tab=parties`,
          })),
        ),
    );
  }
  if (types.has("invoices") && can(user, "INVOICES", "VIEW")) {
    tasks.push(
      prisma.invoice
        .findMany({
          where: {
            AND: [
              { isDeleted: false, case: vis("INVOICES") },
              range("invoiceDate"),
              {
                OR: [
                  { invoiceNumber: ci(q) },
                  { customerName: ci(q) },
                  { customerCode: ci(q) },
                  { deliveryNoteNumber: ci(q) },
                  { salesLocation: ci(q) },
                  ...(amount ? [{ invoiceAmount: amount }] : []),
                ],
              },
            ],
          },
          take: LIMIT,
          select: { id: true, invoiceNumber: true, customerName: true, invoiceAmount: true, caseId: true, case: { select: { reference: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "invoices" as const,
            id: r.id,
            title: `Invoice ${r.invoiceNumber}`,
            subtitle: `${r.customerName} · KES ${r.invoiceAmount.toFixed(2)}`,
            reference: r.case.reference,
            caseId: r.caseId,
            href: `/cases/${r.caseId}?tab=invoices`,
          })),
        ),
    );
  }
  if (types.has("cheques") && can(user, "CHEQUES", "VIEW")) {
    tasks.push(
      prisma.cheque
        .findMany({
          where: {
            AND: [
              { isDeleted: false, case: vis("CHEQUES") },
              range("chequeDate"),
              { OR: [{ chequeNumber: ci(q) }, { issuer: ci(q) }, { bankReturnReference: ci(q) }, { accountName: ci(q) }, ...(amount ? [{ amount }] : [])] },
            ],
          },
          take: LIMIT,
          select: { id: true, chequeNumber: true, bank: true, issuer: true, amount: true, caseId: true, case: { select: { reference: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "cheques" as const,
            id: r.id,
            title: `Cheque ${r.chequeNumber}`,
            subtitle: `${r.bank} · ${r.issuer} · KES ${r.amount.toFixed(2)}`,
            reference: r.case.reference,
            caseId: r.caseId,
            href: `/cases/${r.caseId}?tab=cheques`,
          })),
        ),
    );
  }
  if (types.has("criminal") && can(user, "CRIMINAL", "VIEW")) {
    tasks.push(
      prisma.criminalMatter
        .findMany({
          where: {
            AND: [
              { isDeleted: false, case: vis("CRIMINAL") },
              { OR: [{ obNumber: ci(q) }, { policeStation: ci(q) }, { investigatingOfficer: ci(q) }, { policeReference: ci(q) }, { courtCaseNumber: ci(q) }, { town: ci(q) }, { county: ci(q) }] },
            ],
          },
          take: LIMIT,
          select: { id: true, obNumber: true, policeStation: true, investigatingOfficer: true, caseId: true, case: { select: { reference: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "criminal" as const,
            id: r.id,
            title: r.obNumber ? `OB ${r.obNumber}` : r.policeStation,
            subtitle: [r.policeStation, r.investigatingOfficer].filter(Boolean).join(" · "),
            reference: r.case.reference,
            caseId: r.caseId,
            href: `/cases/${r.caseId}?tab=criminal`,
          })),
        ),
    );
  }
  if (types.has("civil") && can(user, "CIVIL", "VIEW")) {
    tasks.push(
      prisma.civilMatter
        .findMany({
          where: {
            AND: [
              { isDeleted: false, case: vis("CIVIL") },
              {
                OR: [
                  { courtCaseNumber: ci(q) },
                  { advocate: ci(q) },
                  { legalFirm: ci(q) },
                  { defendant: ci(q) },
                  { court: ci(q) },
                  { courtStation: ci(q) },
                  ...(amount ? [{ amountClaimed: amount }] : []),
                ],
              },
            ],
          },
          take: LIMIT,
          select: { id: true, courtCaseNumber: true, advocate: true, legalFirm: true, caseId: true, case: { select: { reference: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "civil" as const,
            id: r.id,
            title: r.courtCaseNumber ? `Court case ${r.courtCaseNumber}` : `${r.legalFirm}`,
            subtitle: `${r.advocate} · ${r.legalFirm}`,
            reference: r.case.reference,
            caseId: r.caseId,
            href: `/cases/${r.caseId}?tab=civil`,
          })),
        ),
    );
  }
  if (types.has("transactions") && can(user, "STATEMENTS", "VIEW")) {
    const or: Prisma.StatementTransactionWhereInput[] = [{ reference: ci(q) }, { counterpartyName: ci(q) }];
    if (phone) or.push({ counterpartyPhone: { contains: phone.slice(-9) } });
    if (/^\d{6,}$/.test(q)) or.push({ counterpartyAccount: q });
    if (amount) or.push({ debit: amount }, { credit: amount });
    tasks.push(
      prisma.statementTransaction
        .findMany({
          where: { AND: [{ excluded: false, statement: { isDeleted: false, case: vis("STATEMENTS") } }, range("txnDate"), { OR: or }] },
          take: LIMIT,
          orderBy: { txnDate: "desc" },
          select: {
            id: true,
            reference: true,
            description: true,
            debit: true,
            credit: true,
            txnDate: true,
            counterpartyPhone: true,
            statementId: true,
            statement: { select: { caseId: true, case: { select: { reference: true } } } },
          },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "transactions" as const,
            id: r.id,
            title: `${r.reference ?? "Transaction"} · ${r.txnDate.toISOString().slice(0, 10)}`,
            subtitle: `${r.description.slice(0, 80)} · ${r.debit.greaterThan(0) ? "out " + r.debit.toFixed(2) : "in " + r.credit.toFixed(2)}${r.counterpartyPhone ? " · " + (sensitive ? r.counterpartyPhone : maskPhone(r.counterpartyPhone)) : ""}`,
            reference: r.statement.case.reference,
            caseId: r.statement.caseId,
            href: `/statements/${r.statementId}`,
          })),
        ),
    );
  }
  if (types.has("accounts") && can(user, "STATEMENTS", "VIEW")) {
    tasks.push(
      prisma.knownAccount
        .findMany({
          where: {
            AND: [{ isDeleted: false, case: vis("STATEMENTS") }, { OR: [{ holderName: ci(q) }, { accountRef: { contains: q } }, ...(phone ? [{ telephone: { contains: phone.slice(-9) } }] : [])] }],
          },
          take: LIMIT,
          select: { id: true, holderName: true, institution: true, accountRef: true, caseId: true, case: { select: { reference: true } } },
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "accounts" as const,
            id: r.id,
            title: r.holderName,
            subtitle: [r.institution, sensitive ? r.accountRef : maskAccount(r.accountRef)].filter(Boolean).join(" · "),
            reference: r.case.reference,
            caseId: r.caseId,
            href: `/cases/${r.caseId}?tab=analysis`,
          })),
        ),
    );
  }
  const results = (await Promise.all(tasks)).flat();
  // The query text itself is not logged: it may contain personal data such as phone numbers.
  await audit({ action: "search", actorId: user.id, actorLabel: user.username, details: { types: [...types], results: results.length, dateFilter: Boolean(from || to) } });
  return results;
}
