import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextSequence } from "@/server/references";
import { company, db, makeUser } from "./helpers";

let userId: string;
let caseId: string;
let fileId: string;

beforeAll(async () => {
  const { company: c } = await company();
  userId = (await makeUser("LEAD_INVESTIGATOR")).id;
  caseId = (await db.case.create({ data: { reference: `TEST/${randomUUID()}`, title: "Guard test", companyId: c.id, category: "OTHER", createdById: userId } })).id;
  fileId = (
    await db.storedFile.create({
      data: { sha256: "a".repeat(64), storageKey: `aa/${randomUUID().replace(/-/g, "")}${"0".repeat(16)}`, originalName: "x.pdf", mimeType: "application/pdf", sizeBytes: 10, uploadedById: userId },
    })
  ).id;
});
afterAll(() => db.$disconnect());

describe("reference counters", () => {
  it("never hands out duplicates under concurrency", async () => {
    const key = `TEST:${randomUUID()}`;
    const values = await Promise.all(Array.from({ length: 25 }, () => db.$transaction((tx) => nextSequence(tx, key))));
    expect(new Set(values).size).toBe(25);
    expect(Math.max(...values)).toBe(25);
  });

  it("makes case references immutable", async () => {
    await expect(db.case.update({ where: { id: caseId }, data: { reference: "CHANGED" } })).rejects.toThrow(/immutable/);
  });
});

describe("append-only history", () => {
  it("blocks updating or deleting audit log entries", async () => {
    const row = await db.auditLog.create({ data: { action: "test.event", actorLabel: "test" } });
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  // A purge transaction holds a PurgeToken (caseId, CONNECTION_ID()) while it removes that case's
  // history; the token is uncommitted, so no other connection can use it.
  it("blocks deleting case history except inside a purge of that case", async () => {
    const h = await db.caseStatusHistory.create({ data: { caseId, toStatus: "DRAFT", changedById: userId } });
    await expect(db.caseStatusHistory.delete({ where: { id: h.id } })).rejects.toThrow(/append-only/);
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO PurgeToken (caseId, connectionId) VALUES (${"another-case"}, CONNECTION_ID())`;
        await tx.caseStatusHistory.delete({ where: { id: h.id } });
      }),
    ).rejects.toThrow(/append-only/);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO PurgeToken (caseId, connectionId) VALUES (${caseId}, CONNECTION_ID())`;
      await tx.caseStatusHistory.delete({ where: { id: h.id } });
      await tx.$executeRaw`DELETE FROM PurgeToken WHERE caseId = ${caseId} AND connectionId = CONNECTION_ID()`;
    });
    expect(await db.caseStatusHistory.count({ where: { id: h.id } })).toBe(0);
    expect(await db.purgeToken.count()).toBe(0);
  });

  it("refuses a purge token issued for another connection", async () => {
    await expect(db.$executeRaw`INSERT INTO PurgeToken (caseId, connectionId) VALUES (${caseId}, CONNECTION_ID() + 1)`).rejects.toThrow(/current connection/);
  });

  // MariaDB does not fire triggers for foreign-key cascades, so these guards sit on the parent row.
  it("blocks deleting a case that has history outside a purge (no silent cascade)", async () => {
    const { company: c } = await company();
    const doomed = await db.case.create({ data: { reference: `TEST/${randomUUID()}`, title: "Cascade test", companyId: c.id, category: "OTHER", createdById: userId } });
    await db.caseStatusHistory.create({ data: { caseId: doomed.id, toStatus: "DRAFT", changedById: userId } });
    await expect(db.case.delete({ where: { id: doomed.id } })).rejects.toThrow(/append-only/);
    expect(await db.caseStatusHistory.count({ where: { caseId: doomed.id } })).toBe(1);
  });

  it("blocks deleting a user referenced by the audit log (no silent SET NULL)", async () => {
    const actor = await makeUser("INVESTIGATOR");
    await db.auditLog.create({ data: { action: "test.event", actorId: actor.id, actorLabel: actor.username } });
    await expect(db.user.delete({ where: { id: actor.id } })).rejects.toThrow(/cannot be deleted/);
    expect(await db.auditLog.count({ where: { actorId: actor.id } })).toBe(1);
  });
});

describe("evidence protection", () => {
  it("never deletes, soft-deletes or re-hashes original evidence", async () => {
    const ev = await db.evidence.create({
      data: {
        reference: `EV/${randomUUID()}`,
        caseId,
        sequence: 1,
        title: "Original",
        category: "DOCUMENT",
        uploadedById: userId,
        originalFileId: fileId,
        sha256: "a".repeat(64),
        originalFilename: "x.pdf",
      },
    });
    await expect(db.evidence.delete({ where: { id: ev.id } })).rejects.toThrow(/cannot be deleted/);
    await expect(db.evidence.update({ where: { id: ev.id }, data: { isDeleted: true } })).rejects.toThrow(/cannot be deleted/);
    await expect(db.evidence.update({ where: { id: ev.id }, data: { sha256: "b".repeat(64) } })).rejects.toThrow(/immutable/);
    await expect(db.storedFile.delete({ where: { id: fileId } })).rejects.toThrow(/cannot be deleted/);
    // Metadata may still change, and archiving is allowed.
    await db.evidence.update({ where: { id: ev.id }, data: { notes: "Reviewed", archivedAt: new Date() } });
  });
});

describe("financial records", () => {
  it("keeps verified recoveries immutable", async () => {
    const r = await db.recovery.create({
      data: { reference: `REC/${randomUUID()}`, caseId, recoveryDate: new Date(), payer: "Fictional payer", method: "CASH", grossAmount: "100.00", recordedById: userId, status: "VERIFIED" },
    });
    await expect(db.recovery.update({ where: { id: r.id }, data: { grossAmount: "200.00" } })).rejects.toThrow(/immutable/);
    await expect(db.recovery.update({ where: { id: r.id }, data: { isDeleted: true } })).rejects.toThrow(/cannot be deleted/);
    await expect(db.recovery.delete({ where: { id: r.id } })).rejects.toThrow(/cannot be deleted/);
  });

  it("enforces money constraints", async () => {
    await expect(db.cheque.create({ data: { caseId, chequeNumber: "1", bank: "B", issuer: "I", amount: "-5.00", createdById: userId } })).rejects.toThrow();
    await expect(
      db.expense.create({
        data: {
          reference: `EXP/${randomUUID()}`,
          caseId,
          category: "FUEL",
          description: "x",
          expenseDate: new Date(),
          amountBeforeTax: "100.00",
          tax: "10.00",
          totalAmount: "100.00",
          requestedAmount: "100.00",
          createdById: userId,
        },
      }),
    ).rejects.toThrow(/expense_amounts_valid/);
  });

  it("protects signed statements", async () => {
    const st = await db.partyStatement.create({ data: { caseId, kind: "WITNESS_STATEMENT", statementDate: new Date(), recordedBy: "T", summary: "Original", createdById: userId } });
    await db.partyStatement.update({ where: { id: st.id }, data: { signed: true } });
    await expect(db.partyStatement.update({ where: { id: st.id }, data: { summary: "Changed" } })).rejects.toThrow(/immutable/);
    await expect(db.partyStatement.update({ where: { id: st.id }, data: { isDeleted: true } })).rejects.toThrow(/cannot be deleted/);
  });
});

describe("legal hold", () => {
  it("prevents deleting a case under legal hold", async () => {
    await db.case.update({ where: { id: caseId }, data: { legalHold: true } });
    await expect(db.case.update({ where: { id: caseId }, data: { isDeleted: true } })).rejects.toThrow(/legal hold/);
    await db.case.update({ where: { id: caseId }, data: { legalHold: false } });
  });
});
