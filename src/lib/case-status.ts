// Case status machine and closure checklist. Pure so the same rules drive the API and the UI.
import { ENUMS, enumLabel, type EnumValue } from "@/lib/enums";

export type CaseStatus = EnumValue<"CaseStatus">;
export const CASE_STATUSES = ENUMS.CaseStatus;

/** Statuses a user may pick directly. CLOSED and REOPENED are reached only through their workflows. */
export const MANUAL_STATUSES: CaseStatus[] = CASE_STATUSES.filter((s) => s !== "CLOSED" && s !== "REOPENED");

export type TransitionVia = "manual" | "closure" | "reopen";

export function canTransition(from: CaseStatus, to: CaseStatus, via: TransitionVia = "manual"): boolean {
  if (from === to) return false;
  if (via === "closure") return from !== "CLOSED" && from !== "DRAFT" && to === "CLOSED";
  if (via === "reopen") return from === "CLOSED" && to === "REOPENED";
  // Manual changes
  if (from === "CLOSED") return false; // a closed case must be reopened first
  if (to === "CLOSED" || to === "REOPENED") return false;
  if (to === "DRAFT") return false; // a case never returns to draft once it has progressed
  if (from === "DRAFT") return to === "PRELIMINARY_REVIEW" || to === "UNDER_INTERNAL_INVESTIGATION";
  return true;
}

export class InvalidTransitionError extends Error {
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`A case cannot move from "${enumLabel(from)}" to "${enumLabel(to)}".`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: CaseStatus, to: CaseStatus, via: TransitionVia = "manual"): void {
  if (!canTransition(from, to, via)) throw new InvalidTransitionError(from, to);
}

export function allowedNextStatuses(from: CaseStatus): CaseStatus[] {
  return MANUAL_STATUSES.filter((to) => canTransition(from, to, "manual"));
}

export const isOpenStatus = (s: CaseStatus) => s !== "CLOSED";

// ───────────────────── Closure checklist ─────────────────────

export interface ClosureFacts {
  status: CaseStatus;
  openTasks: number;
  openSubFiles: number;
  undecidedFindings: number;
  decidedFindings: number;
  pendingExpenses: number;
  unverifiedRecoveries: number;
  outstandingAdvances: number;
  activeCriminalMatters: number;
  activeCivilMatters: number;
  pendingWriteOffs: number;
}

export interface ClosureCheck {
  key: string;
  label: string;
  ok: boolean;
  /** Blocking checks must pass before closure. Others are warnings shown to the approver. */
  blocking: boolean;
  detail: string;
}

export function closureChecklist(f: ClosureFacts): ClosureCheck[] {
  return [
    {
      key: "status",
      label: "Case is open and past draft",
      ok: f.status !== "CLOSED" && f.status !== "DRAFT",
      blocking: true,
      detail: f.status === "DRAFT" ? "Draft cases cannot be closed." : f.status === "CLOSED" ? "Already closed." : "OK",
    },
    {
      key: "tasks",
      label: "No open tasks",
      ok: f.openTasks === 0,
      blocking: true,
      detail: `${f.openTasks} open task(s)`,
    },
    {
      key: "subfiles",
      label: "All sub-files completed or closed",
      ok: f.openSubFiles === 0,
      blocking: true,
      detail: `${f.openSubFiles} sub-file(s) still open`,
    },
    {
      key: "findings",
      label: "Findings concluded with a management decision",
      ok: f.decidedFindings > 0 && f.undecidedFindings === 0,
      blocking: false,
      detail: `${f.decidedFindings} decided, ${f.undecidedFindings} awaiting decision`,
    },
    {
      key: "expenses",
      label: "No expenses awaiting approval",
      ok: f.pendingExpenses === 0,
      blocking: true,
      detail: `${f.pendingExpenses} submitted expense(s)`,
    },
    {
      key: "recoveries",
      label: "All recoveries verified or rejected",
      ok: f.unverifiedRecoveries === 0,
      blocking: true,
      detail: `${f.unverifiedRecoveries} unverified recovery record(s)`,
    },
    {
      key: "advances",
      label: "All advances accounted for",
      ok: f.outstandingAdvances === 0,
      blocking: true,
      detail: `${f.outstandingAdvances} advance(s) not fully accounted`,
    },
    {
      key: "writeoffs",
      label: "No write-off awaiting approval",
      ok: f.pendingWriteOffs === 0,
      blocking: true,
      detail: `${f.pendingWriteOffs} write-off(s) in approval`,
    },
    {
      key: "external",
      label: "No active criminal or civil proceedings",
      ok: f.activeCriminalMatters === 0 && f.activeCivilMatters === 0,
      blocking: false,
      detail: `${f.activeCriminalMatters} criminal and ${f.activeCivilMatters} civil matter(s) still active`,
    },
  ];
}

export const closureBlocked = (checks: ClosureCheck[]) => checks.some((c) => c.blocking && !c.ok);
