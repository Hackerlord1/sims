// Bulk-import helpers shared by the server and the Data Administration Centre UI.
import { importFields, type FieldDef, type ResourceDef } from "@/lib/resources/types";

export const CASE_REFERENCE = "caseReference";
export const IGNORE = "";

/** Resources that can be bulk uploaded, in the order shown in the Data Administration Centre. */
export const IMPORTABLE = [
  "cases",
  "subfiles",
  "parties",
  "invoices",
  "cheques",
  "work-logs",
  "tasks",
  "expenses",
  "advances",
  "recoveries",
  "criminal-milestones",
  "court-events",
  "evidence",
  "financial-statements",
] as const;

/** Resources imported as a ZIP of files plus an optional manifest, rather than as table rows. */
export const FILE_IMPORTS = new Set(["evidence", "financial-statements"]);

export interface TemplateColumn {
  key: string;
  header: string;
  required: boolean;
  hint: string;
}

const hintFor = (f: FieldDef): string => {
  switch (f.type) {
    case "money":
      return "Amount, e.g. 12500.00";
    case "date":
      return "Date, YYYY-MM-DD or DD/MM/YYYY";
    case "datetime":
      return "Date and time, YYYY-MM-DD HH:MM";
    case "enum":
      return "One of the listed values";
    case "boolean":
      return "Yes or No";
    case "user":
      return "Username, email or full name";
    case "company":
      return "Company code or name";
    case "branch":
      return "Branch code or name";
    case "relation":
      return "Reference, number or name of the related record";
    default:
      return f.help ?? "";
  }
};

export function templateColumns(r: ResourceDef): TemplateColumn[] {
  const cols: TemplateColumn[] = [];
  if (FILE_IMPORTS.has(r.key)) cols.push({ key: "file", header: "File", required: true, hint: "File name inside the ZIP" });
  if (r.key === "financial-statements") cols.push({ key: "format", header: "Format", required: false, hint: "CSV, XLSX, PDF, SCANNED_PDF, MPESA_PDF or BANK_PDF" });
  if (r.key !== "cases") cols.push({ key: CASE_REFERENCE, header: "Case reference", required: true, hint: "e.g. SIMS/2026/0001 (or choose a default case when uploading)" });
  for (const f of importFields(r)) if (!cols.some((c) => c.key === f.name)) cols.push({ key: f.name, header: f.label, required: Boolean(f.required), hint: hintFor(f) });
  return cols;
}

const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Maps source headers to fields by label, name or alias. Unmatched headers map to IGNORE. */
export function autoMap(r: ResourceDef, headers: string[]): Record<string, string> {
  const cols = templateColumns(r);
  const fields = importFields(r);
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const sh = simplify(h);
    let match: string | undefined;
    for (const c of cols) {
      if (used.has(c.key)) continue;
      const f = fields.find((x) => x.name === c.key);
      const candidates = [c.header, c.key, ...(f?.importAliases ?? []), ...(c.key === CASE_REFERENCE ? ["case", "case ref", "case number", "case no"] : [])];
      if (candidates.some((x) => simplify(x) === sh)) {
        match = c.key;
        break;
      }
    }
    if (match) used.add(match);
    out[h] = match ?? IGNORE;
  }
  return out;
}

/** Normalised duplicate key for a row, or null when a key column is empty. */
export function duplicateKey(values: Record<string, unknown>, columns: string[]): string | null {
  const parts: string[] = [];
  for (const c of columns) {
    const v = values[c];
    if (v === null || v === undefined || v === "") return null;
    const text = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    parts.push(text.trim().toLowerCase().replace(/\s+/g, " "));
  }
  return parts.join("|");
}
