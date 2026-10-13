/**
 * Measures API response times against the fictional sims_perf dataset (load it first with
 * `npm run load-data`). Requests go through the real API router — session, CSRF, validation,
 * permission checks, row scoping and the database — in-process, so HTTP/TLS overhead is excluded.
 * Each scenario runs warm-up requests, then timed ones; p50/p95 are compared with budgets.
 * Results are printed and written to docs/performance-results.md. Exits 1 if a budget is missed.
 *
 *   npm run perf
 */
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PERF, applyPerfEnvironment } from "./perf-env";

interface Scenario {
  name: string;
  as: "lead" | "admin";
  method?: "GET" | "POST";
  url: string;
  body?: unknown;
  budgetP95Ms: number;
  runs?: number;
  /** Expected HTTP status when it is not a success (e.g. a limit being enforced). */
  expectStatus?: number;
}

const BASE = "http://127.0.0.1";

async function main() {
  applyPerfEnvironment();
  const { prisma } = await import("@/server/db");
  const { apiRouter } = await import("@/server/api");

  const statementCase = await prisma.case.findFirst({ where: { title: { startsWith: "Load test: statement" } }, select: { id: true, reference: true } });
  if (!statementCase) throw new Error("The performance dataset is missing. Run `npm run load-data` first.");
  const statement = await prisma.financialStatement.findFirstOrThrow({ where: { caseId: statementCase.id }, orderBy: { reference: "asc" }, select: { id: true } });
  const statementCount = await prisma.financialStatement.count({ where: { caseId: statementCase.id } });
  const disputed = await prisma.invoice.count({ where: { classification: "DISPUTED", isDeleted: false } });
  const midCase = await prisma.case.findFirstOrThrow({ where: { title: { startsWith: "Load test case 02500" } }, select: { id: true } });
  const totals = {
    cases: await prisma.case.count(),
    invoices: await prisma.invoice.count(),
    parties: await prisma.party.count(),
    tasks: await prisma.task.count(),
    statementTransactions: await prisma.statementTransaction.count(),
    transactionLinks: await prisma.transactionLink.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  let ip = 1;
  async function signIn(username: string) {
    const res = await apiRouter.dispatch(
      new Request(`${BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sims-csrf": "1", "x-forwarded-for": `10.77.0.${ip++}` },
        body: JSON.stringify({ identifier: username, password: PERF.password }),
      }),
    );
    if (res.status !== 200) throw new Error(`Sign-in failed for ${username}: ${res.status} ${await res.text()}`);
    return res.headers.get("set-cookie")!.split(";")[0]!;
  }
  const cookies = { lead: await signIn("lead.demo"), admin: await signIn("felix") };

  const scenarios: Scenario[] = [
    { name: "Case list, first page", as: "lead", url: "/cases?page=1&pageSize=25", budgetP95Ms: 500 },
    { name: "Case list, page 150 sorted by reference", as: "lead", url: "/cases?page=150&pageSize=25&sort=reference&order=desc", budgetP95Ms: 700 },
    { name: "Case list, text search", as: "lead", url: "/cases?q=Wanjiru&pageSize=25", budgetP95Ms: 800 },
    { name: "Case file summary (financial figures)", as: "lead", url: `/cases/${midCase.id}/summary`, budgetP95Ms: 500 },
    { name: "Case invoices tab", as: "lead", url: `/invoices?caseId=${midCase.id}&page=1&pageSize=25`, budgetP95Ms: 400 },
    { name: "Invoice register (all cases), first page", as: "lead", url: "/invoices?page=1&pageSize=50", budgetP95Ms: 700 },
    { name: "Invoice register, invoice-number search", as: "lead", url: "/invoices?q=INV-LOAD-0099&pageSize=50", budgetP95Ms: 800 },
    { name: "Task register, first page", as: "lead", url: "/tasks?page=1&pageSize=50", budgetP95Ms: 700 },
    { name: "Dashboard", as: "lead", url: "/dashboard", budgetP95Ms: 1500 },
    { name: "Global search", as: "lead", url: "/search?q=Otieno", budgetP95Ms: 1500 },
    { name: "Statement transactions, first page", as: "lead", url: `/financial-statements/${statement.id}/transactions?page=1&pageSize=100`, budgetP95Ms: 600 },
    { name: "Statement transactions, flag filter", as: "lead", url: `/financial-statements/${statement.id}/transactions?page=1&pageSize=100&flag=ROUND_FIGURE`, budgetP95Ms: 1000 },
    { name: "Statement suggested links", as: "lead", url: `/financial-statements/${statement.id}/links?status=SUGGESTED&page=1&pageSize=50`, budgetP95Ms: 600 },
    { name: "Statement overview (totals and flag counts)", as: "lead", url: `/financial-statements/${statement.id}/overview`, budgetP95Ms: 1000 },
    { name: "Money movement (all statements of the case)", as: "lead", url: `/cases/${statementCase.id}/money-movement`, budgetP95Ms: 4000, runs: 8 },
    { name: "Statement transaction schedule export (10,000 rows, CSV)", as: "lead", url: `/financial-statements/${statement.id}/export?format=csv`, budgetP95Ms: 5000, runs: 5 },
    { name: "Audit log, first page", as: "admin", url: "/audit-logs?page=1&pageSize=50", budgetP95Ms: 800 },
    { name: "Audit log, filtered by case", as: "admin", url: `/audit-logs?caseId=${midCase.id}&page=1&pageSize=50`, budgetP95Ms: 800 },
    { name: "Export one case's invoices (CSV)", as: "lead", method: "POST", url: "/export/invoices", body: { format: "csv", filter: { caseId: midCase.id } }, budgetP95Ms: 1500, runs: 8 },
    {
      name: `Export ${disputed.toLocaleString("en")} disputed invoices (CSV)`,
      as: "admin",
      method: "POST",
      url: "/export/invoices",
      body: { format: "csv", filter: { filters: { classification: "DISPUTED" } } },
      budgetP95Ms: 20_000,
      runs: 3,
    },
    {
      name: `Export refused above the 50,000-row cap (${totals.invoices.toLocaleString("en")} rows)`,
      as: "admin",
      method: "POST",
      url: "/export/invoices",
      body: { format: "csv" },
      expectStatus: 400,
      budgetP95Ms: 1000,
      runs: 5,
    },
  ];

  const results: { s: Scenario; p50: number; p95: number; max: number; bytes: number; ok: boolean }[] = [];
  for (const s of scenarios) {
    const runs = s.runs ?? 15;
    const times: number[] = [];
    let bytes = 0;
    for (let i = -2; i < runs; i++) {
      const t = performance.now();
      const res = await apiRouter.dispatch(
        new Request(`${BASE}/api/v1${s.url}`, {
          method: s.method ?? "GET",
          headers: { cookie: cookies[s.as], "x-sims-csrf": "1", "x-forwarded-for": `10.78.${results.length}.${(i + 3) % 250}`, ...(s.body ? { "content-type": "application/json" } : {}) },
          body: s.body ? JSON.stringify(s.body) : undefined,
        }),
      );
      const buf = await res.arrayBuffer();
      const ms = performance.now() - t;
      if (s.expectStatus ? res.status !== s.expectStatus : res.status >= 300) throw new Error(`${s.name}: HTTP ${res.status} ${Buffer.from(buf).toString("utf8").slice(0, 300)}`);
      if (i >= 0) times.push(ms);
      bytes = buf.byteLength;
    }
    times.sort((a, b) => a - b);
    const q = (p: number) => times[Math.min(times.length - 1, Math.ceil((p / 100) * times.length) - 1)]!;
    const r = { s, p50: q(50), p95: q(95), max: times.at(-1)!, bytes, ok: q(95) <= s.budgetP95Ms };
    results.push(r);
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${s.name.padEnd(58)} p50 ${r.p50.toFixed(0).padStart(6)} ms  p95 ${r.p95.toFixed(0).padStart(6)} ms  budget ${s.budgetP95Ms} ms`);
  }

  // Background job: full statement analysis (pattern flags + link suggestions, written in one transaction).
  const { analyseCase } = await import("@/server/statements/service");
  const analysisStarted = performance.now();
  const analysis = await analyseCase(statementCase.id);
  const analysisMs = performance.now() - analysisStarted;
  const analysisBudgetMs = 120_000;
  const analysisOk = analysisMs <= analysisBudgetMs;
  console.log(
    `${analysisOk ? "PASS" : "FAIL"}  Background statement analysis of ${totals.statementTransactions.toLocaleString("en")} transactions: ${(analysisMs / 1000).toFixed(1)} s (budget ${analysisBudgetMs / 1000} s)`,
  );

  const failed = results.filter((r) => !r.ok);
  if (!analysisOk)
    failed.push({ s: { name: "Background statement analysis", as: "lead", url: "", budgetP95Ms: analysisBudgetMs }, p50: analysisMs, p95: analysisMs, max: analysisMs, bytes: 0, ok: false });
  const md = [
    "# Performance results",
    "",
    `Measured ${new Date().toISOString()} with \`npm run perf\` against the fictional \`${PERF.database}\` dataset loaded by \`npm run load-data\`.`,
    "",
    `Machine: ${os.cpus()[0]?.model ?? "unknown CPU"} × ${os.cpus().length}, ${(os.totalmem() / 1024 ** 3).toFixed(0)} GB RAM, ${os.type()} ${os.release()}, Node ${process.version}. MariaDB on the same machine.`,
    "",
    "Requests run through the real API router in-process (session, CSRF, validation, permissions, row scoping, database), so network and TLS time is excluded. Each scenario has two warm-up requests, then 15 timed requests unless stated.",
    "",
    "## Dataset",
    "",
    "| Records | Count |",
    "| --- | ---: |",
    ...Object.entries(totals).map(([k, v]) => `| ${k} | ${v.toLocaleString("en")} |`),
    "",
    "## Results",
    "",
    "| Scenario | Runs | p50 (ms) | p95 (ms) | Max (ms) | Response size | p95 budget (ms) | Result |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...results.map(
      (r) =>
        `| ${r.s.name} | ${r.s.runs ?? 15} | ${r.p50.toFixed(0)} | ${r.p95.toFixed(0)} | ${r.max.toFixed(0)} | ${(r.bytes / 1024).toFixed(1)} KB | ${r.s.budgetP95Ms} | ${r.ok ? "Pass" : "**Fail**"} |`,
    ),
    "",
    "## Background jobs",
    "",
    "| Job | Duration | Budget | Result |",
    "| --- | ---: | ---: | --- |",
    `| Statement analysis of ${totals.statementTransactions.toLocaleString("en")} transactions across ${statementCount} statements (${analysis.flagged.toLocaleString("en")} flagged, ${analysis.suggestions.toLocaleString("en")} link suggestions) | ${(analysisMs / 1000).toFixed(1)} s | ${analysisBudgetMs / 1000} s (job transaction timeout) | ${analysisOk ? "Pass" : "**Fail**"} |`,
    "",
    failed.length ? `**${failed.length} scenario(s) missed the budget.**` : "All scenarios met their budgets.",
    "",
  ].join("\n");
  writeFileSync(path.resolve(__dirname, "../docs/performance-results.md"), md);
  console.log(`\nWrote docs/performance-results.md. ${failed.length ? `${failed.length} scenario(s) over budget.` : "All budgets met."}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
