import "server-only";
import type { ExpenseStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { AuthorizationError, caseVisibilityWhere, requirePermission } from "@/server/authz";
import type { CurrentUser } from "@/server/auth/principal";
import { getSetting } from "@/server/services/settings";
import { COUNTED_EXPENSE_STATUSES } from "@/lib/finance";
import { can, type Module } from "@/lib/permissions";
import { enumLabel } from "@/lib/enums";
import { money, toDbString } from "@/lib/money";
import { DASHBOARD_METRICS, type DashboardMetric } from "@/lib/dashboard-metrics";

const DAY = 86_400_000;
/** Rows returned per metric. The total is always the full count, so the drawer can say when it is showing a subset. */
export const METRIC_ROW_LIMIT = 100;

export interface MetricRow {
  id: string;
  href: string;
  reference: string | null;
  title: string;
  subtitle: string | null;
  status: string | null;
  date: string | null;
  amount: string | null;
}

export interface MetricResult {
  metric: DashboardMetric;
  total: number;
  rows: MetricRow[];
  dateLabel: string | null;
  amountLabel: string | null;
}

const COUNTED = [...COUNTED_EXPENSE_STATUSES] as ExpenseStatus[];
const amount = (v: Prisma.Decimal | null | undefined) => (v === null || v === undefined ? null : toDbString(money(v)));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;

/**
 * The case scopes behind the dashboard figures. `visible` and `openCase` match the dashboard service;
 * record-level metrics also require the viewer to see that module on the case (caseVisibilityWhere).
 */
export function dashboardScopes(user: CurrentUser, now: Date, inactivityDays: number) {
  const visible = { AND: [caseVisibilityWhere(user, "CASES"), { isDeleted: false }] } satisfies Prisma.CaseWhereInput;
  const openCase = { AND: [visible, { status: { not: "CLOSED" as const } }] } satisfies Prisma.CaseWhereInput;
  const inactiveCase = {
    AND: [openCase, { status: { not: "DRAFT" as const } }, { lastActivityAt: { lt: new Date(now.getTime() - inactivityDays * DAY) } }],
  } satisfies Prisma.CaseWhereInput;
  const awaitingDecision = { AND: [visible, { status: "AWAITING_MANAGEMENT_DECISION" as const }] } satisfies Prisma.CaseWhereInput;
  const unaccountedAdvance = (caseWhere: Prisma.CaseWhereInput = visible) =>
    ({ isDeleted: false, status: { in: ["ISSUED", "PARTLY_ACCOUNTED"] }, accountingDeadline: { lt: now }, case: caseWhere }) satisfies Prisma.AdvanceWhereInput;
  const overdueTask = (caseWhere: Prisma.CaseWhereInput = openCase) =>
    ({ isDeleted: false, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: now }, case: caseWhere }) satisfies Prisma.TaskWhereInput;
  return { visible, openCase, inactiveCase, awaitingDecision, unaccountedAdvance, overdueTask };
}

const caseSelect = {
  id: true,
  reference: true,
  title: true,
  status: true,
  stage: true,
  openedAt: true,
  lastActivityAt: true,
  grossAmount: true,
  leadInvestigator: { select: { fullName: true } },
} satisfies Prisma.CaseSelect;
type CaseRow = Prisma.CaseGetPayload<{ select: typeof caseSelect }>;

function caseRow(c: CaseRow, date: Date | null, withAmount = false): MetricRow {
  return {
    id: c.id,
    href: `/cases/${c.id}`,
    reference: c.reference,
    title: c.title,
    subtitle: join(enumLabel(c.stage), c.leadInvestigator ? `Lead: ${c.leadInvestigator.fullName}` : "Unassigned"),
    status: c.status,
    date: iso(date),
    amount: withAmount ? amount(c.grossAmount) : null,
  };
}

async function listCases(where: Prisma.CaseWhereInput, orderBy: Prisma.CaseOrderByWithRelationInput[], pick: (c: CaseRow) => Date | null, withAmount = false) {
  const [total, rows] = await Promise.all([prisma.case.count({ where }), prisma.case.findMany({ where, orderBy, take: METRIC_ROW_LIMIT, select: caseSelect })]);
  return { total, rows: rows.map((c) => caseRow(c, pick(c), withAmount)) };
}

/** Which module a metric's records belong to. "pending-finance" needs expenses or recoveries. */
const METRIC_MODULES: Record<DashboardMetric, Module[]> = {
  "open-cases": ["CASES"],
  "inactive-cases": ["CASES"],
  "awaiting-decision": ["CASES"],
  exposure: ["CASES"],
  "overdue-tasks": ["TASKS"],
  "unaccounted-advances": ["ADVANCES"],
  recovered: ["RECOVERIES"],
  expenses: ["EXPENSES"],
  budgets: ["BUDGETS"],
  "pending-finance": ["EXPENSES", "RECOVERIES"],
};

export function isDashboardMetric(v: string): v is DashboardMetric {
  return (DASHBOARD_METRICS as readonly string[]).includes(v);
}

/** The records behind one dashboard figure, limited to what the viewer may see. */
export async function dashboardMetric(user: CurrentUser, metric: DashboardMetric): Promise<MetricResult> {
  await requirePermission(user, "DASHBOARD", "VIEW");
  const modules = METRIC_MODULES[metric];
  const allowed = modules.filter((m) => can(user, m, "VIEW"));
  if (!allowed.length) {
    // Records the dashboard only counts are not listed without the module's own VIEW permission.
    await requirePermission(user, modules[0]!, "VIEW");
    throw new AuthorizationError();
  }

  const now = new Date();
  const sc = dashboardScopes(user, now, await getSetting("reminders.inactivityDays"));
  const within = (module: Module, base: Prisma.CaseWhereInput): Prisma.CaseWhereInput => ({ AND: [base, caseVisibilityWhere(user, module)] });
  const base = { metric, dateLabel: null, amountLabel: null };

  switch (metric) {
    case "open-cases":
      return { ...base, dateLabel: "Opened", ...(await listCases(sc.openCase, [{ openedAt: "asc" }, { id: "asc" }], (c) => c.openedAt)) };
    case "inactive-cases":
      return { ...base, dateLabel: "Last activity", ...(await listCases(sc.inactiveCase, [{ lastActivityAt: "asc" }, { id: "asc" }], (c) => c.lastActivityAt)) };
    case "awaiting-decision":
      return { ...base, dateLabel: "Last activity", ...(await listCases(sc.awaitingDecision, [{ lastActivityAt: "asc" }, { id: "asc" }], (c) => c.lastActivityAt)) };
    case "exposure":
      return {
        ...base,
        dateLabel: "Opened",
        amountLabel: "Gross amount",
        ...(await listCases({ AND: [sc.openCase, { grossAmount: { gt: 0 } }] }, [{ grossAmount: "desc" }, { id: "asc" }], (c) => c.openedAt, true)),
      };

    case "overdue-tasks": {
      const where = sc.overdueTask(within("TASKS", sc.openCase));
      const [total, rows] = await Promise.all([
        prisma.task.count({ where }),
        prisma.task.findMany({
          where,
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          take: METRIC_ROW_LIMIT,
          select: {
            id: true,
            reference: true,
            title: true,
            status: true,
            dueDate: true,
            category: true,
            caseId: true,
            case: { select: { reference: true } },
            assignee: { select: { fullName: true } },
          },
        }),
      ]);
      return {
        ...base,
        dateLabel: "Due",
        total,
        rows: rows.map((t) => ({
          id: t.id,
          href: `/cases/${t.caseId}?tab=tasks`,
          reference: t.reference,
          title: t.title,
          subtitle: join(t.case.reference, enumLabel(t.category), t.assignee ? `Assigned to ${t.assignee.fullName}` : "Unassigned"),
          status: "OVERDUE",
          date: iso(t.dueDate),
          amount: null,
        })),
      };
    }

    case "unaccounted-advances": {
      const where = sc.unaccountedAdvance(within("ADVANCES", sc.visible));
      const [total, rows] = await Promise.all([
        prisma.advance.count({ where }),
        prisma.advance.findMany({
          where,
          orderBy: [{ accountingDeadline: "asc" }, { id: "asc" }],
          take: METRIC_ROW_LIMIT,
          select: {
            id: true,
            reference: true,
            purpose: true,
            status: true,
            amountIssued: true,
            accountingDeadline: true,
            caseId: true,
            case: { select: { reference: true } },
            employee: { select: { fullName: true } },
          },
        }),
      ]);
      return {
        ...base,
        dateLabel: "Deadline",
        amountLabel: "Issued",
        total,
        rows: rows.map((a) => ({
          id: a.id,
          href: `/cases/${a.caseId}?tab=costs`,
          reference: a.reference,
          title: a.purpose,
          subtitle: join(a.case.reference, a.employee.fullName),
          status: a.status,
          date: iso(a.accountingDeadline),
          amount: amount(a.amountIssued),
        })),
      };
    }

    case "recovered": {
      const where = { isDeleted: false, status: "VERIFIED" as const, case: within("RECOVERIES", sc.visible) } satisfies Prisma.RecoveryWhereInput;
      const [total, rows] = await Promise.all([
        prisma.recovery.count({ where }),
        prisma.recovery.findMany({
          where,
          orderBy: [{ recoveryDate: "desc" }, { id: "asc" }],
          take: METRIC_ROW_LIMIT,
          select: { id: true, reference: true, payer: true, method: true, status: true, recoveryDate: true, grossAmount: true, caseId: true, case: { select: { reference: true } } },
        }),
      ]);
      return { ...base, dateLabel: "Recovered", amountLabel: "Gross amount", total, rows: rows.map(recoveryRow) };
    }

    case "expenses": {
      const where = { isDeleted: false, status: { in: COUNTED }, case: within("EXPENSES", sc.visible) } satisfies Prisma.ExpenseWhereInput;
      const [total, rows] = await Promise.all([
        prisma.expense.count({ where }),
        prisma.expense.findMany({ where, orderBy: [{ expenseDate: "desc" }, { id: "asc" }], take: METRIC_ROW_LIMIT, select: expenseSelect }),
      ]);
      return { ...base, dateLabel: "Expense date", amountLabel: "Approved", total, rows: rows.map(expenseRow) };
    }

    case "budgets": {
      const where = { isDeleted: false, status: { in: ["APPROVED", "REVISED"] }, case: within("BUDGETS", sc.visible) } satisfies Prisma.BudgetWhereInput;
      const [total, rows] = await Promise.all([
        prisma.budget.count({ where }),
        prisma.budget.findMany({
          where,
          orderBy: [{ approvedAmount: "desc" }, { id: "asc" }],
          take: METRIC_ROW_LIMIT,
          select: { id: true, pathway: true, status: true, approvedAt: true, approvedAmount: true, caseId: true, case: { select: { reference: true, title: true } } },
        }),
      ]);
      return {
        ...base,
        dateLabel: "Approved on",
        amountLabel: "Approved",
        total,
        rows: rows.map((b) => ({
          id: b.id,
          href: `/cases/${b.caseId}?tab=costs`,
          reference: b.case.reference,
          title: `${enumLabel(b.pathway)} budget`,
          subtitle: b.case.title,
          status: b.status,
          date: iso(b.approvedAt),
          amount: amount(b.approvedAmount),
        })),
      };
    }

    case "pending-finance": {
      const expenseWhere = { isDeleted: false, status: "SUBMITTED" as const, case: within("EXPENSES", sc.visible) } satisfies Prisma.ExpenseWhereInput;
      const recoveryWhere = { isDeleted: false, status: "RECORDED" as const, case: within("RECOVERIES", sc.visible) } satisfies Prisma.RecoveryWhereInput;
      const showExpenses = allowed.includes("EXPENSES");
      const showRecoveries = allowed.includes("RECOVERIES");
      const [expenseTotal, expenses, recoveryTotal, recoveries] = await Promise.all([
        showExpenses ? prisma.expense.count({ where: expenseWhere }) : 0,
        showExpenses ? prisma.expense.findMany({ where: expenseWhere, orderBy: [{ expenseDate: "asc" }, { id: "asc" }], take: METRIC_ROW_LIMIT, select: expenseSelect }) : [],
        showRecoveries ? prisma.recovery.count({ where: recoveryWhere }) : 0,
        showRecoveries
          ? prisma.recovery.findMany({
              where: recoveryWhere,
              orderBy: [{ recoveryDate: "asc" }, { id: "asc" }],
              take: METRIC_ROW_LIMIT,
              select: { id: true, reference: true, payer: true, method: true, status: true, recoveryDate: true, grossAmount: true, caseId: true, case: { select: { reference: true } } },
            })
          : [],
      ]);
      const rows = [...expenses.map(expenseRow), ...recoveries.map(recoveryRow)].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).slice(0, METRIC_ROW_LIMIT);
      return { ...base, dateLabel: "Dated", amountLabel: "Amount", total: expenseTotal + recoveryTotal, rows };
    }
  }
}

const expenseSelect = {
  id: true,
  reference: true,
  description: true,
  category: true,
  pathway: true,
  status: true,
  expenseDate: true,
  approvedAmount: true,
  requestedAmount: true,
  caseId: true,
  case: { select: { reference: true } },
} satisfies Prisma.ExpenseSelect;

function expenseRow(e: Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>): MetricRow {
  const counted = COUNTED_EXPENSE_STATUSES.has(e.status);
  return {
    id: e.id,
    href: `/cases/${e.caseId}?tab=costs`,
    reference: e.reference,
    title: e.description,
    subtitle: join("Expense", e.case.reference, enumLabel(e.category), enumLabel(e.pathway)),
    status: e.status,
    date: iso(e.expenseDate),
    amount: amount(counted ? e.approvedAmount : e.requestedAmount),
  };
}

function recoveryRow(r: {
  id: string;
  reference: string;
  payer: string;
  method: string;
  status: string;
  recoveryDate: Date;
  grossAmount: Prisma.Decimal;
  caseId: string;
  case: { reference: string };
}): MetricRow {
  return {
    id: r.id,
    href: `/cases/${r.caseId}?tab=recoveries`,
    reference: r.reference,
    title: r.payer,
    subtitle: join("Recovery", r.case.reference, enumLabel(r.method)),
    status: r.status,
    date: iso(r.recoveryDate),
    amount: amount(r.grossAmount),
  };
}
