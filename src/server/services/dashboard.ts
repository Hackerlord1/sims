import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { CurrentUser } from "@/server/auth/principal";
import { getSetting } from "@/server/services/settings";
import { COUNTED_EXPENSE_STATUSES, PATHWAYS } from "@/lib/finance";
import { can } from "@/lib/permissions";
import { money, percentage, sum, toDbString } from "@/lib/money";
import { dashboardScopes } from "@/server/services/dashboard-metrics";

const DAY = 86_400_000;
const s = (v: Prisma.Decimal | null | undefined) => toDbString(money(v ?? 0));

export async function dashboard(user: CurrentUser) {
  const now = new Date();
  const [inactivityDays, courtDays] = await Promise.all([getSetting("reminders.inactivityDays"), getSetting("reminders.courtDateDays")]);
  const sc = dashboardScopes(user, now, inactivityDays);
  const { visible, openCase } = sc;
  const live = { isDeleted: false };
  const counted = [...COUNTED_EXPENSE_STATUSES] as ("APPROVED" | "PARTIALLY_APPROVED" | "PAID" | "AWAITING_RECEIPT" | "ACCOUNTED_FOR" | "CLOSED")[];

  const [
    openCases,
    closedCases,
    byStatus,
    byStage,
    openedDates,
    exposure,
    recovered,
    expensesByPathway,
    expensesByCategory,
    budgets,
    overdueTasks,
    myTasks,
    inactiveCount,
    inactive,
    followUps,
    milestones,
    courtDates,
    awaitingDecisionCount,
    awaitingDecision,
    findingsSubmitted,
    unaccountedCount,
    unaccounted,
    importFailures,
    pendingExpenses,
    pendingRecoveries,
  ] = await Promise.all([
    prisma.case.count({ where: openCase }),
    prisma.case.count({ where: { AND: [visible, { status: "CLOSED" }] } }),
    prisma.case.groupBy({ by: ["status"], where: visible, _count: { _all: true } }),
    prisma.case.groupBy({ by: ["stage"], where: openCase, _count: { _all: true } }),
    prisma.case.findMany({ where: openCase, select: { openedAt: true } }),
    prisma.case.aggregate({ where: openCase, _sum: { grossAmount: true, amountDemanded: true, amountDisputed: true, amountAcknowledged: true, amountConfirmedRecoverable: true } }),
    prisma.recovery.aggregate({ where: { ...live, status: "VERIFIED", case: visible }, _sum: { grossAmount: true, recoveryCosts: true } }),
    prisma.expense.groupBy({ by: ["pathway"], where: { ...live, status: { in: counted }, case: visible }, _sum: { approvedAmount: true } }),
    prisma.expense.groupBy({ by: ["category"], where: { ...live, status: { in: counted }, case: visible }, _sum: { approvedAmount: true }, orderBy: { _sum: { approvedAmount: "desc" } } }),
    prisma.budget.aggregate({ where: { ...live, status: { in: ["APPROVED", "REVISED"] }, case: visible }, _sum: { approvedAmount: true } }),
    prisma.task.count({ where: sc.overdueTask() }),
    prisma.task.findMany({
      where: { ...live, assigneeId: user.id, status: { notIn: ["COMPLETED", "CANCELLED"] }, case: openCase },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: 10,
      select: { id: true, reference: true, title: true, dueDate: true, status: true, category: true, caseId: true },
    }),
    prisma.case.count({ where: sc.inactiveCase }),
    prisma.case.findMany({
      where: sc.inactiveCase,
      orderBy: { lastActivityAt: "asc" },
      take: 10,
      select: { id: true, reference: true, title: true, lastActivityAt: true },
    }),
    prisma.task.findMany({
      where: { ...live, category: { in: ["POLICE_FOLLOW_UP", "DCI_FOLLOW_UP", "DPP_FOLLOW_UP", "ADVOCATE_FOLLOW_UP"] }, status: { notIn: ["COMPLETED", "CANCELLED"] }, case: openCase },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }],
      take: 10,
      select: { id: true, title: true, dueDate: true, category: true, caseId: true, case: { select: { reference: true } } },
    }),
    prisma.criminalMilestone.findMany({
      where: { ...live, nextDate: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 30 * DAY) }, matter: { isDeleted: false, case: openCase } },
      orderBy: { nextDate: "asc" },
      take: 10,
      select: { id: true, milestone: true, nextDate: true, nextTask: true, matter: { select: { obNumber: true, policeStation: true, caseId: true } } },
    }),
    prisma.courtEvent.findMany({
      where: { ...live, nextCourtDate: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + Math.max(30, courtDays) * DAY) }, matter: { isDeleted: false, case: openCase } },
      orderBy: { nextCourtDate: "asc" },
      take: 10,
      select: { id: true, eventType: true, nextCourtDate: true, nextTask: true, matter: { select: { courtCaseNumber: true, court: true, caseId: true } } },
    }),
    prisma.case.count({ where: sc.awaitingDecision }),
    prisma.case.findMany({ where: sc.awaitingDecision, orderBy: [{ lastActivityAt: "asc" }, { id: "asc" }], take: 10, select: { id: true, reference: true, title: true, lastActivityAt: true } }),
    prisma.finding.count({ where: { ...live, status: "SUBMITTED", case: visible } }),
    prisma.advance.count({ where: sc.unaccountedAdvance() }),
    prisma.advance.findMany({
      where: sc.unaccountedAdvance(),
      orderBy: [{ accountingDeadline: "asc" }, { id: "asc" }],
      take: 10,
      select: { id: true, reference: true, purpose: true, amountIssued: true, accountingDeadline: true, caseId: true, employee: { select: { fullName: true } } },
    }),
    can(user, "DATA_ADMIN", "BULK_UPLOAD")
      ? prisma.importBatch.findMany({
          where: { status: { in: ["FAILED", "ROLLED_BACK", "PARTIALLY_COMPLETED"] }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.expense.count({ where: { ...live, status: "SUBMITTED", case: visible } }),
    prisma.recovery.count({ where: { ...live, status: "RECORDED", case: visible } }),
  ]);

  const aging = [
    { bucket: "0–30 days", min: 0, max: 30 },
    { bucket: "31–90 days", min: 31, max: 90 },
    { bucket: "91–180 days", min: 91, max: 180 },
    { bucket: "181–365 days", min: 181, max: 365 },
    { bucket: "Over a year", min: 366, max: Infinity },
  ].map((b) => ({
    bucket: b.bucket,
    count: openedDates.filter((c) => {
      const d = Math.floor((now.getTime() - c.openedAt.getTime()) / DAY);
      return d >= b.min && d <= b.max;
    }).length,
  }));

  const costs = Object.fromEntries(PATHWAYS.map((p) => [p, money(expensesByPathway.find((e) => e.pathway === p)?._sum.approvedAmount ?? 0)]));
  costs.RECOVERY = costs.RECOVERY!.plus(money(recovered._sum.recoveryCosts ?? 0));
  const totalCost = sum(Object.values(costs));
  const gross = money(recovered._sum.grossAmount ?? 0);
  const confirmed = money(exposure._sum.amountConfirmedRecoverable ?? 0);
  const budget = money(budgets._sum.approvedAmount ?? 0);
  const actual = sum(expensesByPathway.map((e) => e._sum.approvedAmount ?? 0));

  return {
    counts: {
      openCases,
      closedCases,
      overdueTasks,
      inactiveCases: inactiveCount,
      awaitingDecision: awaitingDecisionCount,
      findingsSubmitted,
      pendingExpenses,
      pendingRecoveries,
      unaccountedAdvances: unaccountedCount,
    },
    casesByStatus: byStatus.map((b) => ({ status: b.status, count: b._count._all })).sort((a, b) => b.count - a.count),
    casesByStage: byStage.map((b) => ({ stage: b.stage, count: b._count._all })),
    aging,
    exposure: {
      grossAmount: s(exposure._sum.grossAmount),
      amountDemanded: s(exposure._sum.amountDemanded),
      amountDisputed: s(exposure._sum.amountDisputed),
      amountAcknowledged: s(exposure._sum.amountAcknowledged),
      amountConfirmedRecoverable: toDbString(confirmed),
      amountRecovered: toDbString(gross),
    },
    costs: {
      investigation: toDbString(costs.INVESTIGATION!),
      criminal: toDbString(costs.CRIMINAL!),
      civil: toDbString(costs.CIVIL!),
      recovery: toDbString(costs.RECOVERY!),
      total: toDbString(totalCost),
      netRecovery: toDbString(gross.minus(totalCost)),
      recoveryRate: percentage(gross, confirmed)?.toFixed(2) ?? null,
      costToRecoveryRatio: percentage(totalCost, gross)?.toFixed(2) ?? null,
    },
    expensesByCategory: expensesByCategory.map((e) => ({ category: e.category, amount: s(e._sum.approvedAmount) })),
    budget: { approved: toDbString(budget), actual: toDbString(actual), variance: toDbString(budget.minus(actual)), utilisation: percentage(actual, budget)?.toFixed(2) ?? null },
    myTasks,
    inactive,
    followUps,
    milestones,
    courtDates,
    awaitingDecision,
    unaccounted: unaccounted.map((a) => ({ ...a, amountIssued: s(a.amountIssued) })),
    importFailures,
  };
}
