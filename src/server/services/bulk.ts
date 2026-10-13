import "server-only";
import type { BulkActionType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import { AuthorizationError, requireCaseAccess, requirePermission } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import type { CurrentUser } from "@/server/auth/principal";
import { nextYearReference } from "@/server/references";
import { applyLifecycle, buildWhere, caseIdWhere, delegate, loadVisible, scopeWhere, shapeRows, type Row } from "@/server/resources/service";
import { exportResponse, type ExportColumn } from "@/server/services/exporter";
import { ENUMS } from "@/lib/enums";
import { RESOURCES } from "@/lib/resources/registry";
import type { ResourceDef } from "@/lib/resources/types";
import { can, type Action } from "@/lib/permissions";
import { stringArray } from "@/lib/string-array";

export const MAX_BULK = 5000;
const MAX_EXPORT = 50_000;

export interface BulkFilter {
  caseId?: string;
  matterId?: string;
  q?: string;
  filters?: Record<string, string>;
  deleted?: "only";
  archived?: "only";
}

/** Resolves the target ids: explicit ids, or every record matching the filter the user can see. */
async function resolveIds(r: ResourceDef, user: CurrentUser, ids: string[] | undefined, filter: BulkFilter | undefined, limit: number): Promise<string[]> {
  if (ids?.length) {
    if (ids.length > limit) throw badRequest(`Select at most ${limit} records per batch.`);
    return [...new Set(ids)];
  }
  if (!filter) throw badRequest("Select records or provide a filter.");
  const where = buildWhere(r, user, { ...filter, deleted: filter.deleted ?? "exclude", archived: filter.archived ?? "exclude" });
  const total = await delegate(prisma, r.model).count({ where });
  if (total > limit) throw badRequest(`The filter matches ${total} records; narrow it to at most ${limit}.`);
  const rows = await delegate(prisma, r.model).findMany({ where, select: { id: true } });
  return rows.map((x) => String(x.id));
}

type LifecycleBulk = "ARCHIVE" | "UNARCHIVE" | "SOFT_DELETE" | "RESTORE";
const LIFECYCLE = { ARCHIVE: "archive", UNARCHIVE: "unarchive", SOFT_DELETE: "soft_delete", RESTORE: "restore" } as const satisfies Record<LifecycleBulk, string>;

const ACTION_PERMISSION: Record<BulkActionType, Action> = {
  ARCHIVE: "ARCHIVE",
  UNARCHIVE: "ARCHIVE",
  SOFT_DELETE: "SOFT_DELETE",
  RESTORE: "RESTORE",
  REASSIGN: "EDIT",
  CHANGE_STATUS: "EDIT",
  EXPORT: "EXPORT",
};

async function updateField(tx: Tx, r: ResourceDef, user: CurrentUser, id: string, field: string, value: string, batchId: string, reason?: string) {
  const row = await loadVisible(r, user, id);
  const caseId = r.key === "cases" ? id : String(row.caseId ?? (row.matter as Row | undefined)?.caseId);
  const subject = await requireCaseAccess(user, caseId, r.module, "EDIT");
  if (subject.status === "CLOSED" && r.key !== "cases") return "The case is closed.";
  if (row[field] === value) return "Already set to that value.";
  await delegate(tx, r.model).update({ where: { id }, data: { [field]: value, ...(row.version !== undefined ? { version: { increment: 1 } } : {}) } });
  if (r.key === "cases" && field === "leadInvestigatorId") {
    await tx.caseAssignment.upsert({
      where: { caseId_userId_role: { caseId: id, userId: value, role: "LEAD" } },
      update: { active: true, endedAt: null },
      create: { caseId: id, userId: value, role: "LEAD", assignedById: user.id },
    });
  }
  await audit(
    {
      action: `${r.key}.bulk_update`,
      actorId: user.id,
      actorLabel: user.username,
      entityType: r.model,
      entityId: id,
      caseId,
      reason: reason ?? null,
      before: { [field]: row[field] },
      after: { [field]: value },
      details: { batchId },
    },
    tx,
  );
  return null;
}

export async function runBulkAction(r: ResourceDef, user: CurrentUser, input: { action: BulkActionType; ids?: string[]; filter?: BulkFilter; reason?: string; assigneeId?: string; status?: string }) {
  if (input.action === "EXPORT") throw badRequest("Use the export endpoint.");
  const perm = ACTION_PERMISSION[input.action];
  await requirePermission(user, r.module, perm);
  if ((input.action === "SOFT_DELETE" || input.action === "RESTORE") && !input.reason?.trim()) throw badRequest("A reason is required.");
  let field: string | undefined;
  if (input.action === "REASSIGN") {
    field = r.assigneeField;
    if (!field) throw badRequest(`${r.plural} cannot be reassigned.`);
    if (!input.assigneeId || !(await prisma.user.findFirst({ where: { id: input.assigneeId, status: "ACTIVE" } }))) throw badRequest("Choose an active user.");
  }
  if (input.action === "CHANGE_STATUS") {
    const f = r.fields.find((x) => x.name === r.statusField);
    if (!f || f.workflow || !f.enum) throw badRequest(`The status of ${r.plural.toLowerCase()} is changed through its workflow.`);
    if (!input.status || !(ENUMS[f.enum] as readonly string[]).includes(input.status)) throw badRequest("Choose a valid value.");
    field = f.name;
  }
  const filter = input.action === "RESTORE" ? { ...input.filter, deleted: "only" as const } : input.action === "UNARCHIVE" ? { ...input.filter, archived: "only" as const } : input.filter;
  const ids = await resolveIds(r, user, input.ids, filter, MAX_BULK);
  const reference = await nextYearReference(prisma, "bulk");

  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.bulkActionBatch.create({
        data: {
          reference,
          action: input.action,
          entityType: r.key,
          reason: input.reason ?? null,
          parameters: { assigneeId: input.assigneeId ?? null, status: input.status ?? null } as Prisma.InputJsonValue,
          recordIds: [],
          affectedCount: 0,
          createdById: user.id,
        },
      });
      const affected: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      for (const id of ids) {
        try {
          let skip: string | null;
          if (input.action === "REASSIGN" || input.action === "CHANGE_STATUS") {
            skip = await updateField(tx, r, user, id, field!, input.action === "REASSIGN" ? input.assigneeId! : input.status!, batch.id, input.reason);
          } else {
            skip = await applyLifecycle(r, user, id, LIFECYCLE[input.action as LifecycleBulk], { reason: input.reason, batchId: batch.id, tx });
          }
          if (skip) skipped.push({ id, reason: skip });
          else affected.push(id);
        } catch (e) {
          if (e instanceof AuthorizationError || (e instanceof ApiError && e.status === 404)) skipped.push({ id, reason: "Not found or access denied." });
          else throw e; // anything unexpected rolls the whole batch back
        }
      }
      await tx.bulkActionBatch.update({ where: { id: batch.id }, data: { recordIds: affected, affectedCount: affected.length, skipped: skipped as unknown as Prisma.InputJsonValue } });
      await audit(
        {
          action: `bulk.${input.action.toLowerCase()}`,
          actorId: user.id,
          actorLabel: user.username,
          entityType: "bulkActionBatch",
          entityId: batch.id,
          reason: input.reason ?? null,
          details: { reference, resource: r.key, affected: affected.length, skipped: skipped.length },
        },
        tx,
      );
      return { id: batch.id, reference, affected: affected.length, skipped };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

/** Restores every record deleted by one soft-delete batch, in a single transaction. */
export async function restoreBatch(user: CurrentUser, batchId: string, reason: string) {
  const batch = await prisma.bulkActionBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound("Batch");
  if (batch.action !== "SOFT_DELETE") throw badRequest("Only deletion batches can be restored.");
  if (batch.restoredAt) throw new ApiError(409, "CONFLICT", "This batch has already been restored.");
  const r = RESOURCES.find((x) => x.key === batch.entityType);
  if (!r) throw badRequest("Unknown record type.");
  await requirePermission(user, r.module, "RESTORE");
  if (!reason.trim()) throw badRequest("A reason is required.");
  return prisma.$transaction(
    async (tx) => {
      const restored: string[] = [];
      const skipped: { id: string; reason: string }[] = [];
      for (const id of stringArray(batch.recordIds, "recordIds")) {
        try {
          const skip = await applyLifecycle(r, user, id, "restore", { reason, tx });
          if (skip) skipped.push({ id, reason: skip });
          else restored.push(id);
        } catch (e) {
          if (e instanceof AuthorizationError || (e instanceof ApiError && e.status === 404)) skipped.push({ id, reason: "Not found or access denied." });
          else throw e;
        }
      }
      await tx.bulkActionBatch.update({ where: { id: batchId }, data: { restoredAt: new Date(), restoredById: user.id } });
      await audit(
        {
          action: "bulk.restore_batch",
          actorId: user.id,
          actorLabel: user.username,
          entityType: "bulkActionBatch",
          entityId: batchId,
          reason,
          details: { reference: batch.reference, restored: restored.length, skipped: skipped.length },
        },
        tx,
      );
      return { reference: batch.reference, affected: restored.length, skipped };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export async function listBatches(user: CurrentUser, page: number, pageSize: number) {
  await requirePermission(user, "DATA_ADMIN", "VIEW");
  const [total, rows] = await Promise.all([prisma.bulkActionBatch.count(), prisma.bulkActionBatch.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.flatMap((b) => [b.createdById, b.restoredById].filter(Boolean) as string[]))] } },
    select: { id: true, fullName: true },
  });
  const names = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return {
    total,
    rows: rows.map((b) => ({
      ...b,
      recordIds: undefined,
      recordCount: stringArray(b.recordIds, "recordIds").length,
      createdBy: names[b.createdById] ?? "Unknown",
      restoredBy: b.restoredById ? names[b.restoredById] : null,
    })),
  };
}

/** Recycle Bin summary: deleted record counts per type the user may restore. */
export async function recycleBinSummary(user: CurrentUser) {
  const counts = await Promise.all(
    RESOURCES.filter((r) => r.softDelete !== false).map(async (r) => {
      if (!can(user, r.module, "RESTORE")) return null;
      const n = await delegate(prisma, r.model).count({ where: { AND: [scopeWhere(r, user, { includeDeletedCases: true }), { isDeleted: true }] } });
      return { resource: r.key, label: r.plural, count: n };
    }),
  );
  return counts.filter(Boolean);
}

// ───────────────────── Exports ─────────────────────

export function exportColumns(r: ResourceDef): ExportColumn[] {
  const cols: ExportColumn[] = r.key === "cases" ? [] : [{ key: "_caseReference", label: "Case reference" }];
  for (const f of r.fields) {
    if (f.hidden) continue;
    cols.push({
      key: f.type === "user" || f.type === "relation" || f.type === "company" || f.type === "branch" ? `_label_${f.name}` : f.name,
      label: f.label,
      money: f.type === "money" || (f.type === "computed" && /amount|balance|expenditure/i.test(f.name)),
    });
  }
  return cols;
}

export async function exportRecords(r: ResourceDef, user: CurrentUser, input: { format: "csv" | "xlsx"; ids?: string[]; filter?: BulkFilter }) {
  await requirePermission(user, r.module, "EXPORT");
  if (input.filter?.deleted) await requirePermission(user, r.module, "RESTORE");
  let where: Row;
  if (input.ids?.length) {
    if (input.ids.length > MAX_EXPORT) throw badRequest(`Export at most ${MAX_EXPORT} records at a time.`);
    where = { AND: [buildWhere(r, user, { deleted: "include", archived: "include" }), { id: { in: input.ids } }] };
  } else {
    const f = input.filter ?? {};
    where = buildWhere(r, user, { ...f, deleted: f.deleted ?? "exclude", archived: f.archived ?? "exclude" });
    if (f.caseId) where = { AND: [where, caseIdWhere(r, f.caseId)] };
  }
  const total = await delegate(prisma, r.model).count({ where });
  if (total > MAX_EXPORT) throw badRequest(`The export matches ${total} records; narrow the filters to at most ${MAX_EXPORT}.`);
  const include =
    r.key === "cases"
      ? undefined
      : r.scope === "case"
        ? { case: { select: { reference: true, currency: true } } }
        : { matter: { select: { caseId: true, case: { select: { reference: true, currency: true } } } } };
  const rows = await delegate(prisma, r.model).findMany({ where, orderBy: [{ [r.defaultSort.field]: r.defaultSort.order }, { id: "asc" }], include });
  const shaped = await shapeRows(r, user, rows);
  const flat = shaped.map((row) => {
    const out: Row = { ...row, _caseReference: (row.case as Row | undefined)?.reference };
    for (const [k, v] of Object.entries((row._labels as Record<string, string>) ?? {})) out[`_label_${k}`] = v;
    for (const [k, v] of Object.entries(out)) if (v instanceof Date) out[k] = v.toISOString();
    return out;
  });
  await audit({ action: `${r.key}.export`, actorId: user.id, actorLabel: user.username, details: { rows: flat.length, format: input.format } });
  if (flat.length > 5000) {
    await raiseAlert({ type: "LARGE_EXPORT", severity: "WARNING", message: `${user.username} exported ${flat.length} ${r.plural.toLowerCase()} records.`, subjectUserId: user.id });
  }
  return exportResponse(input.format, r.key, exportColumns(r), flat, [`SIMS export — ${r.plural}`, `Generated ${new Date().toISOString()} by ${user.fullName}. Confidential.`]);
}
