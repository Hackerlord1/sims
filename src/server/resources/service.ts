import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { AuthorizationError, caseVisibilityWhere, requireCaseAccess, requirePermission, type CaseSubject } from "@/server/authz";
import { ApiError, badRequest, notFound, protectedRecord, staleVersion } from "@/server/api/errors";
import { ListResult, listMeta } from "@/server/api/router";
import type { CurrentUser } from "@/server/auth/principal";
import { HOOKS, type Row } from "@/server/resources/hooks";
import { computeFields } from "@/server/resources/computed";
import { LINK_TYPES, RESOURCE_MAP, getResource } from "@/lib/resources/registry";
import { createSchema, updateSchema } from "@/lib/resources/schema";
import type { FieldDef, ResourceDef } from "@/lib/resources/types";
import { can, canSeeSensitiveIdentifiers, inScope, visibleLevels, type Action } from "@/lib/permissions";
import { maskAccount, maskId, maskPhone } from "@/lib/masking";

// ───────────────────── Prisma delegate access ─────────────────────

interface Delegate {
  findMany(args: unknown): Promise<Row[]>;
  findFirst(args: unknown): Promise<Row | null>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
  updateMany(args: unknown): Promise<{ count: number }>;
  delete(args: unknown): Promise<Row>;
}

export function delegate(db: Tx | typeof prisma, model: string): Delegate {
  const d = (db as unknown as Record<string, Delegate | undefined>)[model];
  if (!d) throw new Error(`Unknown model ${model}`);
  return d;
}

export function requireResource(key: string): ResourceDef {
  const r = getResource(key);
  if (!r) throw new ApiError(404, "NOT_FOUND", "Unknown record type.");
  return r;
}

// ───────────────────── Scope filters ─────────────────────

/** Filter limiting rows of a resource to cases the user may view in that module. */
export function scopeWhere(r: ResourceDef, user: CurrentUser, opts: { includeDeletedCases?: boolean } = {}): Row {
  const visible = caseVisibilityWhere(user, r.module) as Row;
  const caseFilter = opts.includeDeletedCases ? visible : { AND: [visible, { isDeleted: false }] };
  if (r.key === "cases") return visible;
  if (r.scope === "case") return { case: caseFilter };
  return { matter: { case: caseFilter } };
}

export function caseIdWhere(r: ResourceDef, caseId: string): Row {
  if (r.key === "cases") return { id: caseId };
  if (r.scope === "case") return { caseId };
  return { matter: { caseId } };
}

// ───────────────────── Listing ─────────────────────

export interface ListParams {
  page: number;
  pageSize: number;
  sort?: string;
  order?: "asc" | "desc";
  q?: string;
  caseId?: string;
  matterId?: string;
  /** "exclude" (default) | "include" | "only" */
  deleted?: "exclude" | "include" | "only";
  archived?: "exclude" | "include" | "only";
  filters?: Record<string, string>;
}

const SORT_TYPES = new Set(["text", "money", "number", "date", "datetime", "enum", "boolean"]);

function fieldFilters(r: ResourceDef, filters: Record<string, string>): Row[] {
  const and: Row[] = [];
  for (const [key, raw] of Object.entries(filters)) {
    const value = raw.trim();
    if (!value) continue;
    const [op, name] = key.includes(".") ? (key.split(".", 2) as [string, string]) : ["eq", key];
    const f = r.fields.find((x) => x.name === name);
    if (!f || f.type === "computed") continue;
    if (op === "eq") {
      if (f.type === "enum") and.push({ [f.name]: { in: value.split(",").slice(0, 30) } });
      else if (f.type === "boolean") and.push({ [f.name]: value === "true" });
      else if (value === "none") and.push({ [f.name]: null });
      else and.push({ [f.name]: value });
    } else if ((op === "from" || op === "to") && (f.type === "date" || f.type === "datetime")) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        if (op === "to") d.setUTCHours(23, 59, 59, 999);
        and.push({ [f.name]: op === "from" ? { gte: d } : { lte: d } });
      }
    } else if ((op === "min" || op === "max") && (f.type === "money" || f.type === "number")) {
      if (/^\d+(\.\d{1,2})?$/.test(value)) and.push({ [f.name]: op === "min" ? { gte: value } : { lte: value } });
    }
  }
  return and;
}

export function buildWhere(r: ResourceDef, user: CurrentUser, p: Omit<ListParams, "page" | "pageSize">): Row {
  const and: Row[] = [scopeWhere(r, user, { includeDeletedCases: p.deleted === "only" })];
  // Item-level classification (evidence, parties) is filtered on top of case visibility.
  and.push(...itemLevel(r, user));
  if (p.caseId) and.push(caseIdWhere(r, p.caseId));
  if (p.matterId && r.scope !== "case") and.push({ matterId: p.matterId });
  if (r.softDelete !== false) {
    if ((p.deleted ?? "exclude") === "exclude") and.push({ isDeleted: false });
    if (p.deleted === "only") and.push({ isDeleted: true });
    if ((p.archived ?? "exclude") === "exclude" && p.deleted !== "only") and.push({ archivedAt: null });
    if (p.archived === "only") and.push({ archivedAt: { not: null } });
  }
  if (p.q) {
    const searchable = r.fields.filter((f) => f.searchable && f.type !== "computed");
    if (searchable.length) {
      // Case-insensitive through the columns' utf8mb4_unicode_ci collation.
      and.push({ OR: searchable.map((f) => ({ [f.name]: { contains: p.q } })) });
    }
  }
  if (p.filters) and.push(...fieldFilters(r, p.filters));
  return { AND: and };
}

const NULLABLE = new Map<string, Set<string>>(
  Prisma.dmmf.datamodel.models.map((m) => [m.name.charAt(0).toLowerCase() + m.name.slice(1), new Set(m.fields.filter((f) => !f.isRequired).map((f) => f.name))]),
);
const isNullable = (model: string, field: string) => NULLABLE.get(model)?.has(field) ?? false;

function orderBy(r: ResourceDef, sort?: string, order?: "asc" | "desc"): Row[] {
  const f = sort ? r.fields.find((x) => x.name === sort && (x.sortable || x.list) && SORT_TYPES.has(x.type)) : undefined;
  const field = f?.name ?? r.defaultSort.field;
  const dir = f ? (order ?? "asc") : (order ?? r.defaultSort.order);
  // Nullable columns sort their empty values last; the id tiebreaker keeps pagination stable.
  const sortSpec = isNullable(r.model, field) ? { sort: dir, nulls: "last" } : dir;
  return [{ [field]: sortSpec }, { id: dir }];
}

function include(r: ResourceDef): Row | undefined {
  if (r.key === "cases") return { company: { select: { name: true, code: true } }, branch: { select: { name: true } } };
  if (r.key === "subfiles") {
    return {
      case: { select: { id: true, reference: true, title: true, currency: true } },
      _count: { select: { invoices: { where: { isDeleted: false } }, cheques: { where: { isDeleted: false } } } },
    };
  }
  if (r.scope === "case") return { case: { select: { id: true, reference: true, title: true, currency: true } } };
  return { matter: { select: { id: true, caseId: true, case: { select: { id: true, reference: true, title: true, currency: true } } } } };
}

export async function listResource(r: ResourceDef, user: CurrentUser, p: ListParams) {
  if (p.deleted && p.deleted !== "exclude") await requirePermission(user, r.module, "RESTORE");
  const where = buildWhere(r, user, p);
  const d = delegate(prisma, r.model);
  const [total, rows] = await Promise.all([d.count({ where }), d.findMany({ where, orderBy: orderBy(r, p.sort, p.order), skip: (p.page - 1) * p.pageSize, take: p.pageSize, include: include(r) })]);
  const shaped = await shapeRows(r, user, rows);
  return new ListResult(shaped, listMeta(p.page, p.pageSize, total, p.sort, p.order));
}

function itemLevel(r: ResourceDef, user: CurrentUser): Row[] {
  if (r.key === "evidence") return [{ confidentiality: { in: visibleLevels(user) } }];
  if (r.key === "parties") return [{ accessClassification: { in: visibleLevels(user) } }];
  return [];
}

/** Loads one row the user may see, or throws 404. */
export async function loadVisible(r: ResourceDef, user: CurrentUser, id: string, opts: { deleted?: boolean } = {}) {
  const where: Row = { AND: [{ id }, scopeWhere(r, user, { includeDeletedCases: opts.deleted }), ...itemLevel(r, user)] };
  const row = await delegate(prisma, r.model).findFirst({ where, include: include(r) });
  if (!row || (row.isDeleted && !opts.deleted)) throw notFound(r.label);
  return row;
}

/** One row. Deleted rows are visible only to users who may restore them (Recycle Bin). */
export async function getResourceRow(r: ResourceDef, user: CurrentUser, id: string) {
  const mayRestore = can(user, r.module, "RESTORE");
  const row = await loadVisible(r, user, id, { deleted: mayRestore });
  const [shaped] = await shapeRows(r, user, [row]);
  return shaped;
}

// ───────────────────── Output shaping (labels, computed, masking) ─────────────────────

/** Resolves display labels for user, relation, company and branch fields with one query per target. */
async function resolveLabels(r: ResourceDef, rows: Row[]): Promise<Record<string, Record<string, string>>> {
  const labels: Record<string, Record<string, string>> = {};
  const byTarget = new Map<string, { fields: FieldDef[]; ids: Set<string> }>();
  for (const f of r.fields) {
    if (!["user", "relation", "company", "branch"].includes(f.type)) continue;
    const target = f.type === "relation" ? `rel:${f.relation}` : f.type;
    const entry = byTarget.get(target) ?? { fields: [], ids: new Set<string>() };
    entry.fields.push(f);
    for (const row of rows) {
      const v = row[f.name];
      if (typeof v === "string") entry.ids.add(v);
    }
    byTarget.set(target, entry);
  }
  await Promise.all(
    [...byTarget.entries()].map(async ([target, { fields, ids }]) => {
      if (!ids.size) return;
      const idList = [...ids];
      let map: Record<string, string> = {};
      if (target === "user") {
        const users = await prisma.user.findMany({ where: { id: { in: idList } }, select: { id: true, fullName: true } });
        map = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
      } else if (target === "company") {
        const cs = await prisma.company.findMany({ where: { id: { in: idList } }, select: { id: true, name: true } });
        map = Object.fromEntries(cs.map((c) => [c.id, c.name]));
      } else if (target === "branch") {
        const bs = await prisma.branch.findMany({ where: { id: { in: idList } }, select: { id: true, name: true } });
        map = Object.fromEntries(bs.map((b) => [b.id, b.name]));
      } else {
        const tr = RESOURCE_MAP[target.slice(4)];
        if (!tr) return;
        const select: Row = { id: true, [tr.titleField]: true };
        if (tr.referenceField) select[tr.referenceField] = true;
        const found = await delegate(prisma, tr.model).findMany({ where: { id: { in: idList } }, select });
        map = Object.fromEntries(found.map((t) => [String(t.id), rowLabel(tr, t)]));
      }
      for (const f of fields) {
        labels[f.name] = map;
      }
    }),
  );
  return labels;
}

export function rowLabel(r: ResourceDef, row: Row): string {
  const title = row[r.titleField];
  const titleText = typeof title === "string" ? (title.length > 60 ? title.slice(0, 57) + "…" : title) : String(title ?? "");
  const ref = r.referenceField ? row[r.referenceField] : null;
  if (ref && r.referenceField !== r.titleField) return `${ref} — ${titleText}`;
  return titleText;
}

function mask(f: FieldDef, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (f.sensitive === "account") return maskAccount(value);
  if (f.sensitive === "phone") return maskPhone(value);
  if (f.sensitive === "id") return maskId(value);
  return value;
}

export async function shapeRows(r: ResourceDef, user: CurrentUser, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const [labels, computed] = await Promise.all([resolveLabels(r, rows), computeFields(r, rows)]);
  const showSensitive = canSeeSensitiveIdentifiers(user);
  return rows.map((row) => {
    const out: Row = { ...row };
    const rowLabels: Record<string, string> = {};
    for (const [field, map] of Object.entries(labels)) {
      const v = row[field];
      if (typeof v === "string" && map[v]) rowLabels[field] = map[v]!;
    }
    out._labels = rowLabels;
    Object.assign(out, computed.get(String(row.id)) ?? {});
    if (!showSensitive) {
      for (const f of r.fields) if (f.sensitive) out[f.name] = mask(f, row[f.name]);
    }
    if (r.scope !== "case") {
      const matter = row.matter as Row | undefined;
      out.caseId = matter?.caseId;
      out.case = matter?.case;
      delete out.matter;
    }
    return out;
  });
}

// ───────────────────── Mutations ─────────────────────

/** Resolves the case a new or existing row belongs to. */
async function caseIdFor(r: ResourceDef, data: Row, existing?: Row): Promise<string> {
  if (r.key === "cases") return String(existing?.id);
  if (r.scope === "case") return String(existing?.caseId ?? data.caseId);
  const matterId = String(data.matterId ?? existing?.matterId ?? "");
  const model = r.scope === "criminal-matter" ? "criminalMatter" : "civilMatter";
  const matter = await delegate(prisma, model).findFirst({ where: { id: matterId, isDeleted: false }, select: { caseId: true } });
  if (!matter) throw badRequest("The selected matter does not exist.");
  return String(matter.caseId);
}

/** Rejects relation ids that point at another case, deleted rows, unknown users or foreign scopes. */
async function validateReferences(r: ResourceDef, data: Row, caseId: string | null, user: CurrentUser) {
  if (data.linkType !== undefined || data.linkId !== undefined) {
    const linkType = data.linkType as string | null | undefined;
    if (linkType && !LINK_TYPES[linkType]) throw badRequest("Unsupported linked record type.");
    if (data.linkId && (!linkType || !caseId)) throw badRequest("A linked record needs a record type.");
    if (data.linkId && linkType && caseId) {
      const tr = RESOURCE_MAP[LINK_TYPES[linkType]!]!;
      const found = await delegate(prisma, tr.model).findFirst({ where: { AND: [{ id: data.linkId }, caseIdWhere(tr, caseId)] }, select: { id: true } });
      if (!found) throw badRequest("The linked record does not belong to this case.");
    }
  }
  for (const f of r.fields) {
    const v = data[f.name];
    if (typeof v !== "string" || !v) continue;
    if (f.type === "user") {
      const u = await prisma.user.findFirst({ where: { id: v, status: "ACTIVE" }, select: { id: true } });
      if (!u) throw new ApiError(422, "VALIDATION_FAILED", `${f.label}: user not found or inactive.`, { fields: { [f.name]: "User not found or inactive." } });
    } else if (f.type === "company") {
      const c = await prisma.company.findUnique({ where: { id: v }, select: { id: true } });
      if (!c) throw new ApiError(422, "VALIDATION_FAILED", `${f.label}: not found.`, { fields: { [f.name]: "Not found." } });
      if (user.role !== "SYSTEM_ADMIN" && !inScope(user.scopes, v, (data.branchId as string) ?? null)) {
        throw new AuthorizationError("You cannot create or move cases outside your company and branch scope.");
      }
    } else if (f.type === "branch") {
      const companyId = data.companyId;
      const b = await prisma.branch.findFirst({ where: { id: v, ...(typeof companyId === "string" ? { companyId } : {}) }, select: { id: true } });
      if (!b) throw new ApiError(422, "VALIDATION_FAILED", `${f.label}: not found for this company.`, { fields: { [f.name]: "Branch does not belong to the company." } });
    } else if (f.type === "relation" && caseId) {
      const tr = RESOURCE_MAP[f.relation!];
      if (!tr) continue;
      const where: Row = { AND: [{ id: v }, caseIdWhere(tr, caseId), ...(tr.softDelete !== false ? [{ isDeleted: false }] : [])] };
      const found = await delegate(prisma, tr.model).findFirst({ where, select: { id: true } });
      if (!found) {
        throw new ApiError(422, "VALIDATION_FAILED", `${f.label}: not found in this case.`, { fields: { [f.name]: "Not found in this case." } });
      }
    }
  }
}

async function touchCase(tx: Tx, caseId: string) {
  await tx.case.update({ where: { id: caseId }, data: { lastActivityAt: new Date() } });
}

function assertCaseWritable(subject: CaseSubject, r: ResourceDef) {
  if (subject.status === "CLOSED" && r.key !== "cases") {
    throw new ApiError(409, "INVALID_TRANSITION", "This case is closed. Reopen it before changing its records.");
  }
}

export interface CreateOptions {
  tx?: Tx;
  importBatchId?: string;
  skipAudit?: boolean;
  /**
   * Set by the bulk importer, which has already checked case access and resolved every reference
   * for the batch during validation. Skips those per-row lookups.
   */
  prechecked?: { subject: CaseSubject | null };
}

export async function createResource(r: ResourceDef, user: CurrentUser, input: unknown, opts: CreateOptions = {}) {
  // Permission first, so unauthorised callers learn nothing from validation errors.
  if (!opts.prechecked) await requirePermission(user, r.module, "CREATE");
  if (r.uploadOnly) throw badRequest(`${r.plural} are added by uploading a file.`);
  const data = createSchema(r).parse(input) as Row;
  // Blank optional fields arrive as null; omit them so column defaults (e.g. amounts of 0) apply.
  for (const k of Object.keys(data)) if (data[k] === null || data[k] === undefined) delete data[k];
  let subject: CaseSubject | null = null;
  if (opts.prechecked) {
    subject = opts.prechecked.subject;
    if (subject && r.scope === "case" && r.key !== "cases") data.caseId = subject.id;
  } else if (r.key === "cases") {
    await requirePermission(user, "CASES", "CREATE");
  } else {
    const caseId = await caseIdFor(r, data);
    subject = await requireCaseAccess(user, caseId, r.module, "CREATE");
    assertCaseWritable(subject, r);
    if (r.scope === "case") data.caseId = caseId;
  }
  if (!opts.prechecked) await validateReferences(r, data, subject?.id ?? null, user);

  const run = async (tx: Tx) => {
    const hooks = HOOKS[r.key];
    await hooks?.beforeCreate?.(data, { tx, user, caseRow: subject });
    // Recoveries record their author as recordedById (set by the hook) rather than createdById.
    const record: Row = r.key === "recoveries" ? { ...data } : { ...data, createdById: user.id };
    if (opts.importBatchId && IMPORT_COLUMN_MODELS.has(r.model)) record.importBatchId = opts.importBatchId;
    const created = await delegate(tx, r.model).create({ data: record });
    const caseId = r.key === "cases" ? String(created.id) : subject!.id;
    if (r.key === "cases") {
      await tx.caseStatusHistory.create({ data: { caseId, toStatus: "DRAFT", changedById: user.id, reason: "Case opened" } });
      if (created.leadInvestigatorId) {
        await tx.caseAssignment.create({ data: { caseId, userId: String(created.leadInvestigatorId), role: "LEAD", assignedById: user.id } });
      }
    } else {
      await touchCase(tx, caseId);
    }
    if (!opts.skipAudit) {
      await audit({ action: `${r.key}.create`, actorId: user.id, actorLabel: user.username, entityType: r.model, entityId: String(created.id), caseId, after: created }, tx);
    }
    return created;
  };
  const created = opts.tx ? await run(opts.tx) : await prisma.$transaction(run);
  return created;
}

/** Models with an importBatchId column, so imported rows stay traceable to their batch. */
const IMPORT_COLUMN_MODELS = new Set(["invoice", "cheque", "workLog", "task", "expense", "advance", "recovery", "criminalMilestone", "courtEvent"]);

export async function updateResource(r: ResourceDef, user: CurrentUser, id: string, input: unknown, opts: { tx?: Tx } = {}) {
  await requirePermission(user, r.module, "EDIT");
  const data = updateSchema(r).parse(input) as Row;
  const version = data.version as number | undefined;
  delete data.version;
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  const cleared = Object.keys(data).filter((k) => data[k] === null && !isNullable(r.model, k));
  if (cleared.length) {
    const fields = Object.fromEntries(cleared.map((k) => [k, `${r.fields.find((f) => f.name === k)?.label ?? k} cannot be empty.`]));
    throw new ApiError(422, "VALIDATION_FAILED", "Some fields are invalid.", { fields });
  }

  const existing = await loadVisible(r, user, id);
  const caseId = await caseIdFor(r, data, existing);
  const subject = await requireCaseAccess(user, caseId, r.module, "EDIT");
  assertCaseWritable(subject, r);
  if (r.scope !== "case" && data.matterId && data.matterId !== existing.matterId) {
    const newCase = await caseIdFor(r, data);
    if (newCase !== caseId) throw badRequest("A milestone or court event cannot move to another case.");
  }
  if (r.key === "cases" && user.role !== "SYSTEM_ADMIN" && (data.companyId || data.branchId)) {
    await validateReferences(r, { companyId: data.companyId ?? existing.companyId, branchId: data.branchId ?? existing.branchId }, null, user);
  }
  await validateReferences(r, data, r.key === "cases" ? null : caseId, user);
  if (version !== undefined && existing.version !== undefined && version !== existing.version) throw staleVersion();

  const run = async (tx: Tx) => {
    await HOOKS[r.key]?.beforeUpdate?.(data, existing, { tx, user, caseRow: subject });
    const where: Row = { id, ...(existing.version !== undefined ? { version: existing.version } : {}) };
    const bump = existing.version !== undefined ? { version: { increment: 1 } } : {};
    const res = await delegate(tx, r.model).updateMany({ where, data: { ...data, ...bump } });
    if (res.count === 0) throw staleVersion();
    const updated = (await delegate(tx, r.model).findFirst({ where: { id } }))!;
    if (r.key !== "cases") await touchCase(tx, caseId);
    await audit({ action: `${r.key}.update`, actorId: user.id, actorLabel: user.username, entityType: r.model, entityId: id, caseId, before: existing, after: updated }, tx);
    return updated;
  };
  return opts.tx ? run(opts.tx) : prisma.$transaction(run);
}

// ───────────────────── Archive, soft delete, restore ─────────────────────

/** Why a row cannot be soft-deleted, or null. Checks resource rules, legal holds and closed cases. */
export async function deletionBlocker(r: ResourceDef, row: Row): Promise<string | null> {
  const own = HOOKS[r.key]?.protection?.(row);
  if (own) return own;
  if (row.legalHold) return "This record is under legal hold.";
  const caseId = r.key === "cases" ? String(row.id) : String(row.caseId ?? (row.matter as Row | undefined)?.caseId ?? "");
  if (caseId) {
    const c = await prisma.case.findUnique({ where: { id: caseId }, select: { legalHold: true } });
    if (c?.legalHold) return "The case is under legal hold.";
  }
  return null;
}

type LifecycleAction = "archive" | "unarchive" | "soft_delete" | "restore";
const LIFECYCLE_PERMISSION: Record<LifecycleAction, Action> = {
  archive: "ARCHIVE",
  unarchive: "ARCHIVE",
  soft_delete: "SOFT_DELETE",
  restore: "RESTORE",
};

export interface LifecycleOptions {
  reason?: string | null;
  batchId?: string | null;
  tx?: Tx;
}

/**
 * Applies one lifecycle action to one row inside a transaction and audits it.
 * Returns null on success or a skip reason (used by bulk actions to report partial results).
 */
export async function applyLifecycle(r: ResourceDef, user: CurrentUser, id: string, action: LifecycleAction, opts: LifecycleOptions = {}): Promise<string | null> {
  if (r.softDelete === false) return "This record type does not support that action.";
  const row = await loadVisible(r, user, id, { deleted: action === "restore" });
  const caseId = r.key === "cases" ? String(row.id) : await caseIdFor(r, {}, row);
  await requireCaseAccess(user, caseId, r.module, LIFECYCLE_PERMISSION[action], { allowDeleted: true });

  if (action === "soft_delete") {
    if (row.isDeleted) return "Already in the Recycle Bin.";
    if (!opts.reason?.trim()) throw badRequest("A reason is required to delete records.");
    const blocker = await deletionBlocker(r, row);
    if (blocker) return blocker;
  }
  if (action === "restore") {
    if (!row.isDeleted) return "Not deleted.";
    if (!opts.reason?.trim()) throw badRequest("A reason is required to restore records.");
  }
  if (action === "archive" && row.archivedAt) return "Already archived.";
  if (action === "unarchive" && !row.archivedAt) return "Not archived.";

  const now = new Date();
  const data: Row =
    action === "archive"
      ? { archivedAt: now }
      : action === "unarchive"
        ? { archivedAt: null }
        : action === "soft_delete"
          ? { isDeleted: true, deletedAt: now, deletedById: user.id, deletionReason: opts.reason, deletionBatchId: opts.batchId ?? null }
          : { isDeleted: false, restoredAt: now, restoredById: user.id, restorationReason: opts.reason };

  const run = async (tx: Tx) => {
    await delegate(tx, r.model).update({ where: { id }, data });
    await audit(
      {
        action: `${r.key}.${action}`,
        actorId: user.id,
        actorLabel: user.username,
        entityType: r.model,
        entityId: id,
        caseId,
        reason: opts.reason ?? null,
        details: opts.batchId ? { batchId: opts.batchId } : undefined,
      },
      tx,
    );
  };
  if (opts.tx) await run(opts.tx);
  else await prisma.$transaction(run);
  return null;
}

export async function lifecycleOrThrow(r: ResourceDef, user: CurrentUser, id: string, action: LifecycleAction, opts: LifecycleOptions) {
  const skip = await applyLifecycle(r, user, id, action, opts);
  if (skip) throw protectedRecord(skip);
}

export type { Row };
