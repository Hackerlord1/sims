import { AlertOctagon, AlertTriangle, Archive, CheckCircle2, CircleDashed, CircleDot, Clock, FileEdit, Lock, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { enumLabel } from "@/lib/enums";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "border-border bg-surface-2 text-muted",
  info: "border-info/30 bg-info-soft text-info",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  accent: "border-accent/30 bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", icon: Icon, children, className, title }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[11px] leading-4 font-medium tracking-[0.02em] whitespace-nowrap", TONES[tone], className)}
    >
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

const SUCCESS =
  /^(CLOSED|COMPLETED|VERIFIED|APPROVED|PAID|RECOVERED|CLEARED|ACCOUNTED|ACCOUNTED_FOR|CONFIRMED|SETTLED|DECIDED|REVIEWED|PARSED|SUCCEEDED|EXECUTED|VALID_AND_SUPPORTED|AVAILABLE|POSTED|SUFFICIENT|VERIFIED_DIRECT_MATCH|USER_CONFIRMED_MATCH|IMPORTED|FINAL_OUTCOME|JUDGMENT_OBTAINED)$/;
const DANGER = /(REJECTED|DISHONOURED|FAILED|OVERDUE|CRITICAL|FICTITIOUS|NOT_FOUND|INSUFFICIENT|INVALID|BLOCKED|MISSING|CUSTOMER_NOT_IDENTIFIED|NOT_RECOVERABLE|ROLLED_BACK|DUPLICATE|MISMATCH)/;
const WARNING =
  /(AWAITING|PENDING|SUBMITTED|WAITING|REVIEW|DUE|HIGH|DISPUTED|PARTLY|PARTIAL|QUEUED|RETURNED|SUGGESTED|UNRESOLVED|PROBABLE|APPROVAL|REFERRED|NEEDS|REOPENED|SHOW_CAUSE|WITH_DPP|REQUIRES)/;
const INFO = /(IN_PROGRESS|UNDER|ACTIVE|OPEN|ISSUED|IN_COURT|CHARGED|REPORTED|FILED|PARSING|IMPORTING|PRELIMINARY|MONITORING|CRIMINAL|CIVIL|DISCIPLINARY|EXECUTION|NEGOTIATION|RUNNING)/;

export function statusTone(value: string): { tone: Tone; icon: LucideIcon } {
  if (value === "DRAFT" || value === "NOT_STARTED" || value === "PROPOSED" || value === "UPLOADED") return { tone: "neutral", icon: FileEdit };
  if (value === "ARCHIVED") return { tone: "neutral", icon: Archive };
  if (value === "RESTRICTED" || value === "HIGHLY_CONFIDENTIAL") return { tone: "danger", icon: Lock };
  if (value === "CANCELLED" || value === "WITHDRAWN" || value === "SKIPPED") return { tone: "neutral", icon: CircleDashed };
  if (SUCCESS.test(value)) return { tone: "success", icon: CheckCircle2 };
  if (value === "CRITICAL" || value === "OVERDUE") return { tone: "danger", icon: AlertOctagon };
  if (DANGER.test(value)) return { tone: "danger", icon: XCircle };
  if (value === "HIGH" || value === "MEDIUM") return { tone: value === "HIGH" ? "warning" : "info", icon: AlertTriangle };
  if (WARNING.test(value)) return { tone: "warning", icon: Clock };
  if (INFO.test(value)) return { tone: "info", icon: CircleDot };
  return { tone: "neutral", icon: CircleDot };
}

/** Status shown with text and an icon, so meaning never depends on colour alone. */
export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className="text-muted">—</span>;
  const { tone, icon } = statusTone(value);
  return (
    <Badge tone={tone} icon={icon} className={className}>
      {enumLabel(value)}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "ref inline-flex items-center rounded-[3px] border border-dashed border-warning/60 bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium tracking-[0.14em] text-warning uppercase",
        className,
      )}
      title="Fictional record created by the demo seed. It is not a real investigation."
    >
      Demo data
    </span>
  );
}
