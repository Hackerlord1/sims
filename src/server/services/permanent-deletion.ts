import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import { requirePermission } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import { listMeta, ListResult } from "@/server/api/router";
import type { CurrentUser } from "@/server/auth/principal";
import { REAUTH_WINDOW_MS } from "@/server/auth/session";
import { nextYearReference } from "@/server/references";
import { deletionBlocker, delegate, type Row } from "@/server/resources/service";
import { getSetting } from "@/server/services/settings";
import { getResource } from "@/lib/resources/registry";
import { assertMakerChecker } from "@/lib/permissions";
import { stringArray } from "@/lib/string-array";

/** Record types that may never be permanently deleted, whatever their state. */
const NEVER_PURGE: Record<string, string> = {
  evidence: "Original evidence is never permanently deleted.",
  "financial-statements": "Original financial statements are never permanently deleted.",
};

/** Child rows that must be purged first (resource key → [model, foreign key]). */
const DEPENDENTS: Record<string, [string, string][]> = {
  cases: [
    ["subFile", "caseId"],
    ["party", "caseId"],
    ["invoice", "caseId"],
    ["cheque", "caseId"],
    ["interview", "caseId"],
    ["partyStatement", "caseId"],
    ["evidence", "caseId"],
    ["workLog", "caseId"],
    ["task", "caseId"],
    ["finding", "caseId"],
    ["criminalMatter", "caseId"],
    ["civilMatter", "caseId"],
    ["disciplinaryCase", "caseId"],
    ["writeOff", "caseId"],
    ["expense", "caseId"],
    ["advance", "caseId"],
    ["budget", "caseId"],
    ["recovery", "caseId"],
    ["financialStatement", "caseId"],
    ["knownAccount", "caseId"],
    ["generatedReport", "caseId"],
  ],
  subfiles: [
    ["invoice", "subFileId"],
    ["cheque", "subFileId"],
    ["evidence", "subFileId"],
    ["workLog", "subFileId"],
    ["task", "subFileId"],
    ["expense", "subFileId"],
    ["recovery", "subFileId"],
    ["finding", "subFileId"],
    ["writeOff", "subFileId"],
    ["financialStatement", "subFileId"],
  ],
  parties: [
    ["interview", "partyId"],
    ["partyStatement", "partyId"],
    ["financialStatement", "relatedPartyId"],
    ["knownAccount", "partyId"],
  ],
  invoices: [
    ["recovery", "invoiceId"],
    ["chequeInvoice", "invoiceId"],
  ],
  cheques: [
    ["recovery", "chequeId"],
    ["chequeInvoice", "chequeId"],
    ["cheque", "replacementChequeId"],
  ],
  "work-logs": [["task", "sourceWorkLogId"]],
  "party-statements": [["interview", "signedStatementId"]],
  advances: [["expense", "advanceId"]],
  "criminal-matters": [["criminalMilestone", "matterId"]],
  "civil-matters": [
    ["courtEvent", "matterId"],
    ["recovery", "civilMatterId"],
  ],
  findings: [["managementDecision", "findingId"]],
};

export interface RecordCheck {
  id: string;
  ok: boolean;
  problems: string[];
}

async function checkRecord(key: string, id: string): Promise<RecordCheck> {
  const r = getResource(key)!;
  const problems: string[] = [];
  const never = NEVER_PURGE[key];
  if (never) return { id, ok: false, problems: [never] };
  const row = await delegate(prisma, r.model).findFirst({
    where: { id },
    include:
      r.scope === "case" && key !== "cases"
        ? { case: { select: { legalHold: true, status: true, actualClosureDate: true } } }
        : r.scope !== "case"
          ? { matter: { select: { case: { select: { legalHold: true, status: true, actualClosureDate: true } } } } }
          : undefined,
  });
  if (!row) return { id, ok: false, problems: ["Record not found."] };
  if (!row.isDeleted) problems.push("Move the record to the Recycle Bin first.");
  // Protection and legal holds
  const blocker = await deletionBlocker(r, row);
  if (blocker) problems.push(blocker);
  // Retention
  const minDays = await getSetting("retention.minRecycleDays");
  const deletedAt = row.deletedAt as Date | null;
  if (deletedAt && Date.now() - deletedAt.getTime() < minDays * 86_400_000) problems.push(`Records must stay in the Recycle Bin for ${minDays} day(s) before permanent deletion.`);
  const c = (key === "cases" ? row : ((row.case as Row | undefined) ?? ((row.matter as Row | undefined)?.case as Row | undefined))) as
    { status?: string; actualClosureDate?: Date | null; legalHold?: boolean } | undefined;
  if (c?.legalHold) problems.push("The case is under legal hold.");
  if (c?.status === "CLOSED" && c.actualClosureDate) {
    const years = await getSetting("retention.closedCaseYears");
    const until = new Date(c.actualClosureDate);
    until.setUTCFullYear(until.getUTCFullYear() + years);
    if (until.getTime() > Date.now()) problems.push(`Closed-case records are retained until ${until.toISOString().slice(0, 10)}.`);
  }
  if (key === "cases" && row.legalHold) problems.push("The case is under legal hold.");
  // Dependencies
  for (const [model, fk] of DEPENDENTS[key] ?? []) {
    const n = await delegate(prisma, model).count({ where: { [fk]: id } });
    if (n) problems.push(`${n} dependent ${model} record(s) must be removed first.`);
  }
  return { id, ok: problems.length === 0, problems };
}

function assertRecentReauth(user: CurrentUser) {
  if (!user.reauthAt || Date.now() - new Date(user.reauthAt).getTime() > REAUTH_WINDOW_MS) {
    throw new ApiError(403, "REAUTHENTICATION_REQUIRED", "Confirm your password to continue.");
  }
}

export async function requestDeletion(user: CurrentUser, input: { entityType: string; entityIds: string[]; reason: string }) {
  await requirePermission(user, "DATA_ADMIN", "REQUEST_PERMANENT_DELETION");
  assertRecentReauth(user);
  const r = getResource(input.entityType);
  if (!r) throw badRequest("Unknown record type.");
  const ids = [...new Set(input.entityIds)];
  if (!ids.length || ids.length > 500) throw badRequest("Select between 1 and 500 records.");
  if (input.reason.trim().length < 10) throw badRequest("Give a reason of at least 10 characters.");
  const checks = await Promise.all(ids.map((id) => checkRecord(r.key, id)));
  const blocked = checks.some((c) => !c.ok);
  const reference = await nextYearReference(prisma, "deletion");
  const req = await prisma.$transaction(async (tx) => {
    const created = await tx.deletionRequest.create({
      data: {
        reference,
        entityType: r.key,
        entityIds: ids,
        reason: input.reason,
        checks: checks as unknown as Prisma.InputJsonValue,
        status: blocked ? "BLOCKED" : "PENDING",
        requestedById: user.id,
        requesterReauthAt: new Date(user.reauthAt!),
      },
    });
    await audit(
      {
        action: "permanent_deletion.request",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "deletionRequest",
        entityId: created.id,
        reason: input.reason,
        details: { reference, resource: r.key, records: ids.length, blocked },
      },
      tx,
    );
    return created;
  });
  return req;
}

async function purge(tx: Tx, key: string, ids: string[]) {
  const r = getResource(key)!;
  for (const id of ids) {
    if (key === "cases") {
      // Case history is append-only (database triggers). A PurgeToken for this case on this
      // transaction's connection is the one exception; it is uncommitted, so no other connection
      // can see it, and it is removed again below before the transaction commits.
      await tx.$executeRaw`INSERT INTO \`PurgeToken\` (\`caseId\`, \`connectionId\`) VALUES (${id}, CONNECTION_ID())`;
      await tx.caseStatusHistory.deleteMany({ where: { caseId: id } });
      await tx.caseClosure.deleteMany({ where: { caseId: id } });
      await tx.caseReopening.deleteMany({ where: { caseId: id } });
      await tx.caseAssignment.deleteMany({ where: { caseId: id } });
    }
    if (key === "findings") await tx.recommendation.deleteMany({ where: { findingId: id } });
    await delegate(tx, r.model).delete({ where: { id } });
    if (key === "cases") {
      const removed = await tx.$executeRaw`DELETE FROM \`PurgeToken\` WHERE \`caseId\` = ${id} AND \`connectionId\` = CONNECTION_ID()`;
      if (removed !== 1) throw new Error("Purge token was not removed; the purge has been rolled back.");
    }
  }
}

export async function decideDeletion(user: CurrentUser, id: string, input: { approve: boolean; comment: string }) {
  await requirePermission(user, "DATA_ADMIN", "APPROVE_PERMANENT_DELETION");
  assertRecentReauth(user);
  const req = await prisma.deletionRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Deletion request");
  if (req.status !== "PENDING") throw new ApiError(409, "INVALID_TRANSITION", "Only pending requests can be decided.");
  const entityIds = stringArray(req.entityIds, "entityIds");
  assertMakerChecker(req.requestedById, user.id);
  if (!input.comment.trim()) throw badRequest("A comment is required.");
  if (!input.approve) {
    await prisma.$transaction(async (tx) => {
      await tx.deletionRequest.update({
        where: { id },
        data: { status: "REJECTED", approverId: user.id, approverReauthAt: new Date(user.reauthAt!), decidedAt: new Date(), decisionComment: input.comment },
      });
      await audit({ action: "permanent_deletion.reject", actorId: user.id, actorLabel: user.username, entityType: "deletionRequest", entityId: id, reason: input.comment }, tx);
    });
    return { status: "REJECTED" };
  }
  // Re-run every check at execution time: state may have changed since the request.
  const checks = await Promise.all(entityIds.map((rid) => checkRecord(req.entityType, rid)));
  if (checks.some((c) => !c.ok)) {
    await prisma.deletionRequest.update({
      where: { id },
      data: { status: "BLOCKED", checks: checks as unknown as Prisma.InputJsonValue, approverId: user.id, decidedAt: new Date(), decisionComment: `Blocked at approval: ${input.comment}` },
    });
    throw new ApiError(409, "PROTECTED_RECORD", "The records no longer pass the deletion checks. The request has been blocked.", { checks });
  }
  await prisma.$transaction(
    async (tx) => {
      await purge(tx, req.entityType, entityIds);
      await tx.deletionRequest.update({
        where: { id },
        data: { status: "EXECUTED", approverId: user.id, approverReauthAt: new Date(user.reauthAt!), decidedAt: new Date(), executedAt: new Date(), decisionComment: input.comment },
      });
      await audit(
        {
          action: "permanent_deletion.execute",
          actorId: user.id,
          actorLabel: user.username,
          entityType: "deletionRequest",
          entityId: id,
          reason: input.comment,
          details: { reference: req.reference, resource: req.entityType, recordIds: entityIds, requestedBy: req.requestedById },
        },
        tx,
      );
    },
    { timeout: 120_000 },
  );
  await raiseAlert({
    type: "PERMANENT_DELETION",
    severity: "HIGH",
    message: `${entityIds.length} ${req.entityType} record(s) permanently deleted under ${req.reference}.`,
    subjectUserId: user.id,
  });
  return { status: "EXECUTED" };
}

export async function cancelDeletion(user: CurrentUser, id: string) {
  const req = await prisma.deletionRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Deletion request");
  if (req.requestedById !== user.id) throw new ApiError(403, "FORBIDDEN", "Only the requester can cancel this request.");
  if (!["PENDING", "BLOCKED"].includes(req.status)) throw new ApiError(409, "INVALID_TRANSITION", "This request can no longer be cancelled.");
  await prisma.$transaction(async (tx) => {
    await tx.deletionRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await audit({ action: "permanent_deletion.cancel", actorId: user.id, actorLabel: user.username, entityType: "deletionRequest", entityId: id }, tx);
  });
  return { status: "CANCELLED" };
}

export async function listDeletionRequests(user: CurrentUser, page: number, pageSize: number) {
  await requirePermission(user, "DATA_ADMIN", "VIEW");
  const [total, rows] = await Promise.all([prisma.deletionRequest.count(), prisma.deletionRequest.findMany({ orderBy: { requestedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.flatMap((r) => [r.requestedById, r.approverId].filter(Boolean) as string[]))] } },
    select: { id: true, fullName: true },
  });
  const names = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return new ListResult(
    rows.map((r) => ({
      ...r,
      requestedBy: names[r.requestedById] ?? "Unknown",
      approver: r.approverId ? names[r.approverId] : null,
      resourceLabel: getResource(r.entityType)?.plural ?? r.entityType,
    })),
    listMeta(page, pageSize, total),
  );
}
