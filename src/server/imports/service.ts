import "server-only";
import { createHash } from "node:crypto";
import type { DuplicateStrategy, ImportRowStatus, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import { AuthorizationError, requireCaseAccess, requirePermission, type CaseSubject } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import { listMeta, ListResult } from "@/server/api/router";
import { toCurrentUser, type CurrentUser } from "@/server/auth/principal";
import { enqueue } from "@/server/jobs/queue";
import { nextYearReference } from "@/server/references";
import { applyLifecycle, createResource, delegate, updateResource, type Row } from "@/server/resources/service";
import { requiresApproval, submitImport } from "@/server/services/change-requests";
import { createEvidence } from "@/server/services/evidence";
import { attachment, toCsv } from "@/server/services/exporter";
import { getSetting } from "@/server/services/settings";
import { extensionOf, readStoredFile, safeFilename, scanForMalware, sha256, storeFile, validateUpload } from "@/server/storage";
import { CASE_REFERENCE, FILE_IMPORTS, IGNORE, IMPORTABLE, autoMap, duplicateKey, templateColumns } from "@/lib/imports";
import { ENUMS, enumLabel } from "@/lib/enums";
import { RESOURCE_MAP, getResource } from "@/lib/resources/registry";
import { createSchema, issuesByField } from "@/lib/resources/schema";
import { importFields, type FieldDef, type ResourceDef } from "@/lib/resources/types";
import { inScope } from "@/lib/permissions";
import { stringArray } from "@/lib/string-array";

const INLINE_COMMIT_LIMIT = 500;
const MAX_ZIP_ENTRIES = 2000;
const MAX_ZIP_BYTES = 300 * 1024 * 1024;

/** Human-friendly lookup columns for resolving relation values in a file. */
const LOOKUP: Record<string, string[]> = {
  subfiles: ["reference", "title"],
  parties: ["name"],
  invoices: ["invoiceNumber"],
  cheques: ["chequeNumber"],
  "criminal-matters": ["obNumber", "policeReference", "courtCaseNumber"],
  "civil-matters": ["courtCaseNumber", "advocate"],
  advances: ["reference"],
  "work-logs": [],
  "party-statements": [],
  evidence: ["reference"],
};

// ───────────────────── File parsing ─────────────────────

interface Parsed {
  headers: string[];
  rows: Record<string, string>[];
  files: Map<string, Buffer>;
}

async function readTable(buffer: Buffer, ext: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (ext === "csv") {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    const p = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    return { headers: (p.meta.fields ?? []).filter(Boolean), rows: p.data };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.name.toLowerCase() !== "guide") ?? wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? "").trim());
  const rows: Record<string, string>[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const values = (ws.getRow(i).values as unknown[]).slice(1);
    if (!values.some((v) => v !== null && v !== undefined && String(v).trim())) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      const v = values[j];
      const val =
        v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v && typeof v === "object" && "text" in (v as object) ? (v as { text: unknown }).text : v;
      row[h] = val instanceof Date ? val.toISOString().slice(0, 10) : val === null || val === undefined ? "" : String(val);
    });
    rows.push(row);
  }
  return { headers: headers.filter(Boolean), rows };
}

async function parseUpload(buffer: Buffer, ext: string): Promise<Parsed> {
  if (ext === "csv" || ext === "xlsx") return { ...(await readTable(buffer, ext)), files: new Map() };
  if (ext !== "zip") return { headers: [], rows: [], files: new Map([["file." + ext, buffer]]) };
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("__MACOSX/"));
  if (entries.length > MAX_ZIP_ENTRIES) throw badRequest(`The ZIP contains more than ${MAX_ZIP_ENTRIES} files.`);
  const files = new Map<string, Buffer>();
  let total = 0;
  let manifest: { headers: string[]; rows: Record<string, string>[] } | null = null;
  for (const e of entries) {
    const data = await e.async("nodebuffer");
    total += data.length;
    if (total > MAX_ZIP_BYTES) throw badRequest("The ZIP expands beyond the permitted size.");
    const name = safeFilename(e.name);
    const x = extensionOf(name);
    if (!manifest && (x === "csv" || x === "xlsx") && /manifest|index|metadata|data/i.test(name)) manifest = await readTable(data, x);
    else if (!manifest && (x === "csv" || x === "xlsx") && entries.length === 1) manifest = await readTable(data, x);
    else files.set(name.toLowerCase(), data);
  }
  return { headers: manifest?.headers ?? [], rows: manifest?.rows ?? [], files };
}

// ───────────────────── Reference resolution ─────────────────────

class Resolver {
  private cases = new Map<string, CaseSubject | string>();
  private lookups = new Map<string, Map<string, string[]>>();
  private users?: Map<string, string[]>;
  private companies?: Map<string, string[]>;
  private branches?: { byKey: Map<string, { id: string; companyId: string }[]> };

  constructor(
    private user: CurrentUser,
    private r: ResourceDef,
  ) {}

  /** Resolves a case reference to an accessible, open case (cached). Returns an error string otherwise. */
  async caseFor(ref: string): Promise<CaseSubject | string> {
    const key = ref.trim().toUpperCase();
    const hit = this.cases.get(key);
    if (hit) return hit;
    const c = await prisma.case.findFirst({ where: { reference: key, isDeleted: false }, select: { id: true } });
    let result: CaseSubject | string;
    if (!c) result = `Case ${ref} not found.`;
    else {
      try {
        const subject = await requireCaseAccess(this.user, c.id, this.r.module, "CREATE");
        result = subject.status === "CLOSED" ? `Case ${ref} is closed.` : subject;
      } catch (e) {
        if (!(e instanceof AuthorizationError)) throw e;
        result = `You do not have access to add ${this.r.plural.toLowerCase()} to case ${ref}.`;
      }
    }
    this.cases.set(key, result);
    return result;
  }

  async caseById(id: string) {
    const c = await prisma.case.findUnique({ where: { id }, select: { reference: true } });
    if (!c) throw badRequest("Default case not found.");
    return this.caseFor(c.reference);
  }

  private static add(map: Map<string, string[]>, key: string | null | undefined, id: string) {
    if (!key) return;
    const k = key.trim().toLowerCase();
    const ids = map.get(k);
    if (ids) ids.push(id);
    else map.set(k, [id]);
  }

  async relation(f: FieldDef, value: string, caseId: string | null): Promise<{ id?: string; error?: string }> {
    const v = value.trim().toLowerCase();
    if (f.type === "user") {
      if (!this.users) {
        this.users = new Map();
        for (const u of await prisma.user.findMany({ where: { status: "ACTIVE" }, select: { id: true, username: true, email: true, fullName: true } })) {
          for (const k of [u.username, u.email, u.fullName, u.id]) Resolver.add(this.users, k, u.id);
        }
      }
      return this.pick(this.users.get(v), f, value);
    }
    if (f.type === "company") {
      if (!this.companies) {
        this.companies = new Map();
        for (const c of await prisma.company.findMany({ select: { id: true, code: true, name: true } })) for (const k of [c.code, c.name, c.id]) Resolver.add(this.companies, k, c.id);
      }
      return this.pick(this.companies.get(v), f, value);
    }
    if (f.type === "branch") {
      if (!this.branches) {
        const byKey = new Map<string, { id: string; companyId: string }[]>();
        for (const b of await prisma.branch.findMany({ select: { id: true, code: true, name: true, companyId: true } })) {
          for (const k of [b.code, b.name, b.id]) byKey.set(k.toLowerCase(), [...(byKey.get(k.toLowerCase()) ?? []), { id: b.id, companyId: b.companyId }]);
        }
        this.branches = { byKey };
      }
      return this.pick(
        this.branches.byKey.get(v)?.map((b) => b.id),
        f,
        value,
      );
    }
    if (f.type === "relation" && caseId) {
      const target = RESOURCE_MAP[f.relation!]!;
      const key = `${target.key}:${caseId}`;
      let map = this.lookups.get(key);
      if (!map) {
        map = new Map();
        const cols = LOOKUP[target.key] ?? [];
        const select: Row = { id: true };
        for (const c of cols) select[c] = true;
        const where = target.scope === "case" ? { caseId, isDeleted: false } : { matter: { caseId }, isDeleted: false };
        for (const row of await delegate(prisma, target.model).findMany({ where, select })) {
          Resolver.add(map, String(row.id), String(row.id));
          for (const c of cols) Resolver.add(map, row[c] as string | null, String(row.id));
        }
        this.lookups.set(key, map);
      }
      return this.pick(map.get(v), f, value);
    }
    return { error: `${f.label}: cannot resolve "${value}".` };
  }

  branchCompany(branchId: string): string | undefined {
    for (const list of this.branches?.byKey.values() ?? []) for (const b of list) if (b.id === branchId) return b.companyId;
    return undefined;
  }

  private pick(ids: string[] | undefined, f: FieldDef, value: string) {
    const unique = [...new Set(ids ?? [])];
    if (!unique.length) return { error: `${f.label}: "${value}" was not found.` };
    if (unique.length > 1) return { error: `${f.label}: "${value}" matches more than one record.` };
    return { id: unique[0] };
  }
}

// ───────────────────── Validation ─────────────────────

const validateInput = z.object({
  resource: z.enum(IMPORTABLE),
  caseId: z.string().max(64).optional(),
  mode: z.enum(ENUMS.ImportMode).default("ATOMIC"),
  duplicateStrategy: z.enum(ENUMS.DuplicateStrategy).default("SKIP"),
  mapping: z.record(z.string().max(200), z.string().max(64)).optional(),
});

interface RowResult {
  rowNumber: number;
  data: Row;
  status: ImportRowStatus;
  errors: string[];
  duplicateOfId: string | null;
}

async function validateRows(user: CurrentUser, r: ResourceDef, parsed: Parsed, mapping: Record<string, string>, defaultCaseId: string | undefined): Promise<RowResult[]> {
  const resolver = new Resolver(user, r);
  const fields = importFields(r);
  const fileImport = FILE_IMPORTS.has(r.key);
  const defaultCase = defaultCaseId ? await resolver.caseById(defaultCaseId) : undefined;
  const results: RowResult[] = [];
  const seen = new Map<string, number>();
  const existing = new Map<string, Map<string, string>>(); // caseId → duplicate key → record id

  // Files-only ZIP (no manifest): one evidence item per file, in the default case.
  const sourceRows: Record<string, string>[] = parsed.rows.length || !fileImport ? parsed.rows : [...parsed.files.keys()].map((name) => ({ file: name }));
  const map = parsed.rows.length ? mapping : { file: "file" };

  for (let i = 0; i < sourceRows.length; i++) {
    const src = sourceRows[i]!;
    const errors: string[] = [];
    const values: Row = {};
    for (const [header, field] of Object.entries(map)) {
      if (field === IGNORE) continue;
      const v = src[header];
      if (v !== undefined && String(v).trim() !== "") values[field] = String(v).trim();
    }
    let subject: CaseSubject | null = null;
    if (r.key !== "cases") {
      const ref = values[CASE_REFERENCE] as string | undefined;
      const c = ref ? await resolver.caseFor(ref) : defaultCase;
      if (!c) errors.push("Case reference is required (or choose a default case).");
      else if (typeof c === "string") errors.push(c);
      else subject = c;
    }
    delete values[CASE_REFERENCE];

    // Resolve human-friendly relation values to ids.
    for (const f of fields) {
      const v = values[f.name];
      if (typeof v !== "string" || !["user", "company", "branch", "relation"].includes(f.type)) continue;
      const res = await resolver.relation(f, v, subject?.id ?? null);
      if (res.error) errors.push(res.error);
      else values[f.name] = res.id;
    }
    if (r.key === "cases" && typeof values.companyId === "string") {
      if (typeof values.branchId === "string" && resolver.branchCompany(values.branchId) !== values.companyId) errors.push("Branch: does not belong to the company.");
      if (user.role !== "SYSTEM_ADMIN" && !inScope(user.scopes, values.companyId, (values.branchId as string) ?? null)) errors.push("Company/branch: outside your scope.");
    }

    let parsedValues: Row = values;
    if (fileImport) {
      const file = String(values.file ?? "").toLowerCase();
      if (!file) errors.push("File: the file name is required.");
      else if (!parsed.files.has(safeFilename(file).toLowerCase())) errors.push(`File: "${values.file}" is not in the ZIP.`);
      if (r.key === "evidence") {
        values.title ??= String(values.file ?? "").replace(/\.[^.]+$/, "");
        values.category ??= "DOCUMENT";
      }
    } else {
      const res = createSchema(r, { requireCase: false }).safeParse(values);
      if (!res.success) {
        for (const [k, m] of Object.entries(issuesByField(res.error))) {
          const label = r.fields.find((f) => f.name === k)?.label ?? k;
          errors.push(m.includes(label) ? m : `${label}: ${m}`);
        }
      } else parsedValues = res.data as Row;
    }

    // Duplicate detection: within the file and against existing records in the same case.
    let duplicateOfId: string | null = null;
    if (!errors.length && r.duplicateKeys?.length) {
      const scopeId = subject?.id ?? "global";
      if (!existing.has(scopeId)) {
        const cols = [...new Set(r.duplicateKeys.flat())];
        const select: Row = { id: true };
        for (const c of cols) select[c] = true;
        const where = r.key === "cases" ? { isDeleted: false } : { caseId: subject!.id, isDeleted: false };
        const m = new Map<string, string>();
        for (const row of await delegate(prisma, r.model).findMany({ where, select })) {
          for (const keyCols of r.duplicateKeys) {
            const k = duplicateKey(row, keyCols);
            if (k) m.set(keyCols.join("+") + ":" + k, String(row.id));
          }
        }
        existing.set(scopeId, m);
      }
      for (const keyCols of r.duplicateKeys) {
        const k = duplicateKey(parsedValues, keyCols);
        if (!k) continue;
        const full = `${scopeId}|${keyCols.join("+")}:${k}`;
        const dbHit = existing.get(scopeId)!.get(keyCols.join("+") + ":" + k);
        if (dbHit) {
          duplicateOfId = dbHit;
          break;
        }
        const fileHit = seen.get(full);
        if (fileHit) {
          duplicateOfId = `row:${fileHit}`;
          break;
        }
        seen.set(full, i + 1);
      }
    }
    const data: Row = { ...values, ...(subject ? { caseId: subject.id } : {}) };
    results.push({ rowNumber: i + 1, data, status: errors.length ? "INVALID" : duplicateOfId ? "DUPLICATE" : "VALID", errors, duplicateOfId });
  }
  return results;
}

async function assertImportAccess(user: CurrentUser, r: ResourceDef) {
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  await requirePermission(user, r.module, "CREATE");
}

export async function validateImport(user: CurrentUser, form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to import.");
  let mapping: Record<string, string> | undefined;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping.trim()) {
    try {
      mapping = JSON.parse(rawMapping);
    } catch {
      throw badRequest("The column mapping is not valid JSON.");
    }
  }
  const input = validateInput.parse({
    resource: form.get("resource"),
    caseId: (form.get("caseId") as string) || undefined,
    mode: (form.get("mode") as string) || undefined,
    duplicateStrategy: (form.get("duplicateStrategy") as string) || undefined,
    mapping,
  });
  const r = getResource(input.resource)!;
  await assertImportAccess(user, r);
  const allowed = FILE_IMPORTS.has(r.key) ? (r.key === "evidence" ? ["zip", "pdf", "docx", "png", "jpg", "jpeg"] : ["zip"]) : ["csv", "xlsx", "zip"];
  const upload = await validateUpload(file, { allowed, maxBytes: 60 * 1024 * 1024 });
  const key = createHash("sha256")
    .update([upload.sha256, r.key, input.caseId ?? "", input.mode, input.duplicateStrategy, JSON.stringify(Object.entries(mapping ?? {}).sort())].join("|"))
    .digest("hex");
  const already = await prisma.importBatch.findUnique({ where: { idempotencyKey: key } });
  if (already && already.createdById === user.id) return { ...(await importDetail(user, already.id)), idempotentReplay: true };
  if (already) throw new ApiError(409, "CONFLICT", `This exact file and settings were already uploaded as batch ${already.reference}.`);

  const parsed = await parseUpload(upload.buffer, upload.ext);
  const maxRows = await getSetting("imports.maxRows");
  if (parsed.rows.length > maxRows) throw badRequest(`The file has ${parsed.rows.length} rows; the limit is ${maxRows}.`);
  if (!parsed.rows.length && !(FILE_IMPORTS.has(r.key) && parsed.files.size)) throw badRequest("The file contains no data rows.");
  if (!parsed.rows.length && FILE_IMPORTS.has(r.key) && !input.caseId) throw badRequest("Choose the case these files belong to, or include a manifest with case references.");
  const effectiveMapping = mapping ?? autoMap(r, parsed.headers);
  const rows = await validateRows(user, r, parsed, effectiveMapping, input.caseId);

  const counts = {
    totalRows: rows.length,
    validRows: rows.filter((x) => x.status === "VALID").length,
    invalidRows: rows.filter((x) => x.status === "INVALID").length,
    duplicateRows: rows.filter((x) => x.status === "DUPLICATE").length,
  };
  const batch = await prisma.$transaction(
    async (tx) => {
      const stored = await storeFile(tx, { ...upload, uploadedById: user.id, readOnly: true });
      const reference = await nextYearReference(tx, "importBatch");
      const b = await tx.importBatch.create({
        data: {
          reference,
          entityType: r.key,
          caseId: input.caseId ?? null,
          fileName: upload.originalName,
          fileSha256: upload.sha256,
          fileId: stored.id,
          idempotencyKey: key,
          mode: input.mode,
          duplicateStrategy: input.duplicateStrategy,
          mapping: effectiveMapping,
          ...counts,
          createdById: user.id,
        },
      });
      for (let i = 0; i < rows.length; i += 1000) {
        await tx.importRow.createMany({
          data: rows
            .slice(i, i + 1000)
            .map((x) => ({ batchId: b.id, rowNumber: x.rowNumber, data: x.data as Prisma.InputJsonValue, status: x.status, errors: x.errors, duplicateOfId: x.duplicateOfId })),
        });
      }
      await audit(
        {
          action: "imports.validate",
          actorId: user.id,
          actorLabel: user.username,
          entityType: "importBatch",
          entityId: b.id,
          caseId: input.caseId ?? null,
          details: { reference, resource: r.key, ...counts },
        },
        tx,
      );
      return b;
    },
    { timeout: 120_000 },
  );
  return importDetail(user, batch.id);
}

// ───────────────────── Reads ─────────────────────

export async function importDetail(user: CurrentUser, id: string) {
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  const b = await prisma.importBatch.findUnique({ where: { id } });
  if (!b) throw notFound("Import batch");
  const preview = await prisma.importRow.findMany({ where: { batchId: id }, orderBy: { rowNumber: "asc" }, take: 50 });
  const r = getResource(b.entityType)!;
  return { batch: b, preview, columns: templateColumns(r), resourceLabel: r.plural };
}

export async function listImports(user: CurrentUser, page: number, pageSize: number) {
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  const [total, rows] = await Promise.all([prisma.importBatch.count(), prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } });
  const names = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return new ListResult(
    rows.map((r) => ({ ...r, createdBy: names[r.createdById] ?? "Unknown", resourceLabel: getResource(r.entityType)?.plural ?? r.entityType })),
    listMeta(page, pageSize, total),
  );
}

export async function importRows(user: CurrentUser, id: string, status: ImportRowStatus | undefined, page: number, pageSize: number) {
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  const where = { batchId: id, ...(status ? { status } : {}) };
  const [total, rows] = await Promise.all([prisma.importRow.count({ where }), prisma.importRow.findMany({ where, orderBy: { rowNumber: "asc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  return new ListResult(rows, listMeta(page, pageSize, total));
}

export async function errorReport(user: CurrentUser, id: string) {
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  const b = await prisma.importBatch.findUnique({ where: { id } });
  if (!b) throw notFound("Import batch");
  const rows = await prisma.importRow.findMany({ where: { batchId: id, status: { in: ["INVALID", "DUPLICATE", "FAILED", "SKIPPED"] } }, orderBy: { rowNumber: "asc" } });
  const csv = toCsv(
    [
      { key: "rowNumber", label: "Row" },
      { key: "status", label: "Status" },
      { key: "errors", label: "Errors" },
      { key: "duplicateOf", label: "Duplicate of" },
      { key: "values", label: "Values" },
    ],
    rows.map((r) => ({ rowNumber: r.rowNumber, status: r.status, errors: stringArray(r.errors, "errors").join("; "), duplicateOf: r.duplicateOfId ?? "", values: JSON.stringify(r.data) })),
  );
  return attachment(csv, `import-errors-${b.reference}.csv`, "text/csv; charset=utf-8");
}

/** The import template for a record type, as file bytes (used by the API and `npm run templates`). */
export async function buildTemplate(resourceKey: string, format: "csv" | "xlsx"): Promise<{ body: Buffer; filename: string; mime: string }> {
  const r = getResource(resourceKey);
  if (!r || !(IMPORTABLE as readonly string[]).includes(r.key)) throw notFound("Template");
  const cols = templateColumns(r);
  if (format === "csv") {
    const csv = toCsv(
      cols.map((c) => ({ key: c.key, label: c.header })),
      [],
    );
    return { body: Buffer.from(csv), filename: `${r.key}-import-template.csv`, mime: "text/csv; charset=utf-8" };
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Template");
  const head = ws.addRow(cols.map((c) => c.header));
  head.font = { bold: true };
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = Math.max(14, c.header.length + 2)));
  const guide = wb.addWorksheet("Guide");
  guide.addRow(["Column", "Required", "Format", "Allowed values"]).font = { bold: true };
  for (const c of cols) {
    const f = r.fields.find((x) => x.name === c.key);
    guide.addRow([c.header, c.required ? "Yes" : "No", c.hint, f?.enum ? ENUMS[f.enum].map((v) => `${v} (${enumLabel(v)})`).join(", ") : ""]);
  }
  guide.addRow([]);
  guide.addRow(["Fill the Template sheet only. Use fictional data for testing. This Guide sheet is ignored on import."]);
  guide.getColumn(1).width = 30;
  guide.getColumn(3).width = 40;
  guide.getColumn(4).width = 80;
  return { body: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${r.key}-import-template.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
}

export async function templateFile(user: CurrentUser, resourceKey: string, format: "csv" | "xlsx") {
  const r = getResource(resourceKey);
  if (!r || !(IMPORTABLE as readonly string[]).includes(r.key)) throw notFound("Template");
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  const t = await buildTemplate(r.key, format);
  return attachment(t.body, t.filename, t.mime);
}

export async function cancelImport(user: CurrentUser, id: string) {
  await requirePermission(user, "DATA_ADMIN", "BULK_UPLOAD");
  const b = await prisma.importBatch.findUnique({ where: { id } });
  if (!b) throw notFound("Import batch");
  if (b.status !== "VALIDATED") throw new ApiError(409, "INVALID_TRANSITION", "Only validated, uncommitted batches can be cancelled.");
  await prisma.importBatch.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date() } });
  await audit({ action: "imports.cancel", actorId: user.id, actorLabel: user.username, entityType: "importBatch", entityId: id });
  return { status: "CANCELLED" };
}

// ───────────────────── Commit ─────────────────────

export async function commitImport(user: CurrentUser, id: string, opts: { approved?: boolean } = {}) {
  const b = await prisma.importBatch.findUnique({ where: { id } });
  if (!b) throw notFound("Import batch");
  const r = getResource(b.entityType)!;
  await assertImportAccess(user, r);
  if (b.createdById !== user.id && user.role !== "SYSTEM_ADMIN") throw new ApiError(403, "FORBIDDEN", "Only the uploader or an administrator can commit this batch.");
  if (!["VALIDATED", "ROLLED_BACK"].includes(b.status)) throw new ApiError(409, "INVALID_TRANSITION", `The batch is ${enumLabel(b.status).toLowerCase()} and cannot be committed.`);
  if (b.duplicateStrategy === "STOP_ENTIRE_BATCH" && b.duplicateRows > 0) {
    throw new ApiError(409, "CONFLICT", `The batch contains ${b.duplicateRows} duplicate row(s) and the strategy is "stop entire batch". Nothing was imported.`);
  }
  if (b.mode === "ATOMIC" && b.invalidRows > 0) {
    throw new ApiError(409, "CONFLICT", `Atomic imports require every row to be valid (${b.invalidRows} invalid). Fix the file or choose partial import.`);
  }
  // Record types behind data-change approval wait for an approver before any row is written.
  if (!opts.approved && (await requiresApproval(r.key))) {
    return submitImport(user, { id: b.id, reference: b.reference, entityType: b.entityType, caseId: b.caseId, validRows: b.validRows, duplicateRows: b.duplicateRows });
  }
  const workRows = b.validRows + b.duplicateRows;
  if (workRows > INLINE_COMMIT_LIMIT || (FILE_IMPORTS.has(r.key) && workRows > 20)) {
    // Guard against a double click queuing two jobs: the status flip is conditional.
    const flipped = await prisma.importBatch.updateMany({ where: { id, status: { in: ["VALIDATED", "ROLLED_BACK"] } }, data: { status: "QUEUED" } });
    if (!flipped.count) throw new ApiError(409, "CONFLICT", "The batch is already being imported.");
    await enqueue(prisma, "IMPORT_COMMIT", { batchId: id, userId: user.id });
    await audit({ action: "imports.queue", actorId: user.id, actorLabel: user.username, entityType: "importBatch", entityId: id });
    return { status: "QUEUED" };
  }
  return runCommit(user, id);
}

/** Background job entry point. */
export async function commitImportJob(batchId: string, userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { scopes: true } });
  const user = toCurrentUser({
    id: "worker",
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
  return runCommit(user, batchId);
}

async function runCommit(user: CurrentUser, id: string) {
  const flipped = await prisma.importBatch.updateMany({ where: { id, status: { in: ["VALIDATED", "ROLLED_BACK", "QUEUED"] } }, data: { status: "IMPORTING" } });
  if (!flipped.count) throw new ApiError(409, "CONFLICT", "The batch is already being imported.");
  const b = await prisma.importBatch.findUniqueOrThrow({ where: { id } });
  const r = getResource(b.entityType)!;
  const rows = await prisma.importRow.findMany({ where: { batchId: id, status: { in: ["VALID", "DUPLICATE"] } }, orderBy: { rowNumber: "asc" } });
  const zipFiles = FILE_IMPORTS.has(r.key) && b.fileId ? await loadZipFiles(b.fileId) : new Map<string, Buffer>();
  const subjects = new Map<string, CaseSubject>();
  const subjectFor = async (caseId: string | undefined) => {
    if (!caseId) return null;
    if (!subjects.has(caseId)) subjects.set(caseId, await requireCaseAccess(user, caseId, r.module, "CREATE"));
    const subject = subjects.get(caseId)!;
    // Re-checked at commit: the case may have been closed since the file was validated.
    const current = await caseStatus(caseId);
    if (current === "CLOSED") throw new ApiError(409, "INVALID_TRANSITION", `Case ${subject.reference} is closed.`);
    return subject;
  };
  const outcome = new Map<string, { status: ImportRowStatus; errors?: string[]; resultId?: string }>();

  const processRow = async (row: (typeof rows)[number], tx?: Prisma.TransactionClient) => {
    const data = { ...(row.data as Row) };
    const subject = await subjectFor(data.caseId as string | undefined);
    const dupOfRecord = row.duplicateOfId && !row.duplicateOfId.startsWith("row:") ? row.duplicateOfId : null;
    if (row.status === "DUPLICATE") {
      const strategy: DuplicateStrategy = b.duplicateStrategy;
      if (strategy === "SKIP" || (!dupOfRecord && strategy !== "IMPORT_SEPARATELY")) return { status: "SKIPPED" as const, errors: ["Duplicate — skipped."] };
      if (strategy === "UPDATE_EXISTING" && dupOfRecord) {
        const patch = { ...data };
        delete patch.caseId;
        const updated = await updateResource(r, user, dupOfRecord, patch, { tx });
        return { status: "UPDATED" as const, resultId: String(updated.id) };
      }
      if (strategy === "CREATE_NEW_VERSION" && dupOfRecord) {
        const skip = await applyLifecycle(r, user, dupOfRecord, "soft_delete", { reason: `Superseded by import ${b.reference}`, tx });
        if (skip) throw new Error(`Existing record could not be superseded: ${skip}`);
      }
    }
    if (FILE_IMPORTS.has(r.key)) {
      const created = await createFromFile(r, user, subject!, data, zipFiles, tx!);
      return { status: "IMPORTED" as const, resultId: created };
    }
    const created = await createResource(r, user, data, { tx, importBatchId: b.id, skipAudit: true, prechecked: { subject } });
    return { status: "IMPORTED" as const, resultId: String(created.id) };
  };

  let failedMessage: string | null = null;
  if (b.mode === "ATOMIC") {
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const row of rows) {
            try {
              outcome.set(row.id, await processRow(row, tx));
            } catch (e) {
              throw new RowFailure(row.rowNumber, e);
            }
          }
        },
        { timeout: 10 * 60_000, maxWait: 30_000 },
      );
    } catch (e) {
      failedMessage = e instanceof RowFailure ? `Row ${e.rowNumber}: ${messageOf(e.cause)}` : messageOf(e);
      outcome.clear();
    }
  } else {
    for (const row of rows) {
      try {
        const result = FILE_IMPORTS.has(r.key) ? await prisma.$transaction((tx) => processRow(row, tx), { timeout: 120_000 }) : await processRow(row);
        outcome.set(row.id, result);
      } catch (e) {
        outcome.set(row.id, { status: "FAILED", errors: [messageOf(e)] });
      }
    }
  }

  // Record per-row results in chunks.
  for (const [rowId, o] of outcome) {
    await prisma.importRow.update({ where: { id: rowId }, data: { status: o.status, errors: o.errors ?? [], resultId: o.resultId ?? null } });
  }
  const results = [...outcome.values()];
  const imported = results.filter((x) => x.status === "IMPORTED").length;
  const updated = results.filter((x) => x.status === "UPDATED").length;
  const skipped = results.filter((x) => x.status === "SKIPPED").length;
  const failed = results.filter((x) => x.status === "FAILED").length;
  const status = failedMessage ? "ROLLED_BACK" : failed === 0 && b.invalidRows === 0 && skipped === 0 ? "COMPLETED" : imported + updated > 0 ? "PARTIALLY_COMPLETED" : failed ? "FAILED" : "COMPLETED";
  const final = await prisma.importBatch.update({
    where: { id },
    data: { status, importedRows: imported, updatedRows: updated, skippedRows: skipped + b.invalidRows, failedRows: failed, message: failedMessage, completedAt: new Date() },
  });
  await audit({
    action: failedMessage ? "imports.rollback" : "imports.commit",
    actorId: user.id,
    actorLabel: user.username,
    entityType: "importBatch",
    entityId: id,
    outcome: failedMessage ? "FAILURE" : "SUCCESS",
    reason: failedMessage,
    details: { reference: b.reference, resource: r.key, mode: b.mode, strategy: b.duplicateStrategy, imported, updated, skipped, failed },
  });
  if (failedMessage || failed) {
    await raiseAlert({
      type: "BULK_IMPORT_FAILURE",
      severity: "WARNING",
      message: `Import ${b.reference} ${failedMessage ? "was rolled back" : `had ${failed} failed row(s)`}.`,
      subjectUserId: user.id,
    });
  }
  const caseIds = [...new Set(rows.map((x) => (x.data as Row).caseId).filter(Boolean) as string[])];
  if (caseIds.length && imported + updated) await prisma.case.updateMany({ where: { id: { in: caseIds } }, data: { lastActivityAt: new Date() } });
  return { status: final.status, importedRows: imported, updatedRows: updated, skippedRows: final.skippedRows, failedRows: failed, message: failedMessage };
}

async function caseStatus(caseId: string) {
  return (await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } }))?.status;
}

class RowFailure extends Error {
  constructor(
    public rowNumber: number,
    public override cause: unknown,
  ) {
    super(`Row ${rowNumber} failed`);
  }
}

function messageOf(e: unknown): string {
  if (e instanceof z.ZodError) return Object.values(issuesByField(e)).join("; ");
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message.split("\n")[0]!.slice(0, 300);
  return "Unknown error";
}

async function loadZipFiles(fileId: string) {
  const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
  const buffer = await readStoredFile(f.storageKey);
  if (sha256(buffer) !== f.sha256) throw new Error("The stored import file failed its integrity check.");
  const ext = extensionOf(f.originalName);
  return (await parseUpload(buffer, ext)).files;
}

async function createFromFile(r: ResourceDef, user: CurrentUser, subject: CaseSubject, data: Row, files: Map<string, Buffer>, tx: Prisma.TransactionClient): Promise<string> {
  const name = safeFilename(String(data.file)).toLowerCase();
  const buffer = files.get(name);
  if (!buffer) throw new Error(`File ${data.file} is missing from the ZIP.`);
  const ext = extensionOf(name);
  const fake = new File([new Uint8Array(buffer)], name);
  if (r.key === "evidence") {
    const maxMb = await getSetting("uploads.maxFileMb");
    const up = await validateUpload(fake, {
      allowed: ["pdf", "docx", "png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "txt", "csv", "xlsx", "eml", "msg", "mp3", "m4a", "wav", "mp4"],
      maxBytes: maxMb * 1024 * 1024,
    });
    const confidentiality = (ENUMS.Confidentiality as readonly string[]).includes(String(data.confidentiality)) ? (data.confidentiality as "CONFIDENTIAL") : "CONFIDENTIAL";
    const category = (ENUMS.EvidenceCategory as readonly string[]).includes(String(data.category).toUpperCase()) ? (String(data.category).toUpperCase() as "DOCUMENT") : "DOCUMENT";
    const ev = await createEvidence(tx, user, subject, {
      ...up,
      title: String(data.title ?? name).slice(0, 300),
      category,
      source: (data.source as string) ?? null,
      provider: (data.provider as string) ?? null,
      dateReceived: data.dateReceived ? new Date(String(data.dateReceived)) : null,
      confidentiality,
      notes: (data.notes as string) ?? null,
    });
    return ev.id;
  }
  // Bank and M-Pesa statements
  await scanForMalware(buffer, name);
  const format = String(data.format ?? (ext === "csv" ? "CSV" : ext === "xlsx" ? "XLSX" : "PDF")).toUpperCase();
  if (!(ENUMS.StatementFormat as readonly string[]).includes(format)) throw new Error(`Unknown statement format ${format}.`);
  const institutionType = String(data.institutionType ?? "BANK").toUpperCase();
  if (!(ENUMS.InstitutionType as readonly string[]).includes(institutionType)) throw new Error(`Unknown institution type ${institutionType}.`);
  if (!data.ownerName || !data.institution || !data.maskedAccount || !data.processingAuthority)
    throw new Error("Owner, institution, account and processing authority are required for each statement.");
  const hash = sha256(buffer);
  const stored = await storeFile(tx, {
    buffer,
    originalName: name,
    mimeType: ext === "csv" ? "text/csv" : ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
    sha256: hash,
    uploadedById: user.id,
    readOnly: true,
  });
  const { maskAccount } = await import("@/lib/masking");
  const reference = await nextYearReference(tx, "statement");
  const st = await tx.financialStatement.create({
    data: {
      reference,
      caseId: subject.id,
      ownerName: String(data.ownerName),
      institutionType: institutionType as "BANK",
      institution: String(data.institution),
      accountType: (data.accountType as string) ?? null,
      maskedAccount: maskAccount(String(data.maskedAccount))!,
      currency: String(data.currency ?? "KES")
        .toUpperCase()
        .slice(0, 3),
      source: (data.source as string) ?? null,
      processingAuthority: String(data.processingAuthority),
      format: format as "CSV",
      originalFileId: stored.id,
      originalFilename: name,
      sha256: hash,
      uploadedById: user.id,
      status: "QUEUED",
    },
  });
  await enqueue(tx, "STATEMENT_PARSE", { statementId: st.id, userId: user.id });
  return st.id;
}
