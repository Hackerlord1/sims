// Dashboard figures that open the records behind them. Shared by the API route and the dashboard drawer.

export const DASHBOARD_METRICS = [
  "open-cases",
  "overdue-tasks",
  "inactive-cases",
  "awaiting-decision",
  "unaccounted-advances",
  "exposure",
  "recovered",
  "expenses",
  "budgets",
  "pending-finance",
] as const;
export type DashboardMetric = (typeof DASHBOARD_METRICS)[number];

export const METRIC_INFO: Record<DashboardMetric, { title: string; description: string; register?: { href: string; label: string } }> = {
  "open-cases": { title: "Open cases", description: "Every case you can access that is not closed, oldest first.", register: { href: "/cases", label: "Open the case register" } },
  "overdue-tasks": { title: "Overdue tasks", description: "Open tasks on open cases whose due date has passed, most overdue first.", register: { href: "/tasks", label: "Open the task register" } },
  "inactive-cases": {
    title: "Inactive cases",
    description: "Open cases with no recorded activity within the inactivity threshold set in Settings.",
    register: { href: "/cases", label: "Open the case register" },
  },
  "awaiting-decision": {
    title: "Awaiting management decision",
    description: "Cases whose findings are with management for a decision.",
    register: { href: "/cases", label: "Open the case register" },
  },
  "unaccounted-advances": {
    title: "Unaccounted advances",
    description: "Issued or partly accounted advances past their accounting deadline.",
    register: { href: "/advances", label: "Open the advances register" },
  },
  exposure: { title: "Financial exposure", description: "Open cases carrying a gross amount under investigation, largest first.", register: { href: "/cases", label: "Open the case register" } },
  recovered: {
    title: "Amount recovered",
    description: "Verified recoveries, most recent first. Only verified recoveries count towards the total.",
    register: { href: "/recoveries", label: "Open the recoveries register" },
  },
  expenses: {
    title: "Investigation expenses",
    description: "Approved, paid and accounted expenses — the ones counted in costs.",
    register: { href: "/expenses", label: "Open the expenses register" },
  },
  budgets: { title: "Approved budgets", description: "Approved and revised budgets, largest first.", register: { href: "/budgets", label: "Open the budgets register" } },
  "pending-finance": { title: "Awaiting finance action", description: "Submitted expenses awaiting approval and recorded recoveries awaiting verification." },
};
