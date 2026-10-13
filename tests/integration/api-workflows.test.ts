import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiServer } from "./http";
import { invalidateSettings } from "@/server/services/settings";
import { company, db, login, makeUser, type Client } from "./helpers";

const server = apiServer();
let companyId: string;
let lead: Client;
let leadId: string;
let investigator: Client;
let investigatorId: string;
let finance: Client;
let manager: Client;
let caseId: string;

beforeAll(async () => {
  companyId = (await company("WFL")).company.id;
  const l = await makeUser("LEAD_INVESTIGATOR", { scopeCompanyId: companyId });
  leadId = l.id;
  lead = await login(server, l.username);
  const i = await makeUser("INVESTIGATOR", { clearance: "HIGHLY_CONFIDENTIAL" });
  investigatorId = i.id;
  investigator = await login(server, i.username);
  finance = await login(server, (await makeUser("FINANCE_REVIEWER", { scopeCompanyId: companyId, clearance: "CONFIDENTIAL" })).username);
  manager = await login(server, (await makeUser("MANAGEMENT_APPROVER", { scopeCompanyId: companyId, clearance: "HIGHLY_CONFIDENTIAL" })).username);
  const c = await lead
    .post("/cases")
    .send({ title: "Workflow case (fictional)", companyId, category: "INVOICE_IRREGULARITY", leadInvestigatorId: leadId, amountConfirmedRecoverable: "1000000", grossAmount: "1200000" });
  caseId = c.body.data.id;
  await lead.post(`/cases/${caseId}/assignments`).send({ userId: investigatorId, role: "SUPPORTING" });
});
afterAll(async () => {
  server.close();
  await db.$disconnect();
});

describe("case lifecycle", () => {
  it("generates sequential references and records status history", async () => {
    const c = await db.case.findUniqueOrThrow({ where: { id: caseId } });
    expect(c.reference).toMatch(/^SIMS\/\d{4}\/\d{4}$/);
    expect(c.status).toBe("DRAFT");
    const bad = await lead.post(`/cases/${caseId}/status`).send({ status: "RECOVERY_MONITORING" });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("INVALID_TRANSITION");
    expect((await lead.post(`/cases/${caseId}/status`).send({ status: "UNDER_INTERNAL_INVESTIGATION", reason: "Started" })).status).toBe(201);
    expect(await db.caseStatusHistory.count({ where: { caseId } })).toBe(2);
  });

  it("creates sub-files with case-scoped references", async () => {
    const a = await lead.post("/subfiles").send({ caseId, title: "Sales Made to Busia" });
    const b = await lead.post("/subfiles").send({ caseId, title: "Sales Made to Dakar" });
    expect(a.body.data.reference).toMatch(/\/SF-01$/);
    expect(b.body.data.reference).toMatch(/\/SF-02$/);
    await lead.patch(`/subfiles/${a.body.data.id}`).send({ status: "COMPLETED" });
    await lead.patch(`/subfiles/${b.body.data.id}`).send({ status: "COMPLETED" });
  });

  it("uses optimistic locking", async () => {
    const inv = await investigator.post("/invoices").send({ caseId, invoiceNumber: "INV-WF-1", invoiceDate: "2026-02-01", customerName: "Fictional A", invoiceAmount: "50000" });
    const id = inv.body.data.id;
    expect((await investigator.patch(`/invoices/${id}`).send({ observations: "first", version: 1 })).status).toBe(200);
    const stale = await investigator.patch(`/invoices/${id}`).send({ observations: "second", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_VERSION");
  });

  it("generates a task from a work-done entry", async () => {
    const wl = await investigator
      .post("/work-logs")
      .send({ caseId, occurredAt: "2026-02-02T10:00", investigatorId, workPerformed: "Visited customer (fictional)", nextTask: "Request bank statement" });
    expect(wl.status).toBe(201);
    const t = await investigator.post(`/work-logs/${wl.body.data.id}/tasks`).send({ dueDate: "2026-12-01" });
    expect(t.status).toBe(201);
    expect(t.body.data.title).toBe("Request bank statement");
    expect(t.body.data.sourceWorkLogId).toBe(wl.body.data.id);
    expect(t.body.data.reference).toMatch(/\/TSK-001$/);
  });
});

describe("findings and management decisions", () => {
  it("supports criminal and civil action together, with maker-checker", async () => {
    const f = await lead.post("/findings").send({ caseId, title: "Diversion (fictional)", allegations: "Payments diverted", investigatorConclusion: "Refer", confirmedAmount: "1000000" });
    const id = f.body.data.id;
    expect((await lead.post(`/findings/${id}/submit`)).status).toBe(400); // no recommendations yet
    await lead.put(`/findings/${id}/recommendations`).send({ items: [{ type: "CRIMINAL_ACTION" }, { type: "CIVIL_ACTION" }] });
    expect((await lead.post(`/findings/${id}/submit`)).status).toBe(201);
    expect((await db.case.findUniqueOrThrow({ where: { id: caseId } })).status).toBe("AWAITING_MANAGEMENT_DECISION");
    const self = await lead.post(`/findings/${id}/decision`).send({ outcome: "APPROVED", decisionDate: "2026-03-01", approvedTypes: ["CRIMINAL_ACTION"] });
    expect(self.status).toBe(403); // the lead cannot decide (no approval right) and is the author
    const d = await manager.post(`/findings/${id}/decision`).send({ outcome: "APPROVED", decisionDate: "2026-03-01", approvedTypes: ["CRIMINAL_ACTION", "CIVIL_ACTION"] });
    expect(d.status).toBe(201);
    const recs = await db.recommendation.findMany({ where: { findingId: id } });
    expect(recs.every((r) => r.approved === true)).toBe(true);
    expect((await lead.post(`/cases/${caseId}/status`).send({ status: "CRIMINAL_AND_CIVIL_ACTION" })).status).toBe(201);
  });

  it("tracks criminal milestones and court events in parallel", async () => {
    const cm = await lead.post("/criminal-matters").send({ caseId, policeStation: "Fictional Police Station", obNumber: "OB/T/1/2026", status: "REPORTED" });
    expect(cm.status).toBe(201);
    expect((await lead.post("/criminal-milestones").send({ matterId: cm.body.data.id, milestone: "OB_NUMBER_OBTAINED", milestoneDate: "2026-03-02" })).status).toBe(201);
    expect((await lead.post("/criminal-milestones").send({ matterId: cm.body.data.id, milestone: "FILE_FORWARDED_TO_DPP", milestoneDate: "2026-03-10", nextDate: "2026-12-01" })).status).toBe(201);
    const civ = await lead.post("/civil-matters").send({ caseId, legalFirm: "Fictional Advocates", advocate: "A. Advocate", courtCaseNumber: "CMCC/T/1", status: "FILED" });
    const ev = await lead.post("/court-events").send({ matterId: civ.body.data.id, eventType: "JUDGMENT", eventDate: "2026-04-01", orders: "Judgment for the plaintiff" });
    expect(ev.status).toBe(201);
    // Judgments are protected from deletion.
    const del = await lead.post(`/court-events/${ev.body.data.id}/delete`).send({ reason: "mistake" });
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("PROTECTED_RECORD");
  });
});

describe("expenses, budgets and advances", () => {
  it("approves expenses with maker-checker and exact partial amounts", async () => {
    const e = await investigator
      .post("/expenses")
      .send({ caseId, pathway: "INVESTIGATION", category: "ACCOMMODATION", description: "Lodging (fictional)", expenseDate: "2026-02-03", amountBeforeTax: "10000.10", tax: "1600.02" });
    expect(e.status).toBe(201);
    expect(e.body.data.totalAmount).toBe("11600.12");
    expect(e.body.data.requestedAmount).toBe("11600.12");
    const id = e.body.data.id;
    expect((await finance.post(`/expenses/${id}/decision`).send({ approvedAmount: "11600.12" })).status).toBe(409); // not submitted
    await investigator.post(`/expenses/${id}/submit`);
    expect((await investigator.post(`/expenses/${id}/decision`).send({ approvedAmount: "11600.12" })).status).toBe(403);
    expect((await finance.post(`/expenses/${id}/decision`).send({ approvedAmount: "20000" })).status).toBe(400);
    expect((await finance.post(`/expenses/${id}/decision`).send({ approvedAmount: "9000.00" })).status).toBe(400); // comment required
    const ok = await finance.post(`/expenses/${id}/decision`).send({ approvedAmount: "9000.00", comment: "Rate cap" });
    expect(ok.body.data.status).toBe("PARTIALLY_APPROVED");
    expect(ok.body.data.rejectedAmount).toBe("2600.12");
    // Approved amounts can no longer be edited.
    expect((await investigator.patch(`/expenses/${id}`).send({ amountBeforeTax: "1" })).status).toBe(400);
    const pay = await finance.post(`/expenses/${id}/pay`).send({ paidAmount: "9000.00", paymentReference: "PAY-T-1" });
    expect(pay.body.data.status).toBe("AWAITING_RECEIPT");
    expect((await finance.post(`/expenses/${id}/account`)).status).toBe(400); // receipt required
  });

  it("issues and accounts for an advance", async () => {
    const a = await investigator.post("/advances").send({ caseId, employeeId: investigatorId, purpose: "Field trip (fictional)", amountRequested: "30000" });
    const id = a.body.data.id;
    expect((await finance.post(`/advances/${id}/decision`).send({ approve: true, amountApproved: "25000" })).status).toBe(201);
    expect((await finance.post(`/advances/${id}/issue`).send({ amountIssued: "25000", accountingDeadline: "2026-12-31" })).status).toBe(201);
    const exp = await investigator
      .post("/expenses")
      .send({ caseId, advanceId: id, pathway: "INVESTIGATION", category: "FUEL", description: "Fuel (fictional)", expenseDate: "2026-02-05", amountBeforeTax: "18000" });
    await investigator.post(`/expenses/${exp.body.data.id}/submit`);
    await finance.post(`/expenses/${exp.body.data.id}/decision`).send({ approvedAmount: "18000" });
    const partial = await finance.post(`/advances/${id}/account`).send({ amountReturned: "2000" });
    expect(partial.body.data.status).toBe("PARTLY_ACCOUNTED");
    expect(partial.body.data.position.outstandingBalance).toBe("5000.00");
    const full = await finance.post(`/advances/${id}/account`).send({ amountReturned: "7000" });
    expect(full.body.data.status).toBe("ACCOUNTED");
    expect((await finance.post(`/advances/${id}/close`)).status).toBe(201);
  });

  it("approves budgets and reports budget vs actual", async () => {
    const b = await lead.post("/budgets").send({ caseId, pathway: "INVESTIGATION", approvedAmount: "50000" });
    expect((await lead.post(`/budgets/${b.body.data.id}/approve`).send({})).status).toBe(403); // no approval right
    expect((await manager.post(`/budgets/${b.body.data.id}/approve`).send({})).status).toBe(201);
    const s = await lead.get(`/cases/${caseId}/summary`);
    const line = s.body.data.budget.lines.find((l: { pathway: string }) => l.pathway === "INVESTIGATION");
    expect(line.approved).toBe("50000");
    expect(line.actual).toBe("27000");
    expect(line.variance).toBe("23000");
    expect(line.utilisation).toBe("54");
  });
});

describe("recoveries and write-offs", () => {
  it("verifies recoveries, posts them to invoices and computes net recovery", async () => {
    const inv = await db.invoice.findFirstOrThrow({ where: { caseId, invoiceNumber: "INV-WF-1" } });
    const r = await investigator
      .post("/recoveries")
      .send({ caseId, recoveryDate: "2026-02-10", payer: "Fictional A", invoiceId: inv.id, method: "BANK_TRANSFER", grossAmount: "20000", recoveryCosts: "500", receiptNumber: "RC-T-1" });
    expect(r.status).toBe(201);
    expect(r.body.data.netAmount).toBe("19500.00");
    expect((await investigator.post(`/recoveries/${r.body.data.id}/verify`)).status).toBe(403);
    const v = await finance.post(`/recoveries/${r.body.data.id}/verify`);
    expect(v.status).toBe(201);
    expect(v.body.data.remainingBalance).toBe("980000");
    const posted = await db.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(posted.amountPaid.toString()).toBe("20000");
    expect(posted.recoveryStatus).toBe("PARTLY_RECOVERED");
    // Verified receipts are protected.
    expect((await lead.post(`/recoveries/${r.body.data.id}/delete`).send({ reason: "x" })).status).toBe(409);
    const s = (await lead.get(`/cases/${caseId}/summary`)).body.data.financials;
    expect(s.amountRecovered).toBe("20000");
    expect(s.totalCosts).toBe("27500"); // 9,000 + 18,000 expenses + 500 recovery costs
    expect(s.netRecovery).toBe("-7500");
    expect(s.recoveryRate).toBe("2");
    expect(s.costToRecoveryRatio).toBe("137.5");
  });

  it("routes large write-offs through finance, management and board approval", async () => {
    await db.systemSetting.upsert({ where: { key: "writeOff.boardThreshold" }, update: { value: "100000.00" }, create: { key: "writeOff.boardThreshold", value: "100000.00" } });
    // Written straight to the database, so drop the in-process settings cache as the settings API does.
    invalidateSettings();
    const w = await lead.post("/write-offs").send({ caseId, amount: "150000", reason: "Irrecoverable (fictional)" });
    const id = w.body.data.id;
    expect((await lead.post(`/write-offs/${id}/submit`).send({})).body.data.boardApprovalRequired).toBe(true);
    expect((await manager.post(`/write-offs/${id}/management-approval`).send({})).status).toBe(409); // finance first
    expect((await finance.post(`/write-offs/${id}/finance-review`).send({ notes: "Checked" })).status).toBe(201);
    expect((await manager.post(`/write-offs/${id}/management-approval`).send({})).body.data.status).toBe("BOARD_APPROVAL");
    expect((await manager.post(`/write-offs/${id}/board-approval`).send({})).status).toBe(400);
    expect((await manager.post(`/write-offs/${id}/board-approval`).send({ boardApprovalReference: "BR-1", boardApprovalDate: "2026-05-01" })).body.data.status).toBe("APPROVED");
    expect((await lead.post(`/write-offs/${id}/close`).send({})).status).toBe(403);
    expect((await finance.post(`/write-offs/${id}/record-accounting`).send({ accountingEntryReference: "JE-1" })).status).toBe(201);
    expect((await finance.post(`/write-offs/${id}/close`).send({})).body.data.status).toBe("CLOSED");
  });
});

describe("closure and reopening", () => {
  it("blocks closure while work is outstanding, then closes and reopens", async () => {
    const check = await lead.get(`/cases/${caseId}/closure-check`);
    expect(check.body.data.blocked).toBe(true);
    expect((await lead.post(`/cases/${caseId}/close`).send({ reason: "Done", summary: "Everything resolved (fictional)." })).status).toBe(409);
    // Resolve blockers.
    await db.task.updateMany({ where: { caseId }, data: { status: "COMPLETED" } });
    await db.expense.updateMany({ where: { caseId, status: "SUBMITTED" }, data: { status: "REJECTED" } });
    const closed = await lead.post(`/cases/${caseId}/close`).send({ reason: "Resolved", summary: "Everything resolved (fictional)." });
    expect(closed.status).toBe(201);
    expect(closed.body.data.status).toBe("CLOSED");
    // Closed cases are read-only.
    expect((await investigator.post("/invoices").send({ caseId, invoiceNumber: "INV-LATE", invoiceDate: "2026-06-01", customerName: "X", invoiceAmount: "1" })).status).toBe(409);
    expect((await lead.post(`/cases/${caseId}/status`).send({ status: "UNDER_INTERNAL_INVESTIGATION" })).status).toBe(409);
    const reopened = await lead.post(`/cases/${caseId}/reopen`).send({ reason: "New evidence", newInformation: "A fictional witness came forward." });
    expect(reopened.body.data.status).toBe("REOPENED");
    expect(await db.caseReopening.count({ where: { caseId } })).toBe(1);
    expect(await db.auditLog.count({ where: { caseId, action: { in: ["cases.close", "cases.reopen"] } } })).toBe(2);
  });
});
