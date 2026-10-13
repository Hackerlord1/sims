import { AlertTriangle, Check, Minus } from "lucide-react";
import Link from "next/link";
import type { Row } from "@/components/resources/hooks";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DateText, Money, Ref } from "@/components/ui/display";
import type { FieldDef } from "@/lib/resources/types";

const MONEY_COMPUTED = new Set(["amountOutstanding", "amountRecovered", "outstandingBalance", "netAmount", "actualExpenditure", "unusedBalance", "additionalAmountDue"]);

export function rowCurrency(row: Row): string {
  return String(row.currency ?? (row.case as Row | undefined)?.currency ?? "KES");
}

export function Cell({ field: f, row, full }: { field: FieldDef; row: Row; full?: boolean }) {
  const v = row[f.name];
  const label = row._labels?.[f.name];
  if (f.type === "computed") {
    if (MONEY_COMPUTED.has(f.name)) return <Money value={v as string} currency={rowCurrency(row)} />;
    if (f.name === "warningCount") {
      const n = Number(v ?? 0);
      return n ? (
        <Badge tone="warning" icon={AlertTriangle}>
          {n} warning{n === 1 ? "" : "s"}
        </Badge>
      ) : (
        <span className="text-muted">None</span>
      );
    }
    return <span className="tabular">{String(v ?? "—")}</span>;
  }
  if (v === null || v === undefined || v === "") return <span className="text-muted">—</span>;
  switch (f.type) {
    case "enum":
      return <StatusBadge value={String(v)} />;
    case "money":
      return <Money value={v as string} currency={rowCurrency(row)} />;
    case "date":
      return <DateText value={v as string} />;
    case "datetime":
      return <DateText value={v as string} withTime />;
    case "boolean":
      return v ? (
        <span className="inline-flex items-center gap-1">
          <Check className="h-4 w-4 text-success" aria-hidden /> Yes
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted">
          <Minus className="h-4 w-4" aria-hidden /> No
        </span>
      );
    case "user":
    case "company":
    case "branch":
      return <span>{label ?? "—"}</span>;
    case "relation":
      return <span className="text-sm">{label ?? <span className="text-muted">Linked record</span>}</span>;
    case "textarea": {
      const text = String(v);
      if (full) return <span className="whitespace-pre-wrap">{text}</span>;
      return <span title={text.length > 80 ? text : undefined}>{text.length > 80 ? text.slice(0, 77) + "…" : text}</span>;
    }
    default:
      return f.mono ? <Ref>{String(v)}</Ref> : <span>{String(v)}</span>;
  }
}

export function CaseLink({ row }: { row: Row }) {
  const c = row.case as { id?: string; reference?: string; title?: string } | undefined;
  const id = c?.id ?? (row.caseId as string | undefined);
  if (!id) return <span className="text-muted">—</span>;
  return (
    <Link href={`/cases/${id}`} className="group block min-w-0" onClick={(e) => e.stopPropagation()}>
      <Ref className="text-accent group-hover:underline">{c?.reference ?? "Case"}</Ref>
      {c?.title ? <span className="block max-w-56 truncate text-xs text-muted">{c.title}</span> : null}
    </Link>
  );
}
