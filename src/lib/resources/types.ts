import type { EnumName } from "@/lib/enums";
import type { Module } from "@/lib/permissions";

export type FieldType = "text" | "textarea" | "money" | "number" | "date" | "datetime" | "enum" | "boolean" | "email" | "user" | "company" | "branch" | "relation" | "computed";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  enum?: EnumName;
  /** Resource key for `relation` fields (e.g. "invoices"). */
  relation?: string;
  required?: boolean;
  max?: number;
  /** Rendered in IBM Plex Mono (references, invoice numbers, OB numbers …). */
  mono?: boolean;
  /** Shown as a table column. */
  list?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  /** Server-managed (references, hashes, derived amounts). Never accepted from clients. */
  readOnly?: boolean;
  /** Changed only through a workflow endpoint (approve, verify, close …). Shown, not editable. */
  workflow?: boolean;
  /** Not shown in forms or tables (internal link columns). */
  hidden?: boolean;
  sensitive?: "account" | "phone" | "id";
  help?: string;
  section?: string;
  importAliases?: string[];
  defaultValue?: string | boolean;
}

export type ResourceScope = "case" | "criminal-matter" | "civil-matter";

export interface ResourceDef {
  key: string;
  /** Prisma model delegate name. */
  model: string;
  module: Module;
  label: string;
  plural: string;
  scope: ResourceScope;
  fields: FieldDef[];
  titleField: string;
  referenceField?: string;
  defaultSort: { field: string; order: "asc" | "desc" };
  /** Field used by the "change status" bulk action (non-workflow statuses only). */
  statusField?: string;
  /** User field used by the "reassign" bulk action. */
  assigneeField?: string;
  /** Column sets that identify a duplicate during bulk import (within the same case). */
  duplicateKeys?: string[][];
  importable?: boolean;
  /** Created through a dedicated upload endpoint rather than the generic create. */
  uploadOnly?: boolean;
  /** Has the soft-delete column block. */
  softDelete?: boolean;
  description?: string;
}

export const editableFields = (r: ResourceDef) => r.fields.filter((f) => !f.readOnly && !f.workflow && !f.hidden && f.type !== "computed");

/** Fields the API accepts from clients: editable fields plus hidden link columns. */
export const acceptedFields = (r: ResourceDef) => r.fields.filter((f) => !f.readOnly && !f.workflow && f.type !== "computed");

export const listFields = (r: ResourceDef) => r.fields.filter((f) => f.list && !f.hidden);

export const importFields = (r: ResourceDef) => r.fields.filter((f) => !f.readOnly && !f.hidden && f.type !== "computed" && !f.workflow);
