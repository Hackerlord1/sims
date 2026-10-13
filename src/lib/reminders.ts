// Reminder and deadline rules (pure). Dates are compared in Africa/Nairobi calendar days.

export const DEFAULT_DUE_SOON_DAYS = 3;
export const DEFAULT_INACTIVITY_DAYS = 14;

const DAY = 24 * 60 * 60 * 1000;
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(d); // YYYY-MM-DD

/** Whole calendar days from `now` to `due` in Nairobi time (negative = past). */
export function daysUntil(due: Date, now: Date = new Date()): number {
  const a = Date.parse(dayKey(due));
  const b = Date.parse(dayKey(now));
  return Math.round((a - b) / DAY);
}

export type DeadlineState = "OVERDUE" | "DUE_TODAY" | "DUE_SOON" | "ON_TRACK" | "NO_DUE_DATE" | "DONE";

const CLOSED_TASK = new Set(["COMPLETED", "CANCELLED"]);

export function deadlineState(task: { status: string; dueDate: Date | string | null }, now: Date = new Date(), dueSoonDays = DEFAULT_DUE_SOON_DAYS): DeadlineState {
  if (CLOSED_TASK.has(task.status)) return "DONE";
  if (!task.dueDate) return "NO_DUE_DATE";
  const d = daysUntil(new Date(task.dueDate), now);
  if (d < 0) return "OVERDUE";
  if (d === 0) return "DUE_TODAY";
  if (d <= dueSoonDays) return "DUE_SOON";
  return "ON_TRACK";
}

/** The status shown to users: an open task past its due date reads as OVERDUE. */
export function effectiveTaskStatus(task: { status: string; dueDate: Date | string | null }, now = new Date()): string {
  return deadlineState(task, now) === "OVERDUE" ? "OVERDUE" : task.status;
}

export function isCaseInactive(c: { status: string; lastActivityAt: Date | string }, now: Date = new Date(), inactivityDays = DEFAULT_INACTIVITY_DAYS): boolean {
  if (c.status === "CLOSED" || c.status === "DRAFT") return false;
  return now.getTime() - new Date(c.lastActivityAt).getTime() > inactivityDays * DAY;
}

export const FOLLOW_UP_CATEGORIES = new Set(["POLICE_FOLLOW_UP", "DCI_FOLLOW_UP", "DPP_FOLLOW_UP", "ADVOCATE_FOLLOW_UP"]);
