import type { Row } from "@/components/resources/hooks";
import type { ResourceDef } from "@/lib/resources/types";
import { enumLabel } from "@/lib/enums";

/** Human label for a record in lists and pickers (mirrors the server's rowLabel). */
export function rowLabelClient(r: ResourceDef, row: Row): string {
  const titleField = r.fields.find((f) => f.name === r.titleField);
  const raw = row[r.titleField];
  const title = titleField?.type === "enum" ? enumLabel(String(raw ?? "")) : String(raw ?? "");
  const short = title.length > 60 ? title.slice(0, 57) + "…" : title;
  const ref = r.referenceField ? row[r.referenceField] : null;
  return ref && r.referenceField !== r.titleField ? `${String(ref)} — ${short}` : short;
}
