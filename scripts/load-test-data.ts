/**
 * Loads a large, clearly fictional dataset into the dedicated sims_perf database for performance
 * testing. It recreates sims_perf, applies every migration, runs the normal seed, then bulk-inserts:
 *
 *   cases 5,000 · parties 15,000 · invoices 100,000 · tasks 10,000 · case assignments 5,500
 *   statements 10 × 10,000 transactions (real CSV originals stored) · audit entries 200,000
 *
 * and runs the statement analysis for the statement case (timed). `--scale 0.1` loads a tenth.
 * Every row is marked isDemo and every name says "fictional". Development data is never touched.
 *
 *   npm run load-data -- [--scale 1]
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { createPrismaClient } from "../src/server/prisma-client";
import { PERF, perfAdminUrl, perfDatabaseUrl, applyPerfEnvironment } from "./perf-env";

const root = path.resolve(__dirname, "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const scale = Number(arg("scale") ?? "1");
if (!(scale > 0 && scale <= 5)) throw new Error("--scale must be between 0 and 5.");
const n = (base: number) => Math.max(1, Math.round(base * scale));

const COUNTS = { cases: n(5000), partiesPerCase: 3, invoicesPerCase: 20, tasksPerCase: 2, statements: 10, txnsPerStatement: n(10000), audit: n(200000) };

// Deterministic pseudo-random numbers so runs are comparable.
let seed = 20260930;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const amount = (lo: number, hi: number) => (int(lo * 100, hi * 100) / 100).toFixed(2);
const day = (from: Date, spanDays: number) => new Date(from.getTime() + int(0, spanDays) * 86_400_000);
const pad = (v: number, w: number) => String(v).padStart(w, "0");

const FIRST = [
  "Achieng",
  "Baraka",
  "Chebet",
  "Daudi",
  "Esther",
  "Faraji",
  "Gathoni",
  "Hamisi",
  "Imani",
  "Juma",
  "Kamau",
  "Lela",
  "Mwangi",
  "Nafula",
  "Otieno",
  "Pendo",
  "Rehema",
  "Sifa",
  "Tumaini",
  "Wanjiru",
];
const LAST = ["Ochieng", "Mutua", "Kiprono", "Wafula", "Njoroge", "Akinyi", "Barasa", "Karanja", "Omondi", "Chege"];
const person = () => `${pick(FIRST)} ${pick(LAST)} (fictional)`;

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const out = await fn();
  console.log(`  ${label}: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return out;
}

async function inBatches<T>(rows: T[], size: number, insert: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

async function recreateDatabase() {
  const url = new URL(perfDatabaseUrl());
  if (url.pathname !== `/${PERF.database}`) throw new Error(`Refusing to recreate ${url.pathname}.`);
  const admin = createPrismaClient(perfAdminUrl());
  try {
    // MariaDB has no DROP DATABASE … WITH (FORCE): the drop waits for open connections, so stop
    // any dev server or worker using sims_perf first. The name is the fixed PERF.database constant.
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${PERF.database}\``);
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${PERF.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.$disconnect();
  }
  await rm(PERF.storage, { recursive: true, force: true });
  const env = {
    ...process.env,
    DATABASE_URL: perfDatabaseUrl(),
    STORAGE_DIR: PERF.storage,
    DEMO_MODE: "true",
    DEMO_ADMIN_PASSWORD: PERF.password,
    DEMO_USERS_PASSWORD: PERF.password,
    SEED_RESET_DEMO_ADMIN: "true",
  };
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("node --conditions=react-server --import tsx prisma/seed.ts", { cwd: root, env, stdio: "pipe" });
}

async function main() {
  console.log(`Loading the fictional performance dataset into ${PERF.database} (scale ${scale}).`);
  await time("recreate, migrate and seed", recreateDatabase);
  applyPerfEnvironment();
  const { prisma } = await import("@/server/db");
  const { storeFile } = await import("@/server/storage");
  const { analyseCase } = await import("@/server/statements/service");
  const { formatCaseRef, formatStatementRef, formatTaskRef, referenceYear, counterKeys } = await import("@/lib/references");

  // The seeded administrator starts with a temporary password; in this throwaway database the
  // performance run signs in with the fictional password directly.
  
  const lead = await prisma.user.findUniqueOrThrow({ where: { username: "lead.demo" }, include: { scopes: true } });
  const investigator = await prisma.user.findUniqueOrThrow({ where: { username: "investigator.demo" } });
  const companyIds = lead.scopes.map((s) => s.companyId);
  const branches = await prisma.branch.findMany({ where: { companyId: { in: companyIds } }, select: { id: true, companyId: true } });
  const year = referenceYear();

  /** Reserves a block of sequence numbers so later references created by the app never collide. */
  async function reserve(key: string, count: number): Promise<number> {
    // Same pattern as nextSequence (src/server/references.ts): MariaDB has no RETURNING here, so the
    // upsert and the read share one transaction, which holds the row lock between them.
    const value = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO \`ReferenceCounter\` (\`key\`, \`value\`, \`updatedAt\`) VALUES (${key}, ${count}, UTC_TIMESTAMP(3))
        ON DUPLICATE KEY UPDATE \`value\` = \`value\` + ${count}, \`updatedAt\` = UTC_TIMESTAMP(3)`;
      const rows = await tx.$queryRaw<{ value: number | bigint }[]>`SELECT \`value\` FROM \`ReferenceCounter\` WHERE \`key\` = ${key}`;
      return Number(rows[0]!.value);
    });
    return value - count + 1;
  }

  // ── Cases ──
  const firstCase = await reserve(counterKeys.case(year), COUNTS.cases + 1);
  const categories = ["INVOICE_IRREGULARITY", "BAD_CHEQUE", "FINANCIAL_MISCONDUCT", "CUSTOMER_DEBT", "CASH_MISAPPROPRIATION", "STOCK_LOSS", "PROCUREMENT_FRAUD"] as const;
  const statuses = ["PRELIMINARY_REVIEW", "UNDER_INTERNAL_INVESTIGATION", "AWAITING_DOCUMENTS", "AWAITING_INTERVIEW", "AWAITING_MANAGEMENT_DECISION", "RECOVERY_MONITORING", "CLOSED"] as const;
  const stages = ["INTAKE", "PLANNING", "EVIDENCE_GATHERING", "INTERVIEWS", "ANALYSIS", "REPORTING", "ACTION", "MONITORING"] as const;
  const opened = new Date(Date.UTC(year - 2, 0, 1));
  const cases: Prisma.CaseCreateManyInput[] = [];
  for (let i = 0; i < COUNTS.cases + 1; i++) {
    const companyId = pick(companyIds);
    const branch = branches.filter((b) => b.companyId === companyId);
    const status = i === 0 ? "UNDER_INTERNAL_INVESTIGATION" : pick(statuses);
    const gross = amount(50_000, 25_000_000);
    cases.push({
      reference: formatCaseRef(year, firstCase + i),
      title: i === 0 ? "Load test: statement analysis case (fictional)" : `Load test case ${pad(i, 5)} — ${pick(categories).toLowerCase().replace(/_/g, " ")} involving ${person()}`,
      companyId,
      branchId: branch.length ? pick(branch).id : null,
      category: i === 0 ? "FINANCIAL_MISCONDUCT" : pick(categories),
      status,
      stage: status === "CLOSED" ? "CONCLUDED" : pick(stages),
      priority: pick(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const),
      confidentiality: pick(["STANDARD", "CONFIDENTIAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"] as const),
      openedAt: day(opened, 700),
      grossAmount: gross,
      amountConfirmedRecoverable: amount(0, Number(gross) / 2),
      leadInvestigatorId: lead.id,
      createdById: lead.id,
      isDemo: true,
      description: "Fictional performance-test record. Not a real investigation.",
    });
  }
  await time(`${cases.length} cases`, () => inBatches(cases, 2000, (b) => prisma.case.createMany({ data: b })));
  const caseRows = await prisma.case.findMany({ where: { reference: { in: cases.map((c) => c.reference) } }, select: { id: true, reference: true, title: true } });
  const statementCase = caseRows.find((c) => c.title.startsWith("Load test: statement"))!;

  await time("case assignments", async () => {
    const rows: Prisma.CaseAssignmentCreateManyInput[] = caseRows.map((c) => ({ caseId: c.id, userId: lead.id, role: "LEAD", assignedById: lead.id }));
    for (const c of caseRows) if (rand() < 0.1) rows.push({ caseId: c.id, userId: investigator.id, role: "SUPPORTING", assignedById: lead.id });
    await inBatches(rows, 5000, (b) => prisma.caseAssignment.createMany({ data: b }));
  });

  // ── Parties, invoices, tasks ──
  const phones = Array.from({ length: 200 }, (_, i) => `07${pad(10_000_000 + i * 3571, 8)}`);
  await time(`${caseRows.length * COUNTS.partiesPerCase} parties`, async () => {
    const rows: Prisma.PartyCreateManyInput[] = [];
    for (const c of caseRows)
      for (let p = 0; p < COUNTS.partiesPerCase; p++)
        rows.push({ caseId: c.id, role: pick(["PERSON_OF_INTEREST", "WITNESS", "CUSTOMER", "EMPLOYEE"] as const), name: person(), telephone: pick(phones), createdById: lead.id, isDemo: true });
    await inBatches(rows, 5000, (b) => prisma.party.createMany({ data: b }));
  });
  await time(`${caseRows.length * COUNTS.invoicesPerCase} invoices`, async () => {
    const rows: Prisma.InvoiceCreateManyInput[] = [];
    let k = 0;
    for (const c of caseRows)
      for (let v = 0; v < COUNTS.invoicesPerCase; v++) {
        const total = amount(1_000, 900_000);
        rows.push({
          caseId: c.id,
          invoiceNumber: `INV-LOAD-${pad(++k, 7)}`,
          invoiceDate: day(opened, 700),
          customerName: `Fictional Customer ${pad(int(1, 3000), 4)} Ltd`,
          invoiceAmount: total,
          amountPaid: amount(0, Number(total)),
          classification: pick(["VALID_BUT_UNPAID", "DISPUTED", "NO_PROOF_OF_DELIVERY", "REQUIRES_FURTHER_INVESTIGATION"] as const),
          createdById: lead.id,
          isDemo: true,
        });
      }
    await inBatches(rows, 5000, (b) => prisma.invoice.createMany({ data: b }));
  });
  await time(`${caseRows.length * COUNTS.tasksPerCase} tasks`, async () => {
    const rows: Prisma.TaskCreateManyInput[] = [];
    const counters: Prisma.ReferenceCounterCreateManyInput[] = [];
    for (const c of caseRows) {
      for (let t = 1; t <= COUNTS.tasksPerCase; t++)
        rows.push({
          reference: formatTaskRef(c.reference, t),
          caseId: c.id,
          title: pick(["Obtain bank statements", "Interview the branch accountant", "Collect delivery notes", "Follow up the police file", "Verify customer balance"]),
          status: pick(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const),
          dueDate: day(new Date(), 90),
          assigneeId: lead.id,
          createdById: lead.id,
          isDemo: true,
        });
      counters.push({ key: counterKeys.task(c.id), value: COUNTS.tasksPerCase });
    }
    await inBatches(rows, 5000, (b) => prisma.task.createMany({ data: b }));
    await inBatches(counters, 5000, (b) => prisma.referenceCounter.createMany({ data: b }));
  });

  // ── Statements with real stored originals ──
  const owners = Array.from({ length: COUNTS.statements }, () => person());
  const firstStatement = await reserve(counterKeys.statement(year), COUNTS.statements);
  const counterparties = Array.from({ length: 300 }, (_, i) => ({ name: i < 200 ? person() : owners[i % owners.length]!, phone: i < 200 ? phones[i]! : null }));
  await time(`${COUNTS.statements} statements × ${COUNTS.txnsPerStatement} transactions`, async () => {
    for (let s = 0; s < COUNTS.statements; s++) {
      let balance = 250_000;
      const txns: Prisma.StatementTransactionCreateManyInput[] = [];
      const csv = ["Receipt No,Completion Time,Details,Paid In,Withdrawn,Balance"];
      const start = new Date(Date.UTC(year - 1, 0, 1));
      for (let r = 1; r <= COUNTS.txnsPerStatement; r++) {
        const cp = pick(counterparties);
        const out = rand() < 0.55;
        const value = rand() < 0.2 ? String(int(1, 50) * 1000) + ".00" : amount(50, 150_000);
        balance += out ? -Number(value) : Number(value);
        const when = new Date(start.getTime() + r * 50 * 60_000);
        const description = out ? `Customer Transfer to ${cp.phone ?? "0700000000"} - ${cp.name}` : `Funds received from ${cp.phone ?? "0700000000"} - ${cp.name}`;
        const reference = `LD${pad(s, 2)}${pad(r, 7)}`;
        txns.push({
          statementId: "",
          rowNumber: r,
          flags: [],
          txnDate: new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate())),
          txnTime: when.toISOString().slice(11, 19),
          reference,
          description,
          debit: out ? value : "0",
          credit: out ? "0" : value,
          balance: balance.toFixed(2),
          counterpartyName: cp.name,
          counterpartyPhone: cp.phone,
          isDemo: true,
        });
        csv.push([reference, when.toISOString().replace("T", " ").slice(0, 19), `"${description}"`, out ? "" : value, out ? value : "", balance.toFixed(2)].join(","));
      }
      const buffer = Buffer.from(csv.join("\n") + "\n", "utf8");
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const originalName = `load-test-mpesa-${pad(s + 1, 2)}-fictional.csv`;
      const file = await storeFile(prisma, { buffer, originalName, mimeType: "text/csv", sha256, uploadedById: lead.id });
      const statement = await prisma.financialStatement.create({
        data: {
          reference: formatStatementRef(year, firstStatement + s),
          caseId: statementCase.id,
          ownerName: owners[s]!,
          institutionType: "MPESA",
          institution: "Safaricom M-Pesa",
          maskedAccount: `07******${pad(s, 2)}`,
          processingAuthority: "Fictional performance test data",
          format: "CSV",
          originalFileId: file.id,
          originalFilename: originalName,
          sha256,
          uploadedById: lead.id,
          status: "PARSED",
          parserUsed: "load-test-fixture",
          transactionCount: txns.length,
          periodStart: txns[0]!.txnDate as Date,
          periodEnd: txns.at(-1)!.txnDate as Date,
          isDemo: true,
        },
      });
      await inBatches(
        txns.map((t) => ({ ...t, statementId: statement.id })),
        5000,
        (b) => prisma.statementTransaction.createMany({ data: b }),
      );
    }
  });
  await time("parties for statement matching", () =>
    prisma.party.createMany({
      data: counterparties.slice(0, 40).map((cp) => ({ caseId: statementCase.id, role: "PERSON_OF_INTEREST" as const, name: cp.name, telephone: cp.phone, createdById: lead.id, isDemo: true })),
    }),
  );
  const analysis = await time("statement analysis (flags and link suggestions) for the statement case", () => analyseCase(statementCase.id));
  console.log(`    → ${JSON.stringify(analysis)}`);

  // ── Audit history ──
  await time(`${COUNTS.audit} audit entries`, async () => {
    const actions = ["cases.view", "invoices.create", "evidence.view", "cases.update", "statements.view", "reports.generate", "auth.login"];
    const rows: Prisma.AuditLogCreateManyInput[] = [];
    const since = Date.now() - 400 * 86_400_000;
    for (let i = 0; i < COUNTS.audit; i++) {
      const c = pick(caseRows);
      rows.push({
        at: new Date(since + Math.floor(rand() * 400 * 86_400_000)),
        actorId: lead.id,
        actorLabel: lead.username,
        action: pick(actions),
        entityType: "case",
        entityId: c.id,
        caseId: c.id,
        details: { fictional: true },
      });
    }
    await inBatches(rows, 10_000, (b) => prisma.auditLog.createMany({ data: b }));
  });

  await time("ANALYZE TABLE", async () => {
    // MariaDB analyses named tables only; the names come from SHOW TABLES, not from input.
    const tables = (await prisma.$queryRawUnsafe<Record<string, string>[]>("SHOW TABLES")).map((r) => Object.values(r)[0]!);
    await prisma.$queryRawUnsafe(`ANALYZE TABLE ${tables.map((t) => `\`${t}\``).join(", ")}`);
  });
  const totals = {
    cases: await prisma.case.count(),
    parties: await prisma.party.count(),
    invoices: await prisma.invoice.count(),
    tasks: await prisma.task.count(),
    statementTransactions: await prisma.statementTransaction.count(),
    transactionLinks: await prisma.transactionLink.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log("Totals:", totals);
  console.log(`Statement case: ${statementCase.reference} (${statementCase.id}). Accounts use the fictional password in scripts/perf-env.ts.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
