import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { ApiError, notFound } from "@/server/api/errors";
import { AuthorizationError, caseVisibilityWhere, requireCaseAccess, requirePermission } from "@/server/authz";
import { toCurrentUser, type CurrentUser } from "@/server/auth/principal";
import { nextYearReference } from "@/server/references";
import { createNotifications } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";
import { createResource, getResourceRow, loadVisible, shapeRows, updateResource, type Row } from "@/server/resources/service";
import { RESOURCE_MAP } from "@/lib/resources/registry";
import type { ResourceDef } from "@/lib/resources/types";
import { assertMakerChecker, can, canApproveDataChanges, inScope } from "@/lib/permissions";

// Maker-checker for ordinary data entry. Record types listed in the "approvals.recordTypes" setting
// do not change when someone saves a form or commits an import: the change is fully validated (as
// the requester, inside a transaction that is rolled back), stored as a ChangeRequest, and applied
// only when a different user with approval rights approves it. Applying re-runs the same service
// call as the requester, so permissions, case access, references and optimistic locking are all
// checked again against the data as it is at approval time.

export async function requiresApproval(resourceKey: string): Promise<boolean> {
  return (await getSetting("approvals.recordTypes")).includes(resourceKey);
}

/** Thrown to roll back a validation-only run while keeping its result. */
class DryRunComplete extends Error {
  constructor(public readonly result: Row) {
    super("dry run");
  }
}

async function dryRun(fn: (tx: Tx) => Promise<Row>): Promise<Row> {
  try {
    await prisma.$transaction(async (tx) => {
      throw new DryRunComplete(await fn(tx));
    });
  } catch (e) {
    if (e instanceof DryRunComplete) return e.result;
    throw e;
  }
  throw new Error("unreachable");
}

/** Plain JSON copy of a row (Decimal → string, Date → ISO) for storage and display. */
function toJson(row: Row): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(row, (_k, v: unknown) => (v && typeof v === "object" && "toFixed" in v && "isNegative" in v ? String(v) : v))) as Prisma.InputJsonObject;
}

function caseIdOf(r: ResourceDef, row: Row): string | null {
  if (r.key === "cases") return null;
  if (typeof row.caseId === "string") return row.caseId;
  const matter = row.matter as Row | undefined;
  return typeof matter?.caseId === "string" ? matter.caseId : null;
}

function describe(r: ResourceDef, row: Row, op: "CREATE" | "UPDATE", changed?: number): string {
  const ref = r.referenceField ? row[r.referenceField] : null;
  const title = row[r.titleField];
  const name = [typeof ref === "string" ? ref : null, typeof title === "string" ? title : null].filter(Boolean).join(" — ");
  if (op === "CREATE") return `New ${r.label.toLowerCase()}${name ? `: ${name}` : ""}`.slice(0, 300);
  return `Edit ${r.label.toLowerCase()}${name ? ` ${name}` : ""} (${changed} field${changed === 1 ? "" : "s"})`.slice(0, 300);
}

export interface PendingResult {
  pendingApproval: true;
  changeRequest: { id: string; reference: string; summary: string };
  message: string;
}

async function notifyApprovers(tx: Tx, cr: { id: string; reference: string; summary: string; requestedById: string }) {
  const approvers = await tx.user.findMany({
    where: { status: "ACTIVE", id: { not: cr.requestedById }, OR: [{ role: "SYSTEM_ADMIN" }, { dataApprover: true }] },
    select: { id: true },
    take: 500,
  });
  if (!approvers.length) return;
  await createNotifications(
    tx,
    approvers.map((a) => ({
      userId: a.id,
      kind: "APPROVAL",
      title: "Data change awaiting approval",
      body: `${cr.reference}: ${cr.summary}`,
      link: `/admin/approvals?id=${cr.id}`,
      dedupeKey: `change:${cr.id}`,
    })),
  );
}

async function store(
  user: CurrentUser,
  data: {
    resourceKey: string;
    operation: "CREATE" | "UPDATE" | "IMPORT";
    recordId?: string | null;
    caseId: string | null;
    summary: string;
    payload: Prisma.InputJsonObject;
    baseVersion?: number | null;
  },
  tx?: Tx,
): Promise<PendingResult> {
  const run = async (db: Tx) => {
    const reference = await nextYearReference(db, "changeRequest");
    const cr = await db.changeRequest.create({ data: { ...data, reference, requestedById: user.id } });
    await audit(
      {
        action: "change_requests.submit",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "changeRequest",
        entityId: cr.id,
        caseId: data.caseId,
        details: { reference, resource: data.resourceKey, operation: data.operation, recordId: data.recordId ?? null },
      },
      db,
    );
    await notifyApprovers(db, cr);
    return cr;
  };
  const cr = tx ? await run(tx) : await prisma.$transaction(run);
  return {
    pendingApproval: true,
    changeRequest: { id: cr.id, reference: cr.reference, summary: cr.summary },
    message: `Submitted for approval as ${cr.reference}. It takes effect once an approver accepts it.`,
  };
}

/** Validates a new record exactly as a normal save would, then holds it for approval. */
export async function submitCreate(r: ResourceDef, user: CurrentUser, input: unknown): Promise<PendingResult> {
  await requirePermission(user, r.module, "CREATE");
  const preview = await dryRun((tx) => createResource(r, user, input, { tx }));
  const caseId = r.key === "cases" ? null : caseIdOf(r, preview);
  return store(user, { resourceKey: r.key, operation: "CREATE", caseId, summary: describe(r, preview, "CREATE"), payload: { input: input as Prisma.InputJsonObject, preview: toJson(preview) } });
}

/** Validates an edit exactly as a normal save would (including the version check), then holds it. */
export async function submitUpdate(r: ResourceDef, user: CurrentUser, id: string, input: Record<string, unknown>): Promise<PendingResult> {
  await requirePermission(user, r.module, "EDIT");
  const open = await prisma.changeRequest.findFirst({ where: { resourceKey: r.key, recordId: id, status: "PENDING" }, select: { reference: true } });
  if (open) throw new ApiError(409, "CONFLICT", `This record already has a change awaiting approval (${open.reference}). Wait for the decision, or ask the submitter to withdraw it.`);
  const existing = await loadVisible(r, user, id);
  const preview = await dryRun((tx) => updateResource(r, user, id, input, { tx }));
  const changed = Object.keys(input).filter((k) => k !== "version").length;
  const caseId = r.key === "cases" ? id : caseIdOf(r, existing);
  return store(user, {
    resourceKey: r.key,
    operation: "UPDATE",
    recordId: id,
    caseId,
    summary: describe(r, existing, "UPDATE", changed),
    payload: { input: input as Prisma.InputJsonObject, preview: toJson(preview) },
    baseVersion: typeof existing.version === "number" ? existing.version : null,
  });
}

/** Holds a validated import batch for approval instead of committing it. */
export async function submitImport(
  user: CurrentUser,
  batch: { id: string; reference: string; entityType: string; caseId: string | null; validRows: number; duplicateRows: number },
): Promise<PendingResult> {
  const r = RESOURCE_MAP[batch.entityType]!;
  return prisma.$transaction(async (tx) => {
    const flipped = await tx.importBatch.updateMany({ where: { id: batch.id, status: { in: ["VALIDATED", "ROLLED_BACK"] } }, data: { status: "AWAITING_APPROVAL" } });
    if (!flipped.count) throw new ApiError(409, "CONFLICT", "The batch is already awaiting approval or being imported.");
    return store(
      user,
      {
        resourceKey: r.key,
        operation: "IMPORT",
        recordId: batch.id,
        caseId: batch.caseId,
        summary: `Import ${batch.reference}: ${batch.validRows + batch.duplicateRows} ${r.plural.toLowerCase()} row(s)`,
        payload: { batchId: batch.id },
      },
      tx,
    );
  });
}

// ───────────────────── Review ─────────────────────

const listSelect = {
  id: true,
  reference: true,
  resourceKey: true,
  operation: true,
  recordId: true,
  caseId: true,
  summary: true,
  status: true,
  requestedAt: true,
  reviewedAt: true,
  reviewComment: true,
  appliedRecordId: true,
  failureReason: true,
  requestedById: true,
  requestedBy: { select: { fullName: true, username: true } },
  reviewer: { select: { fullName: true } },
  case: { select: { reference: true, title: true } },
} satisfies Prisma.ChangeRequestSelect;

/** Approvers see changes on cases they can view (and case-less ones); everyone else sees only their own. */
export async function listChangeRequests(user: CurrentUser, opts: { status?: Prisma.ChangeRequestWhereInput["status"]; mine: boolean }, page: number, pageSize: number) {
  const approver = canApproveDataChanges(user);
  const scope: Prisma.ChangeRequestWhereInput =
    opts.mine || !approver ? { requestedById: user.id } : { OR: [{ caseId: null }, { case: caseVisibilityWhere(user, "CASES") }, { requestedById: user.id }] };
  const where: Prisma.ChangeRequestWhereInput = { AND: [scope, opts.status ? { status: opts.status } : {}] };
  const [total, rows] = await Promise.all([
    prisma.changeRequest.count({ where }),
    prisma.changeRequest.findMany({ where, select: listSelect, orderBy: [{ requestedAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows: rows.map((r) => ({ ...r, canDecide: r.status === "PENDING" && approver && r.requestedById !== user.id })) };
}

/** Throws unless the user may review this change: approval rights, not their own, and access to the record. */
async function assertReviewer(user: CurrentUser, cr: { requestedById: string; resourceKey: string; caseId: string | null; payload: Prisma.JsonValue }) {
  if (!canApproveDataChanges(user)) throw new AuthorizationError("You do not have permission to approve data changes.");
  assertMakerChecker(cr.requestedById, user.id);
  const r = RESOURCE_MAP[cr.resourceKey];
  if (!r) throw notFound("Record type");
  if (cr.caseId) await requireCaseAccess(user, cr.caseId, r.module, "VIEW");
  else if (!can(user, r.module, "VIEW")) throw new AuthorizationError();
  // A new case: the reviewer must cover its company and branch, like the person opening it.
  if (r.key === "cases" && user.role !== "SYSTEM_ADMIN") {
    const input = ((cr.payload as Row | null)?.input ?? {}) as Row;
    if (typeof input.companyId !== "string" || !inScope(user.scopes, input.companyId, typeof input.branchId === "string" ? input.branchId : null)) {
      throw new AuthorizationError("This case is outside your company and branch scope.");
    }
  }
}

export async function changeRequestDetail(user: CurrentUser, id: string) {
  const cr = await prisma.changeRequest.findUnique({ where: { id }, select: { ...listSelect, payload: true, baseVersion: true } });
  if (!cr) throw notFound("Change request");
  const own = cr.requestedById === user.id;
  if (!own)
    await assertReviewer(user, cr).catch(async (e) => {
      // Decided changes stay readable to approvers who could have decided them; everyone else gets 404.
      if (e instanceof AuthorizationError || e instanceof ApiError) throw notFound("Change request");
      throw e;
    });
  const r = RESOURCE_MAP[cr.resourceKey]!;
  const payload = (cr.payload ?? {}) as Row;
  // Masked the same way as the record itself would be for this viewer.
  const [proposed] = payload.preview ? await shapeRows(r, user, [payload.preview as Row]) : [null];
  let current: Row | null = null;
  if (cr.operation === "UPDATE" && cr.recordId) current = await getResourceRow(r, user, cr.recordId).catch(() => null);
  const changedFields = cr.operation === "UPDATE" ? Object.keys((payload.input ?? {}) as Row).filter((k) => k !== "version") : null;
  const { payload: _raw, ...rest } = cr;
  void _raw;
  return {
    ...rest,
    canDecide: cr.status === "PENDING" && !own && canApproveDataChanges(user),
    canWithdraw: cr.status === "PENDING" && own,
    proposed,
    current,
    changedFields,
    stale: cr.operation === "UPDATE" && current !== null && cr.baseVersion !== null && current.version !== cr.baseVersion,
    importBatchId: cr.operation === "IMPORT" ? cr.recordId : null,
  };
}

/** The requester as a principal, with their current role, scopes and restrictions. */
async function requesterPrincipal(userId: string): Promise<CurrentUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { scopes: true } });
  if (u.status !== "ACTIVE") throw new ApiError(409, "INVALID_TRANSITION", "The person who submitted this change no longer has an active account, so it cannot be applied.");
  return toCurrentUser({
    id: "change-approval",
    tokenHash: "",
    userId,
    expiresAt: new Date(),
    lastSeenAt: new Date(),
    mfaVerified: true,
    reauthAt: null,
    ipAddress: null,
    userAgent: null,
    revokedAt: null,
    createdAt: new Date(),
    user: u,
  });
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = e.details && typeof e.details === "object" && "fields" in e.details ? Object.values((e.details as { fields: Record<string, string> }).fields) : [];
    return [e.message, ...fields].join(" ").slice(0, 1000);
  }
  if (e instanceof AuthorizationError) return "The submitter no longer has permission to make this change.";
  if (e instanceof Error && e.name === "ZodError") return "The submitted values are no longer valid.";
  return "The change could not be applied.";
}

async function notifyRequester(cr: { id: string; reference: string; summary: string; requestedById: string }, outcome: string) {
  await prisma.notification.create({
    data: { userId: cr.requestedById, kind: "APPROVAL", title: `Change ${outcome}`, body: `${cr.reference}: ${cr.summary}`, link: `/admin/approvals?id=${cr.id}` },
  });
}

export async function decideChangeRequest(user: CurrentUser, id: string, approve: boolean, comment?: string) {
  const cr = await prisma.changeRequest.findUnique({ where: { id } });
  if (!cr) throw notFound("Change request");
  await assertReviewer(user, cr);
  if (cr.status !== "PENDING") throw new ApiError(409, "INVALID_TRANSITION", "This change has already been decided.");
  if (!approve && !comment?.trim()) throw new ApiError(422, "VALIDATION_FAILED", "Give a reason for rejecting the change.", { fields: { comment: "A reason is required." } });

  const decided = { reviewerId: user.id, reviewedAt: new Date(), reviewComment: comment?.trim() || null };
  const auditBase = { actorId: user.id, actorLabel: user.username, entityType: "changeRequest", entityId: id, caseId: cr.caseId };

  if (!approve) {
    await prisma.$transaction(async (tx) => {
      const res = await tx.changeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", ...decided } });
      if (!res.count) throw new ApiError(409, "INVALID_TRANSITION", "This change has already been decided.");
      if (cr.operation === "IMPORT" && cr.recordId)
        await tx.importBatch.updateMany({ where: { id: cr.recordId, status: "AWAITING_APPROVAL" }, data: { status: "CANCELLED", completedAt: new Date() } });
      await audit({ ...auditBase, action: "change_requests.reject", reason: comment ?? null, details: { reference: cr.reference } }, tx);
    });
    await notifyRequester(cr, "rejected");
    return { status: "REJECTED" };
  }

  const r = RESOURCE_MAP[cr.resourceKey]!;
  const input = ((cr.payload as Row).input ?? {}) as Record<string, unknown>;

  if (cr.operation === "IMPORT") {
    // Claim first; the import runs in its own transactions (or as a background job for large files).
    const claimed = await prisma.changeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPLIED", ...decided, appliedRecordId: cr.recordId } });
    if (!claimed.count) throw new ApiError(409, "INVALID_TRANSITION", "This change has already been decided.");
    await prisma.importBatch.updateMany({ where: { id: cr.recordId!, status: "AWAITING_APPROVAL" }, data: { status: "VALIDATED" } });
    try {
      const { commitImport } = await import("@/server/imports/service");
      const result = await commitImport(await requesterPrincipal(cr.requestedById), cr.recordId!, { approved: true });
      await audit({ ...auditBase, action: "change_requests.approve", details: { reference: cr.reference, import: cr.recordId } });
      await notifyRequester(cr, "approved");
      return { status: "APPLIED", result };
    } catch (e) {
      await prisma.changeRequest.update({ where: { id }, data: { status: "FAILED", failureReason: errorText(e) } });
      await audit({ ...auditBase, action: "change_requests.apply_failed", outcome: "FAILURE", reason: errorText(e), details: { reference: cr.reference } });
      await notifyRequester(cr, "could not be applied");
      throw new ApiError(409, "CONFLICT", `The import could not be started: ${errorText(e)}`);
    }
  }

  const requester = await requesterPrincipal(cr.requestedById).catch(async (e) => {
    await prisma.changeRequest.update({ where: { id }, data: { status: "FAILED", failureReason: errorText(e), ...decided } });
    throw e;
  });
  try {
    const applied = await prisma.$transaction(async (tx) => {
      const claimed = await tx.changeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPLIED", ...decided } });
      if (!claimed.count) throw new ApiError(409, "INVALID_TRANSITION", "This change has already been decided.");
      const row =
        cr.operation === "CREATE"
          ? await createResource(r, requester, input, { tx })
          : await updateResource(r, requester, cr.recordId!, { ...input, version: cr.baseVersion ?? input.version }, { tx });
      await tx.changeRequest.update({ where: { id }, data: { appliedRecordId: String(row.id), ...(r.key === "cases" && cr.operation === "CREATE" ? { caseId: String(row.id) } : {}) } });
      await audit({ ...auditBase, action: "change_requests.approve", details: { reference: cr.reference, recordId: String(row.id), resource: r.key, operation: cr.operation } }, tx);
      return row;
    });
    await notifyRequester(cr, "approved");
    return { status: "APPLIED", recordId: String(applied.id) };
  } catch (e) {
    if (e instanceof ApiError && e.code === "INVALID_TRANSITION") throw e;
    const reason = errorText(e);
    await prisma.changeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED", failureReason: reason, ...decided } });
    await audit({ ...auditBase, action: "change_requests.apply_failed", outcome: "FAILURE", reason, details: { reference: cr.reference } });
    await notifyRequester(cr, "could not be applied");
    throw new ApiError(409, "CONFLICT", `The change could not be applied: ${reason} It has been marked as failed; the submitter can make it again.`);
  }
}

export async function withdrawChangeRequest(user: CurrentUser, id: string) {
  const cr = await prisma.changeRequest.findUnique({ where: { id }, select: { requestedById: true, operation: true, recordId: true, reference: true, caseId: true } });
  if (!cr || cr.requestedById !== user.id) throw notFound("Change request");
  await prisma.$transaction(async (tx) => {
    const res = await tx.changeRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "WITHDRAWN", reviewedAt: new Date() } });
    if (!res.count) throw new ApiError(409, "INVALID_TRANSITION", "Only a pending change can be withdrawn.");
    if (cr.operation === "IMPORT" && cr.recordId) await tx.importBatch.updateMany({ where: { id: cr.recordId, status: "AWAITING_APPROVAL" }, data: { status: "VALIDATED" } });
    await audit(
      { action: "change_requests.withdraw", actorId: user.id, actorLabel: user.username, entityType: "changeRequest", entityId: id, caseId: cr.caseId, details: { reference: cr.reference } },
      tx,
    );
  });
  return { status: "WITHDRAWN" };
}
