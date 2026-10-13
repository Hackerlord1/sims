import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiServer } from "./http";
import { company, db, login, makeUser, type Client } from "./helpers";

const server = apiServer();
const samples = path.join(process.cwd(), "samples");
let admin: Client;
let admin2: Client;
let lead: Client;
let compliance: Client;
let companyId: string;
let caseId: string;
let complianceId: string;

const submit = (body: Record<string, unknown>, ip = `10.77.0.${Math.floor(Math.random() * 250)}`) =>
  request(server).post("/api/v1/access-requests").set("x-sims-csrf", "1").set("x-forwarded-for", ip).send(body);

const PASSWORD = "Ledger-Kite-48!";
const newUsername = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;
const requestBody = (username: string) => ({ fullName: "Amina Otieno (fictional)", username, password: PASSWORD });

beforeAll(async () => {
  companyId = (await company("ACC")).company.id;
  admin = await login(server, (await makeUser("SYSTEM_ADMIN")).username);
  admin2 = await login(server, (await makeUser("SYSTEM_ADMIN")).username);
  lead = await login(server, (await makeUser("LEAD_INVESTIGATOR", { scopeCompanyId: companyId })).username);
  const c = await makeUser("COMPLIANCE_REVIEWER", { scopeCompanyId: companyId });
  complianceId = c.id;
  compliance = await login(server, c.username);
  caseId = (await lead.post("/cases").send({ title: "Approval test case (fictional)", companyId, category: "OTHER" })).body.data.id;
});
afterAll(async () => {
  // Leave the shared test database as other suites expect it.
  await admin.put("/settings").send({ "approvals.recordTypes": [] });
  server.close();
  await db.$disconnect();
});

describe("access requests", () => {
  it("stores a request from the sign-in screen and gives a generic reply", async () => {
    const username = newUsername("req");
    const res = await submit(requestBody(username));
    expect(res.status).toBe(201);
    expect(res.body.data.message).toMatch(/administrator will review/);
    const stored = await db.accessRequest.findMany({ where: { username } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.reference).toMatch(/^ACR-\d{4}-\d{4}$/);
    // Only a hash of the chosen password is kept.
    expect(stored[0]!.passwordHash).toMatch(/^\$argon2/);
    expect(stored[0]!.passwordHash).not.toContain(PASSWORD);
  });

  it("replies identically for duplicates, existing accounts and bots, without storing anything", async () => {
    const username = newUsername("dup");
    const first = await submit(requestBody(username));
    const again = await submit(requestBody(username));
    const existing = await makeUser("INVESTIGATOR");
    const forExisting = await submit(requestBody(existing.username));
    const botUsername = newUsername("bot");
    const bot = await submit({ ...requestBody(botUsername), website: "http://spam.example" });
    expect(again.body.data).toEqual(first.body.data);
    expect(forExisting.body.data).toEqual(first.body.data);
    expect(bot.body.data).toEqual(first.body.data);
    expect(await db.accessRequest.count({ where: { username } })).toBe(1);
    expect(await db.accessRequest.count({ where: { username: existing.username } })).toBe(0);
    expect(await db.accessRequest.count({ where: { username: botUsername } })).toBe(0);
  });

  it("validates the username and password strength", async () => {
    const weak = await submit({ ...requestBody(newUsername("v")), password: "password" });
    expect(weak.status).toBe(422);
    const badName = await submit({ ...requestBody("not a username!"), password: PASSWORD });
    expect(badName.status).toBe(422);
  });

  it("rate-limits one network", async () => {
    const ip = `10.78.${Math.floor(Math.random() * 250)}.1`;
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await submit(requestBody(newUsername("rl")), ip)).status);
    expect(codes.slice(0, 5).every((c) => c === 201)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });

  it("lets only user managers see and decide requests", async () => {
    expect((await lead.get("/access-requests")).status).toBe(403);
    const r = await db.accessRequest.findFirstOrThrow({ where: { status: "PENDING" } });
    expect((await lead.post(`/access-requests/${r.id}/reject`).send({ reason: "Not my call" })).status).toBe(403);
  });

  it("approves with role, units, clearance and restrictions, once only, keeping the chosen password", async () => {
    const username = newUsername("ok");
    const email = `${username}@test.local`;
    await submit(requestBody(username));
    const req = await db.accessRequest.findFirstOrThrow({ where: { username } });
    const listed = await admin.get("/access-requests");
    expect(listed.body.data.find((r: { id: string }) => r.id === req.id)).not.toHaveProperty("passwordHash");
    expect((await admin.post(`/access-requests/${req.id}/approve`).send({ username: `${username}x`, email, fullName: req.fullName, role: "INVESTIGATOR" })).status).toBe(400);
    const body = {
      username,
      email,
      fullName: req.fullName,
      role: "INVESTIGATOR",
      clearance: "CONFIDENTIAL",
      scopes: [{ companyId, branchId: null }],
      // The last two exceed the role and must be dropped, never stored as grants.
      permissionDenials: ["EXPENSES:CREATE", "STATEMENTS:VIEW", "USERS:MANAGE_USERS", "NONSENSE:VIEW"],
      comment: "Approved by line manager (fictional)",
    };
    const res = await admin.post(`/access-requests/${req.id}/approve`).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data.temporaryPassword).toBeUndefined();
    
    expect(res.body.data.user.permissionDenials).toEqual(["EXPENSES:CREATE", "STATEMENTS:VIEW"]);
    const stored = await db.accessRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(stored.status).toBe("APPROVED");
    expect(stored.createdUserId).toBe(res.body.data.user.id);
    expect(stored.passwordHash).toBeNull();
    // They sign in with the password they chose, without a forced change.
    expect((await (await login(server, username, PASSWORD)).get("/auth/me")).status).toBe(200);

    expect((await admin2.post(`/access-requests/${req.id}/approve`).send({ ...body, username: `${username}x`, email: `x${email}` })).status).toBe(409);
    expect(await db.auditLog.count({ where: { action: "access_requests.approve", entityId: req.id } })).toBe(1);
  });

  it("enforces restrictions on the server for every request", async () => {
    const u = await makeUser("INVESTIGATOR", { scopeCompanyId: companyId, extra: { permissionDenials: ["TASKS:CREATE", "STATEMENTS:VIEW"] } });
    await db.caseAssignment.create({ data: { caseId, userId: u.id, role: "SUPPORTING", assignedById: u.id } });
    const inv = await login(server, u.username);
    const me = await inv.get("/auth/me");
    expect(me.body.data.permissions.TASKS).not.toContain("CREATE");
    expect(me.body.data.permissions.STATEMENTS ?? []).toEqual([]);
    expect((await inv.post("/tasks").send({ caseId, title: "Should be refused (fictional)" })).status).toBe(403);
    expect((await inv.get(`/tasks?caseId=${caseId}`)).status).toBe(200);
    // Lists never reveal records from a module the user cannot view (same as for roles without it).
    const statements = await inv.get(`/financial-statements?caseId=${caseId}`);
    expect(statements.status).toBe(403);
    expect((await inv.get("/financial-statements")).body.meta.total).toBe(0);
  });

  it("lets an administrator change restrictions but not their own", async () => {
    const u = await makeUser("INVESTIGATOR");
    const res = await admin.patch(`/users/${u.id}`).send({ permissionDenials: ["EXPENSES:EDIT"], dataApprover: true });
    expect(res.status).toBe(200);
    expect(res.body.data.permissionDenials).toEqual(["EXPENSES:EDIT"]);
    expect(res.body.data.dataApprover).toBe(true);
    expect(await db.auditLog.count({ where: { action: "users.permission_change", entityId: u.id } })).toBe(1);
    const meId = (await admin.get("/auth/me")).body.data.id as string;
    expect((await admin.patch(`/users/${meId}`).send({ dataApprover: false })).status).toBe(409);
  });
});

describe("data-change approval", () => {
  beforeAll(async () => {
    const res = await admin.put("/settings").send({ "approvals.recordTypes": ["parties"] });
    expect(res.status).toBe(200);
  });

  it("validates and holds a new record instead of writing it", async () => {
    const before = await db.party.count({ where: { caseId } });
    const bad = await lead.post("/parties").send({ caseId, role: "NOT_A_ROLE", name: "x" });
    expect(bad.status).toBe(422);
    const res = await lead.post("/parties").send({ caseId, role: "PERSON_OF_INTEREST", name: "Brian Kamau (fictional)" });
    expect(res.status).toBe(201);
    expect(res.body.data.pendingApproval).toBe(true);
    expect(res.body.data.changeRequest.reference).toMatch(/^CHG-\d{4}-\d{5}$/);
    expect(await db.party.count({ where: { caseId } })).toBe(before);
    // Validation rolled back everything, including its audit row.
    expect(await db.auditLog.count({ where: { action: "parties.create", caseId } })).toBe(0);
    expect(await db.notification.count({ where: { dedupeKey: `change:${res.body.data.changeRequest.id}` } })).toBeGreaterThan(0);
  });

  it("refuses the submitter and non-approvers, then applies on another approver's approval", async () => {
    const res = await lead.post("/parties").send({ caseId, role: "WITNESS", name: "Faith Njeri (fictional)" });
    const id = res.body.data.changeRequest.id as string;
    expect((await lead.post(`/change-requests/${id}/decision`).send({ approve: true })).status).toBe(403);
    expect((await compliance.post(`/change-requests/${id}/decision`).send({ approve: true })).status).toBe(403);
    expect((await lead.get("/change-requests?mine=true")).body.data.some((c: { id: string }) => c.id === id)).toBe(true);

    const detail = await admin.get(`/change-requests/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.canDecide).toBe(true);
    expect(detail.body.data.proposed.name).toBe("Faith Njeri (fictional)");

    const ok = await admin.post(`/change-requests/${id}/decision`).send({ approve: true });
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe("APPLIED");
    const party = await db.party.findUniqueOrThrow({ where: { id: ok.body.data.recordId } });
    expect(party.name).toBe("Faith Njeri (fictional)");
    // Applied as the submitter, so the record and its audit trail name them, not the approver.
    expect(party.createdById).toBe((await lead.get("/auth/me")).body.data.id);
    expect((await admin2.post(`/change-requests/${id}/decision`).send({ approve: true })).status).toBe(409);
    const submitter = (await lead.get("/auth/me")).body.data.id as string;
    expect(await db.notification.count({ where: { userId: submitter, title: "Change approved" } })).toBeGreaterThan(0);
  });

  it("lets a designated data approver decide on cases they can see", async () => {
    const res = await lead.post("/parties").send({ caseId, role: "WITNESS", name: "Peter Mwangi (fictional)" });
    const id = res.body.data.changeRequest.id as string;
    await db.user.update({ where: { id: complianceId }, data: { dataApprover: true } });
    const rejectWithoutReason = await compliance.post(`/change-requests/${id}/decision`).send({ approve: false });
    expect(rejectWithoutReason.status).toBe(422);
    const rejected = await compliance.post(`/change-requests/${id}/decision`).send({ approve: false, comment: "Duplicate of an existing witness" });
    expect(rejected.status).toBe(201);
    expect(await db.party.count({ where: { name: "Peter Mwangi (fictional)" } })).toBe(0);
  });

  it("holds edits, allows one pending edit per record, and applies them with the version check", async () => {
    // Created directly: approval only governs changes made through the API.
    const party = await db.party.create({ data: { caseId, role: "WITNESS", name: "Edit me (fictional)", createdById: complianceId } });
    const edit = await lead.patch(`/parties/${party.id}`).send({ name: "Edited name (fictional)", version: party.version });
    expect(edit.body.data.pendingApproval).toBe(true);
    expect((await db.party.findUniqueOrThrow({ where: { id: party.id } })).name).toBe("Edit me (fictional)");
    expect((await lead.patch(`/parties/${party.id}`).send({ name: "Second edit", version: party.version })).status).toBe(409);
    const detail = await admin.get(`/change-requests/${edit.body.data.changeRequest.id}`);
    expect(detail.body.data.changedFields).toEqual(["name"]);
    expect(detail.body.data.current.name).toBe("Edit me (fictional)");
    expect((await admin.post(`/change-requests/${edit.body.data.changeRequest.id}/decision`).send({ approve: true })).status).toBe(201);
    expect((await db.party.findUniqueOrThrow({ where: { id: party.id } })).name).toBe("Edited name (fictional)");
  });

  it("marks an edit as failed when the record changed after submission", async () => {
    const party = await db.party.create({ data: { caseId, role: "WITNESS", name: "Stale (fictional)", createdById: complianceId } });
    const edit = await lead.patch(`/parties/${party.id}`).send({ name: "Too late (fictional)", version: party.version });
    await db.party.update({ where: { id: party.id }, data: { notes: "changed meanwhile", version: { increment: 1 } } });
    const res = await admin.post(`/change-requests/${edit.body.data.changeRequest.id}/decision`).send({ approve: true });
    expect(res.status).toBe(409);
    const cr = await db.changeRequest.findUniqueOrThrow({ where: { id: edit.body.data.changeRequest.id } });
    expect(cr.status).toBe("FAILED");
    expect((await db.party.findUniqueOrThrow({ where: { id: party.id } })).name).toBe("Stale (fictional)");
  });

  it("lets the submitter withdraw a pending change, and only that", async () => {
    const res = await lead.post("/parties").send({ caseId, role: "WITNESS", name: "Withdrawn (fictional)" });
    const id = res.body.data.changeRequest.id as string;
    expect((await admin.post(`/change-requests/${id}/withdraw`)).status).toBe(404);
    expect((await lead.post(`/change-requests/${id}/withdraw`)).status).toBe(201);
    expect((await admin.post(`/change-requests/${id}/decision`).send({ approve: true })).status).toBe(409);
  });

  it("holds a bulk import until approved, then imports as the uploader", async () => {
    await admin.put("/settings").send({ "approvals.recordTypes": ["parties", "invoices"] });
    const csv = readFileSync(path.join(samples, "imports", "invoices-valid-duplicate-invalid.csv"));
    const v = await lead
      .post("/imports/validate")
      .field("resource", "invoices")
      .field("caseId", caseId)
      .field("mode", "PARTIAL")
      .field("duplicateStrategy", "SKIP")
      .attach("file", csv, { filename: "invoices.csv", contentType: "text/csv" });
    const batchId = v.body.data.batch.id as string;
    const held = await lead.post(`/imports/${batchId}/commit`);
    expect(held.status).toBe(201);
    expect(held.body.data.pendingApproval).toBe(true);
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batchId } })).status).toBe("AWAITING_APPROVAL");
    expect(await db.invoice.count({ where: { importBatchId: batchId } })).toBe(0);
    // A second commit cannot queue a second approval.
    expect((await lead.post(`/imports/${batchId}/commit`)).status).toBe(409);

    const ok = await admin.post(`/change-requests/${held.body.data.changeRequest.id}/decision`).send({ approve: true });
    expect(ok.status).toBe(201);
    expect(await db.invoice.count({ where: { importBatchId: batchId } })).toBe(3);
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batchId } })).createdById).toBe((await lead.get("/auth/me")).body.data.id);
  });

  it("leaves other record types untouched", async () => {
    const t = await lead.post("/tasks").send({ caseId, title: "Not behind approval (fictional)" });
    expect(t.status).toBe(201);
    expect(t.body.data.pendingApproval).toBeUndefined();
    expect(t.body.data.id).toBeTruthy();
  });
});
