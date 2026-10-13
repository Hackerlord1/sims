import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Test } from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drainQueue } from "@/server/jobs/worker";
import { apiServer } from "./http";
import { company, db, login, makeUser, PASSWORD, type Client } from "./helpers";

const server = apiServer();
const samples = path.resolve(__dirname, "../../samples");
let companyId: string;
let admin: Client;
let adminId: string;
let compliance: Client;
let lead: Client;
let leadId: string;
let caseId: string;
let caseRef: string;

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
type BinaryParser = Extract<Parameters<Test["parse"]>[0], (res: never, callback: never) => void>;
/** Supertest parser that collects binary responses into a Buffer. */
const binary: BinaryParser = (res, cb) => {
  // In Node, superagent hands parsers the raw IncomingMessage stream; its typings describe the browser Response.
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c));
  stream.on("end", () => cb(null, Buffer.concat(chunks)));
};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

beforeAll(async () => {
  companyId = (await company("DAT")).company.id;
  const a = await makeUser("SYSTEM_ADMIN");
  adminId = a.id;
  admin = await login(server, a.username);
  compliance = await login(server, (await makeUser("COMPLIANCE_REVIEWER", { scopeCompanyId: companyId })).username);
  const l = await makeUser("LEAD_INVESTIGATOR", { scopeCompanyId: companyId });
  leadId = l.id;
  lead = await login(server, l.username);
  const c = await admin.post("/cases").send({ title: "Data administration case (fictional)", companyId, category: "OTHER", leadInvestigatorId: leadId });
  caseId = c.body.data.id;
  caseRef = c.body.data.reference;
});
afterAll(async () => {
  server.close();
  await db.$disconnect();
});

describe("soft deletion, Recycle Bin and bulk actions", () => {
  it("soft-deletes with a reason and restores", async () => {
    const t = await lead.post("/tasks").send({ caseId, title: "Disposable task (fictional)" });
    const id = t.body.data.id;
    expect((await lead.post(`/tasks/${id}/delete`).send({})).status).toBe(400); // reason required
    expect((await lead.post(`/tasks/${id}/delete`).send({ reason: "Created in error" })).status).toBe(201);
    const row = await db.task.findUniqueOrThrow({ where: { id } });
    expect(row.isDeleted).toBe(true);
    expect(row.deletedById).toBeTruthy();
    expect(row.deletionReason).toBe("Created in error");
    expect((await lead.get(`/tasks?caseId=${caseId}`)).body.meta.total).toBe(0);
    expect((await lead.get(`/tasks?caseId=${caseId}&deleted=only`)).body.meta.total).toBe(1);
    expect((await lead.post(`/tasks/${id}/restore`).send({ reason: "Needed after all" })).status).toBe(201);
    const restored = await db.task.findUniqueOrThrow({ where: { id } });
    expect(restored.isDeleted).toBe(false);
    expect(restored.restorationReason).toBe("Needed after all");
  });

  it("runs a bulk soft delete over all filtered records, skips protected ones, and restores the batch", async () => {
    for (let i = 0; i < 6; i++) await lead.post("/invoices").send({ caseId, invoiceNumber: `BULK-${i}`, invoiceDate: "2026-01-05", customerName: "Bulk Fictional", invoiceAmount: "10" });
    const res = await admin.post("/bulk/invoices").send({ action: "SOFT_DELETE", filter: { caseId, q: "Bulk Fictional" }, reason: "Duplicate upload (test)" });
    expect(res.status).toBe(201);
    expect(res.body.data.affected).toBe(6);
    expect(res.body.data.reference).toMatch(/^BLK-\d{4}-\d{5}$/);
    const batch = await db.bulkActionBatch.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(await db.invoice.count({ where: { deletionBatchId: batch.id, isDeleted: true } })).toBe(6);
    const restore = await admin.post(`/bulk-batches/${batch.id}/restore`).send({ reason: "Restore test batch" });
    expect(restore.body.data.affected).toBe(6);
    expect(await db.invoice.count({ where: { caseId, isDeleted: false, customerName: "Bulk Fictional" } })).toBe(6);
    const summary = await admin.get("/recycle-bin/summary");
    expect(summary.status).toBe(200);
  });

  it("reassigns and changes status in bulk", async () => {
    const other = await makeUser("INVESTIGATOR");
    const ids = (await db.invoice.findMany({ where: { caseId, customerName: "Bulk Fictional" }, select: { id: true } })).map((r) => r.id);
    const st = await admin.post("/bulk/invoices").send({ action: "CHANGE_STATUS", ids, status: "DISPUTED" });
    expect(st.body.data.affected).toBe(6);
    expect(await db.invoice.count({ where: { id: { in: ids }, classification: "DISPUTED" } })).toBe(6);
    const t = await lead.post("/tasks").send({ caseId, title: "Reassign me (fictional)" });
    const re = await admin.post("/bulk/tasks").send({ action: "REASSIGN", ids: [t.body.data.id], assigneeId: other.id });
    expect(re.body.data.affected).toBe(1);
  });

  it("exports filtered records as XLSX and CSV", async () => {
    const x = await admin.post("/export/invoices").send({ format: "xlsx", filter: { caseId } }).buffer(true).parse(binary);
    expect(x.status).toBe(200);
    expect(x.headers["content-type"]).toMatch(/spreadsheetml/);
    const c = await admin.post("/export/invoices").send({ format: "csv", filter: { caseId } });
    expect(c.text).toContain("Invoice number");
    expect(c.text).toContain("BULK-0");
  });
});

describe("evidence", () => {
  let evidenceId: string;
  it("stores the original read-only with its SHA-256 and a working copy", async () => {
    const res = await lead
      .post("/evidence/upload")
      .field("caseId", caseId)
      .field("title", "Fictional delivery note")
      .field("category", "DELIVERY_NOTE")
      .attach("file", pdf, { filename: "note.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.data.sha256).toBe(sha(pdf));
    evidenceId = res.body.data.id;
    const ev = await db.evidence.findUniqueOrThrow({ where: { id: evidenceId } });
    expect(ev.reference).toMatch(/\/EV-001$/);
    expect(await db.evidenceVersion.count({ where: { evidenceId } })).toBe(1);
    expect(await db.custodyEvent.count({ where: { evidenceId } })).toBe(1);
  });

  it("rejects disallowed and disguised files", async () => {
    const exe = await lead.post("/evidence/upload").field("caseId", caseId).field("title", "x").field("category", "DOCUMENT").attach("file", Buffer.from("MZ"), { filename: "tool.exe" });
    expect(exe.status).toBe(415);
    const fake = await lead
      .post("/evidence/upload")
      .field("caseId", caseId)
      .field("title", "x")
      .field("category", "DOCUMENT")
      .attach("file", Buffer.from("not a pdf"), { filename: "fake.pdf", contentType: "application/pdf" });
    expect(fake.status).toBe(415);
    const traversal = await lead
      .post("/evidence/upload")
      .field("caseId", caseId)
      .field("title", "x")
      .field("category", "DOCUMENT")
      .attach("file", pdf, { filename: "../../etc/passwd.pdf", contentType: "application/pdf" });
    expect(traversal.status).toBe(201);
    expect((await db.evidence.findUniqueOrThrow({ where: { id: traversal.body.data.id } })).originalFilename).toBe("passwd.pdf");
  });

  it("downloads with an integrity check and logs every access", async () => {
    const dl = await lead.get(`/evidence/${evidenceId}/file?which=original`).buffer(true).parse(binary);
    expect(dl.status).toBe(200);
    expect(sha(dl.body as Buffer)).toBe(sha(pdf));
    expect(dl.headers["content-disposition"]).toMatch(/attachment/);
    const detail = await lead.get(`/evidence/${evidenceId}/detail`);
    expect(detail.body.data.access.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(["UPLOAD", "DOWNLOAD", "VIEW"]));
    expect((await lead.post(`/evidence/${evidenceId}/verify-hash`)).body.data.ok).toBe(true);
  });

  it("never lets original evidence be deleted", async () => {
    const del = await lead.post(`/evidence/${evidenceId}/delete`).send({ reason: "try" });
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("PROTECTED_RECORD");
    const bulk = await admin.post("/bulk/evidence").send({ action: "SOFT_DELETE", ids: [evidenceId], reason: "try" });
    expect(bulk.body.data.affected).toBe(0);
    expect(bulk.body.data.skipped[0].reason).toMatch(/cannot be deleted/);
  });

  it("makes a statement immutable once its signed copy is uploaded", async () => {
    const st = await lead.post("/party-statements").send({ caseId, kind: "WITNESS_STATEMENT", statementDate: "2026-03-01", recordedBy: "Fictional officer", summary: "Witness account (fictional)" });
    const up = await lead.post(`/party-statements/${st.body.data.id}/signed-copy`).attach("file", pdf, { filename: "signed.pdf", contentType: "application/pdf" });
    expect(up.status).toBe(201);
    expect((await lead.patch(`/party-statements/${st.body.data.id}`).send({ summary: "Changed" })).status).toBe(400);
    expect((await lead.post(`/party-statements/${st.body.data.id}/delete`).send({ reason: "try" })).status).toBe(409);
  });
});

describe("bulk import", () => {
  const csv = readFileSync(path.join(samples, "imports", "invoices-valid-duplicate-invalid.csv"));

  it("validates valid, duplicate and invalid rows without importing anything", async () => {
    const res = await lead
      .post("/imports/validate")
      .field("resource", "invoices")
      .field("caseId", caseId)
      .field("mode", "ATOMIC")
      .field("duplicateStrategy", "SKIP")
      .attach("file", csv, { filename: "invoices.csv", contentType: "text/csv" });
    expect(res.status).toBe(201);
    const b = res.body.data.batch;
    expect(b.totalRows).toBe(6);
    expect(b.validRows).toBe(3);
    expect(b.duplicateRows).toBe(1);
    expect(b.invalidRows).toBe(2);
    expect(await db.invoice.count({ where: { caseId, invoiceNumber: { startsWith: "INV-DEMO-900" } } })).toBe(0);
    // Atomic imports refuse to run with invalid rows.
    expect((await lead.post(`/imports/${b.id}/commit`)).status).toBe(409);
    // Re-uploading the same file with the same settings is idempotent.
    const again = await lead
      .post("/imports/validate")
      .field("resource", "invoices")
      .field("caseId", caseId)
      .field("mode", "ATOMIC")
      .field("duplicateStrategy", "SKIP")
      .attach("file", csv, { filename: "invoices.csv", contentType: "text/csv" });
    expect(again.body.data.batch.id).toBe(b.id);
    const report = await lead.get(`/imports/${b.id}/errors`);
    expect(report.text).toContain("INVALID");
  });

  it("imports valid rows in partial mode and reports the rest", async () => {
    const res = await lead
      .post("/imports/validate")
      .field("resource", "invoices")
      .field("caseId", caseId)
      .field("mode", "PARTIAL")
      .field("duplicateStrategy", "SKIP")
      .attach("file", csv, { filename: "invoices.csv", contentType: "text/csv" });
    const commit = await lead.post(`/imports/${res.body.data.batch.id}/commit`);
    expect(commit.status).toBe(201);
    expect(commit.body.data.status).toBe("PARTIALLY_COMPLETED");
    expect(commit.body.data.importedRows).toBe(3);
    expect(await db.invoice.count({ where: { caseId, invoiceNumber: { startsWith: "INV-DEMO-900" }, importBatchId: res.body.data.batch.id } })).toBe(3);
    expect(await db.auditLog.count({ where: { action: "imports.commit", entityId: res.body.data.batch.id } })).toBe(1);
  });

  it("detects duplicates of existing records and applies the strategy", async () => {
    const stop = await lead
      .post("/imports/validate")
      .field("resource", "invoices")
      .field("caseId", caseId)
      .field("mode", "PARTIAL")
      .field("duplicateStrategy", "STOP_ENTIRE_BATCH")
      .attach("file", csv, { filename: "invoices.csv", contentType: "text/csv" });
    expect(stop.body.data.batch.duplicateRows).toBeGreaterThanOrEqual(3);
    expect((await lead.post(`/imports/${stop.body.data.batch.id}/commit`)).status).toBe(409);
    const upd = Buffer.from("Invoice number,Invoice date,Customer,Invoice amount,Investigator observations\nINV-DEMO-9003,2026-02-12,Fictional Bulk Customer C,4200,Updated by import\n");
    const u = await lead
      .post("/imports/validate")
      .field("resource", "invoices")
      .field("caseId", caseId)
      .field("mode", "ATOMIC")
      .field("duplicateStrategy", "UPDATE_EXISTING")
      .attach("file", upd, { filename: "update.csv", contentType: "text/csv" });
    const done = await lead.post(`/imports/${u.body.data.batch.id}/commit`);
    expect(done.body.data.updatedRows).toBe(1);
    expect((await db.invoice.findFirstOrThrow({ where: { caseId, invoiceNumber: "INV-DEMO-9003", isDeleted: false } })).observations).toBe("Updated by import");
  });

  it("rolls back an atomic import when a row fails at commit", async () => {
    const good = Buffer.from(`Case reference,Title\n${caseRef},Atomic row one\n${caseRef},Atomic row two\n`);
    const v = await lead
      .post("/imports/validate")
      .field("resource", "tasks")
      .field("mode", "ATOMIC")
      .field("duplicateStrategy", "SKIP")
      .attach("file", good, { filename: "tasks.csv", contentType: "text/csv" });
    expect(v.body.data.batch.validRows).toBe(2);
    // Close the case between validation and commit: every row now fails, so nothing is written.
    await db.case.update({ where: { id: caseId }, data: { status: "CLOSED" } });
    const c = await lead.post(`/imports/${v.body.data.batch.id}/commit`);
    await db.case.update({ where: { id: caseId }, data: { status: "UNDER_INTERNAL_INVESTIGATION" } });
    expect(c.status).toBe(201);
    expect(c.body.data.status).toBe("ROLLED_BACK");
    expect(c.body.data.message).toMatch(/closed/);
    expect(await db.task.count({ where: { caseId, title: { startsWith: "Atomic row" } } })).toBe(0);
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: v.body.data.batch.id } })).status).toBe("ROLLED_BACK");
  });

  it("serves import templates", async () => {
    const t = await lead.get("/imports/templates/invoices?format=csv");
    expect(t.text).toContain("Case reference");
    expect(t.text).toContain("Invoice number");
  });
});

describe("statement analysis", () => {
  it("parses a statement in the background, flags patterns and suggests links", async () => {
    const party = await lead.post("/parties").send({ caseId, role: "PERSON_OF_INTEREST", name: "Grace Wanjiku (fictional)", telephone: "0722000222" });
    expect(party.status).toBe(201);
    const file = readFileSync(path.join(samples, "statements", "fictional-mpesa-statement.csv"));
    const up = await lead
      .post("/financial-statements/upload")
      .field("caseId", caseId)
      .field("ownerName", "Brian Otieno (fictional)")
      .field("institutionType", "MPESA")
      .field("institution", "Safaricom M-Pesa")
      .field("account", "0711000111")
      .field("processingAuthority", "Court order (fictional)")
      .field("format", "CSV")
      .attach("file", file, { filename: "statement.csv", contentType: "text/csv" });
    expect(up.status).toBe(201);
    expect(up.body.data.sha256).toBe(sha(file));
    const st = await db.financialStatement.findUniqueOrThrow({ where: { id: up.body.data.id } });
    expect(st.maskedAccount).toBe("••••••0111");
    expect(st.status).toBe("QUEUED");
    await drainQueue();
    const overview = await lead.get(`/financial-statements/${st.id}/overview`);
    expect(overview.body.data.statement.status).toBe("PARSED");
    expect(overview.body.data.statement.transactionCount).toBe(12);
    expect(overview.body.data.flags.DIRECT_TRANSFER).toBeGreaterThan(0);
    const links = await lead.get(`/financial-statements/${st.id}/links?status=SUGGESTED`);
    const phone = links.body.data.find((l: { linkClass: string }) => l.linkClass === "TELEPHONE_NUMBER_MATCH");
    expect(phone).toBeTruthy();
    expect((await lead.post(`/transaction-links/${phone.id}/review`).send({ status: "REJECTED" })).status).toBe(400); // note required
    expect((await lead.post(`/transaction-links/${phone.id}/review`).send({ status: "CONFIRMED" })).status).toBe(201);
    const mm = await lead.get(`/cases/${caseId}/money-movement`);
    expect(mm.body.data.notice).toMatch(/not proof/);
    expect(mm.body.data.edges.length).toBeGreaterThan(0);
    const schedule = await lead.get(`/financial-statements/${st.id}/export?format=csv`);
    expect(schedule.text).toContain("leads, not proof");
    // The original statement cannot be deleted.
    expect((await admin.post(`/financial-statements/${st.id}/delete`).send({ reason: "try" })).status).toBe(409);
  });
});

describe("permanent deletion", () => {
  it("requires re-authentication, a second approver and passing checks", async () => {
    const t = await lead.post("/tasks").send({ caseId, title: "Purge me (fictional)" });
    await lead.post(`/tasks/${t.body.data.id}/delete`).send({ reason: "Created in error" });
    const noReauth = await admin.post("/deletion-requests").send({ entityType: "tasks", entityIds: [t.body.data.id], reason: "Created in error by a test run" });
    expect(noReauth.status).toBe(403);
    expect(noReauth.body.error.code).toBe("REAUTHENTICATION_REQUIRED");
    expect((await admin.post("/auth/reauthenticate").send({ password: "wrong" })).status).toBe(401);
    expect((await admin.post("/auth/reauthenticate").send({ password: PASSWORD })).status).toBe(201);
    expect((await admin.put("/settings").send({ "retention.minRecycleDays": 0 })).status).toBe(200);
    const req = await admin.post("/deletion-requests").send({ entityType: "tasks", entityIds: [t.body.data.id], reason: "Created in error by a test run" });
    expect(req.status).toBe(201);
    expect(req.body.data.status).toBe("PENDING");
    // The requester cannot approve their own request.
    const self = await admin.post(`/deletion-requests/${req.body.data.id}/decision`).send({ approve: true, comment: "self" });
    expect(self.status).toBe(403);
    expect((await compliance.post("/auth/reauthenticate").send({ password: PASSWORD })).status).toBe(201);
    const ok = await compliance.post(`/deletion-requests/${req.body.data.id}/decision`).send({ approve: true, comment: "Verified" });
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe("EXECUTED");
    expect(await db.task.count({ where: { id: t.body.data.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "permanent_deletion.execute", entityId: req.body.data.id } })).toBe(1);
  });

  it("blocks protected records and records that are not in the Recycle Bin", async () => {
    const ev = await db.evidence.findFirstOrThrow({ where: { caseId } });
    const blocked = await admin.post("/deletion-requests").send({ entityType: "evidence", entityIds: [ev.id], reason: "Attempt to purge evidence in a test" });
    expect(blocked.body.data.status).toBe("BLOCKED");
    const live = await lead.post("/tasks").send({ caseId, title: "Still live" });
    const notDeleted = await admin.post("/deletion-requests").send({ entityType: "tasks", entityIds: [live.body.data.id], reason: "Attempt to purge a live task in a test" });
    expect(notDeleted.body.data.status).toBe("BLOCKED");
    expect(adminId).toBeTruthy();
  });
});

describe("reports and search", () => {
  it("generates reports in every format and keeps history", async () => {
    for (const format of ["PDF", "DOCX", "XLSX", "CSV"]) {
      const r = await admin.post("/reports/generate").send({ key: "invoice-schedule", format, caseId }).buffer(true).parse(binary);
      expect(r.status, format).toBe(200);
      expect((r.body as Buffer).length).toBeGreaterThan(100);
      if (format === "PDF") expect((r.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    }
    expect((await admin.get("/reports")).body.meta.total).toBeGreaterThanOrEqual(4);
    const catalog = await admin.get("/reports/catalog");
    expect(catalog.body.data).toHaveLength(19);
  });

  it("searches invoices, people and amounts within visible cases", async () => {
    const s = await lead.get("/search?q=INV-DEMO-9001");
    expect(s.body.data.some((h: { type: string }) => h.type === "invoices")).toBe(true);
    const outsider = await login(server, (await makeUser("INVESTIGATOR")).username);
    const none = await outsider.get("/search?q=INV-DEMO-9001");
    expect(none.body.data).toHaveLength(0);
  });
});
