// Builds Zod validators from resource definitions. The same schema validates browser forms, API
// requests and bulk-import rows, so the three can never disagree.
import { z } from "zod";
import { ENUMS } from "@/lib/enums";
import { isMoneyText, toDbString } from "@/lib/money";
import type { FieldDef, ResourceDef } from "@/lib/resources/types";
import { acceptedFields } from "@/lib/resources/types";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/** Accepts Date, ISO strings, YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY. Returns null when unparseable. */
export function parseDateInput(v: unknown, withTime = false): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (days since 1899-12-30)
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000));
    return null;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return utcDate(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return utcDate(+m[3]!, +m[2]!, +m[1]!);
  if (withTime || /T|\d:\d/.test(s)) {
    // datetime-local ("2026-09-30T14:05") is interpreted as Nairobi time (UTC+3, no DST).
    const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
    if (local) {
      const d = new Date(Date.UTC(+local[1]!, +local[2]! - 1, +local[3]!, +local[4]! - 3, +local[5]!, +(local[6] ?? 0)));
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function utcDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

const moneySchema = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const text = String(v).replace(/[,\s]/g, "").replace(/^KES/i, "");
    if (!isMoneyText(text)) {
      ctx.addIssue({ code: "custom", message: `${label} must be an amount with up to two decimal places.` });
      return z.NEVER;
    }
    if (text.startsWith("-")) {
      ctx.addIssue({ code: "custom", message: `${label} cannot be negative.` });
      return z.NEVER;
    }
    return toDbString(text);
  });

const dateSchema = (label: string, withTime: boolean) =>
  z.unknown().transform((v, ctx) => {
    const d = parseDateInput(v, withTime);
    if (!d) {
      ctx.addIssue({ code: "custom", message: `${label} is not a valid date.` });
      return z.NEVER;
    }
    return d;
  });

const booleanSchema = z.union([z.boolean(), z.string()]).transform((v, ctx) => {
  if (typeof v === "boolean") return v;
  const s = v.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  ctx.addIssue({ code: "custom", message: "Enter yes or no." });
  return z.NEVER;
});

export function fieldSchema(f: FieldDef): z.ZodType {
  switch (f.type) {
    case "money":
      return moneySchema(f.label);
    case "date":
      return dateSchema(f.label, false);
    case "datetime":
      return dateSchema(f.label, true);
    case "enum": {
      const values = ENUMS[f.enum!] as readonly [string, ...string[]];
      return z
        .string()
        .transform((v) =>
          v
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, "_"),
        )
        .pipe(z.enum(values, { message: `${f.label} must be one of the listed options.` }));
    }
    case "boolean":
      return booleanSchema;
    case "number":
      return z.coerce.number().int().min(0).max(1_000_000_000);
    case "email":
      return z
        .string()
        .trim()
        .max(f.max ?? 254)
        .pipe(z.email({ message: `${f.label} must be a valid email address.` }));
    case "user":
    case "company":
    case "branch":
    case "relation":
      return z.string().trim().min(1).max(64);
    default:
      return z
        .string()
        .trim()
        .max(f.max ?? 300, { message: `${f.label} must be ${f.max ?? 300} characters or fewer.` });
  }
}

function wrap(f: FieldDef, required: boolean): z.ZodType {
  const base = fieldSchema(f);
  if (required) {
    // The "is required" issue is raised first, so forms and import reports show it rather than a type error.
    return z.preprocess((v, ctx) => {
      const value = blankToNull(v);
      if (value === null || value === undefined) ctx.addIssue({ code: "custom", message: `${f.label} is required.` });
      return value;
    }, base);
  }
  return z.preprocess(blankToNull, base.nullable().optional());
}

export type ResourceInput = Record<string, unknown>;

/** Create schema: required fields enforced; unknown keys stripped. */
export function createSchema(r: ResourceDef, opts: { requireCase?: boolean } = {}) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of acceptedFields(r)) shape[f.name] = wrap(f, Boolean(f.required));
  if (r.scope === "case" && r.key !== "cases" && opts.requireCase !== false) {
    shape.caseId = z.string().trim().min(1, "Case is required.").max(64);
  }
  return z.object(shape);
}

/** Update schema: every editable field optional; `version` enables optimistic locking. */
export function updateSchema(r: ResourceDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of acceptedFields(r)) {
    // Required fields may be omitted on update, but not cleared.
    shape[f.name] = f.required ? wrap(f, true).optional() : wrap(f, false);
  }
  shape.version = z.coerce.number().int().min(1).optional();
  return z.object(shape);
}

/** First error message per field, for forms and import error reports. */
export function issuesByField(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
