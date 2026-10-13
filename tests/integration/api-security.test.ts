import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiServer } from "./http";
import { company, db, login, makeUser, type Client } from "./helpers";

const server = apiServer();
let scopedCompanyId: string;
let otherCompanyId: string;
let admin: Client;
let lead: Client;
let investigator: Client;
let investigatorId: string;
let executive: Client;
let finance: Client;
let advocate: Client;
let caseId: string;
let otherCaseId: string;

beforeAll(async () => {
  const a = await company("SEC");
  const b = await company("OTH");
  scopedCompanyId = a.company.id;
  otherCompanyId = b.company.id;
  admin = await login(server, (await makeUser("SYSTEM_ADMIN")).username);
  lead = await login(server, (await makeUser("LEAD_INVESTIGATOR", { scopeCompanyId: scopedCompanyId })).username);
  const inv = await makeUser("INVESTIGATOR", { clearance: "HIGHLY_CONFIDENTIAL" });
  investigatorId = inv.id;
  investigator = await login(server, inv.username);
  executive = await login(server, (await makeUser("EXECUTIVE_READ_ONLY", { scopeCompanyId: scopedCompanyId, clearance: "CONFIDENTIAL" })).username);
  finance = await login(server, (await makeUser("FINANCE_REVIEWER", { scopeCompanyId: scopedCompanyId, clearance: "CONFIDENTIAL" })).username);
  advocate = await login(server, (await makeUser("EXTERNAL_ADVOCATE_RESTRICTED", { clearance: "CONFIDENTIAL" })).username);
  caseId = (await lead.post("/cases").send({ title: "Security test case (fictional)", companyId: scopedCompanyId, category: "OTHER" })).body.data.id;
  otherCaseId = (await admin.post("/cases").send({ title: "Other company case (fictional)", companyId: otherCompanyId, category: "OTHER" })).body.data.id;
});
afterAll(async () => {
  server.close();
  await db.$disconnect();
});

describe("authentication", () => {
  it("rejects unauthenticated requests with a JSON 401 and a request ID", async () => {
    const res = await request(server).get("/api/v1/cases");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(res.body.requestId).toBeTruthy();
    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });

  it("uses one generic message for unknown users and wrong passwords", async () => {
    const u = await makeUser("INVESTIGATOR");
    const a = await request(server).post("/api/v1/auth/login").set("x-sims-csrf", "1").set("x-forwarded-for", "10.99.0.1").send({ identifier: "nobody-here", password: "x" });
    const b = await request(server).post("/api/v1/auth/login").set("x-sims-csrf", "1").set("x-forwarded-for", "10.99.0.2").send({ identifier: u.username, password: "wrong" });
    expect(a.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it("issues an HttpOnly SameSite session cookie and revokes it on logout", async () => {
    const u = await makeUser("INVESTIGATOR");
    const res = await request(server).post("/api/v1/auth/login").set("x-sims-csrf", "1").set("x-forwarded-for", "10.99.0.3").send({ identifier: u.username, password: "Corr3ct-Horse-Battery!" });
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    const c = cookie.split(";")[0]!;
    expect((await request(server).get("/api/v1/auth/me").set("cookie", c)).status).toBe(200);
    expect((await request(server).post("/api/v1/auth/logout").set("cookie", c).set("x-sims-csrf", "1")).status).toBe(200);
    expect((await request(server).get("/api/v1/auth/me").set("cookie", c)).status).toBe(401);
    expect(await db.auditLog.count({ where: { actorId: u.id, action: "auth.logout" } })).toBe(1);
  });
});

describe("CSRF, input and error handling", () => {
  it("rejects state-changing requests without the anti-forgery header", async () => {
    const res = await request(server).post("/api/v1/cases").set("cookie", lead.cookie).send({ title: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_REJECTED");
  });

  it("rejects cross-origin requests", async () => {
    const res = await request(server).post("/api/v1/cases").set("cookie", lead.cookie).set("x-sims-csrf", "1").set("origin", "https://evil.example").send({ title: "x" });
    expect(res.status).toBe(403);
  });

  it("returns field-level validation errors", async () => {
    const res = await lead.post("/cases").send({ title: "", category: "NOT_A_CATEGORY" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details.fields.title).toMatch(/required/);
    expect(res.body.error.details.fields.category).toBeTruthy();
  });

  it("rejects malformed JSON and wrong content types", async () => {
    const bad = await request(server).post("/api/v1/cases").set("cookie", lead.cookie).set("x-sims-csrf", "1").set("content-type", "application/json").send("{not json");
    expect(bad.status).toBe(400);
    const wrong = await request(server).post("/api/v1/cases").set("cookie", lead.cookie).set("x-sims-csrf", "1").set("content-type", "text/plain").send("hello");
    expect(wrong.status).toBe(415);
  });

  it("returns 404 JSON for unknown endpoints and record types", async () => {
    expect((await lead.get("/nothing-here/at/all/x")).status).toBe(404);
    expect((await lead.get("/not-a-resource")).status).toBe(404);
  });

  it("ignores server-managed fields sent by clients", async () => {
    const res = await lead.post("/cases").send({ title: "Injected fields (fictional)", companyId: scopedCompanyId, category: "OTHER", reference: "HACKED", status: "CLOSED", legalHold: true });
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^SIMS\/\d{4}\/\d{4,}$/);
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.legalHold).toBe(false);
  });
});

describe("authorization", () => {
  it("keeps unassigned investigators out of cases, including list totals", async () => {
    expect((await investigator.get(`/cases/${caseId}`)).status).toBe(404);
    const list = await investigator.get("/cases");
    expect(list.body.meta.total).toBe(0);
    expect((await investigator.get(`/invoices?caseId=${caseId}`)).status).toBe(403);
  });

  it("lets investigators work once assigned", async () => {
    expect((await lead.post(`/cases/${caseId}/assignments`).send({ userId: investigatorId, role: "SUPPORTING" })).status).toBe(201);
    expect((await investigator.get(`/cases/${caseId}`)).status).toBe(200);
    const inv = await investigator.post("/invoices").send({ caseId, invoiceNumber: "INV-SEC-1", invoiceDate: "2026-01-10", customerName: "Fictional", invoiceAmount: "100" });
    expect(inv.status).toBe(201);
  });

  it("enforces company scope for scoped roles", async () => {
    expect((await lead.get(`/cases/${otherCaseId}`)).status).toBe(404);
    const create = await lead.post("/cases").send({ title: "Out of scope (fictional)", companyId: otherCompanyId, category: "OTHER" });
    expect(create.status).toBe(403);
  });

  it("keeps the read-only executive read-only", async () => {
    expect((await executive.get(`/cases/${caseId}`)).status).toBe(200);
    expect((await executive.patch(`/cases/${caseId}`).send({ title: "Changed" })).status).toBe(403);
    expect((await executive.post("/cases").send({ title: "x", companyId: scopedCompanyId, category: "OTHER" })).status).toBe(403);
  });

  it("restricts HR records and statement analysis by role", async () => {
    expect((await finance.get("/disciplinary")).body.meta.total).toBe(0);
    expect((await finance.post("/disciplinary").send({ caseId, employeeName: "x" })).status).toBe(403);
    expect((await advocate.get("/financial-statements")).body.meta.total).toBe(0);
    expect((await advocate.get("/users")).status).toBe(403);
    expect((await advocate.get("/audit-logs")).status).toBe(403);
  });

  it("hides restricted cases from unassigned users in scope", async () => {
    const restricted = (await admin.post("/cases").send({ title: "Restricted (fictional)", companyId: scopedCompanyId, category: "OTHER", confidentiality: "RESTRICTED" })).body.data.id;
    expect((await lead.get(`/cases/${restricted}`)).status).toBe(404);
    expect((await admin.get(`/cases/${restricted}`)).status).toBe(200);
  });

  it("rejects links to records in another case (no IDOR)", async () => {
    const foreignSub = await admin.post("/subfiles").send({ caseId: otherCaseId, title: "Foreign sub-file" });
    expect(foreignSub.status).toBe(201);
    const res = await lead.post("/invoices").send({ caseId, subFileId: foreignSub.body.data.id, invoiceNumber: "INV-IDOR", invoiceDate: "2026-01-10", customerName: "X", invoiceAmount: "10" });
    expect(res.status).toBe(422);
  });

  it("audits denials", async () => {
    const before = await db.auditLog.count({ where: { action: "authz.denied" } });
    await executive.patch(`/cases/${caseId}`).send({ title: "Denied" });
    expect(await db.auditLog.count({ where: { action: "authz.denied" } })).toBeGreaterThan(before);
  });
});

describe("sensitive identifiers", () => {
  it("masks account numbers when stored and phone numbers for lower clearance", async () => {
    const cheque = await lead.post("/cheques").send({ caseId, chequeNumber: "900001", bank: "Fictional Bank", issuer: "Fictional", amount: "500", accountNumberMasked: "0123456789" });
    expect(cheque.status).toBe(201);
    const stored = await db.cheque.findUniqueOrThrow({ where: { id: cheque.body.data.id } });
    expect(stored.accountNumberMasked).toBe("••••••6789");
    await lead.post("/parties").send({ caseId, role: "WITNESS", name: "Masked Person (fictional)", telephone: "0712345678", idNumber: "12345678" });
    const auditor = await login(server, (await makeUser("INTERNAL_AUDIT_REVIEWER", { scopeCompanyId: scopedCompanyId, clearance: "CONFIDENTIAL" })).username);
    const masked = await auditor.get(`/parties?caseId=${caseId}`);
    expect(masked.status).toBe(200);
    expect(masked.body.data[0].telephone).toBe("0712•••678");
    expect(masked.body.data[0].idNumber).toBe("•••••678");
    const asLead = await lead.get(`/parties?caseId=${caseId}`);
    expect(asLead.body.data[0].telephone).toBe("0712345678");
  });
});

describe("OpenAPI", () => {
  it("documents the API", async () => {
    const res = await request(server).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(80);
    expect(res.body.paths["/api/v1/cases/{id}/close"].post.requestBody).toBeTruthy();
  });
});
