import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiServer } from "./http";
import { company, db, login, makeUser, type Client } from "./helpers";

const server = apiServer();
let admin: Client;
let finance: Client;
let advocate: Client;
let companyId: string;

beforeAll(async () => {
  companyId = (await company("DSH")).company.id;
  admin = await login(server, (await makeUser("SYSTEM_ADMIN")).username);
  finance = await login(server, (await makeUser("FINANCE_REVIEWER", { scopeCompanyId: companyId, clearance: "CONFIDENTIAL" })).username);
  advocate = await login(server, (await makeUser("EXTERNAL_ADVOCATE_RESTRICTED", { clearance: "CONFIDENTIAL" })).username);
  // Twelve cases awaiting a decision: more than the ten rows the dashboard lists inline.
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await admin.post("/cases").send({ title: `Dashboard drill-down case ${i} (fictional)`, companyId, category: "OTHER" });
    ids.push(res.body.data.id);
  }
  await db.case.updateMany({ where: { id: { in: ids } }, data: { status: "AWAITING_MANAGEMENT_DECISION" } });
});
afterAll(async () => {
  server.close();
  await db.$disconnect();
});

describe("dashboard drill-down", () => {
  it("counts every matching case, not just the ten listed inline", async () => {
    const dash = await admin.get("/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.data.counts.awaitingDecision).toBeGreaterThanOrEqual(12);
    expect(dash.body.data.awaitingDecision.length).toBeLessThanOrEqual(10);
  });

  it("returns the records behind a figure, matching its count", async () => {
    const [dash, drill] = await Promise.all([admin.get("/dashboard"), admin.get("/dashboard/metrics/awaiting-decision")]);
    expect(drill.status).toBe(200);
    const m = drill.body.data;
    expect(m.total).toBe(dash.body.data.counts.awaitingDecision);
    expect(m.rows.length).toBe(Math.min(m.total, 100));
    expect(m.rows[0]).toMatchObject({ href: expect.stringMatching(/^\/cases\//), status: "AWAITING_MANAGEMENT_DECISION" });
    expect(m.rows[0].reference).toBeTruthy();
  });

  it("lists money figures with amounts as decimal strings", async () => {
    const res = await admin.get("/dashboard/metrics/exposure");
    expect(res.status).toBe(200);
    expect(res.body.data.amountLabel).toBe("Gross amount");
    for (const r of res.body.data.rows) expect(typeof r.amount).toBe("string");
  });

  it("refuses records from a module the viewer cannot see", async () => {
    // Finance reviewers see the dashboard but not tasks.
    expect((await finance.get("/dashboard/metrics/overdue-tasks")).status).toBe(403);
    expect((await finance.get("/dashboard/metrics/unaccounted-advances")).status).toBe(200);
  });

  it("checks the dashboard permission before the metric name", async () => {
    expect((await advocate.get("/dashboard/metrics/open-cases")).status).toBe(403);
    expect((await advocate.get("/dashboard/metrics/not-a-metric")).status).toBe(403);
    expect((await admin.get("/dashboard/metrics/not-a-metric")).status).toBe(404);
  });
});
