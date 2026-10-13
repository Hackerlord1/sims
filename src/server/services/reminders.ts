import "server-only";
import type { Prisma, RoleCode } from "@prisma/client";
import { prisma } from "@/server/db";
import { createNotifications } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";
import { deadlineState, daysUntil } from "@/lib/reminders";
import { enumLabel } from "@/lib/enums";

type NewNotification = Prisma.NotificationCreateManyInput & { dedupeKey: string };

const today = () => new Date().toISOString().slice(0, 10);

async function usersWithRoles(roles: RoleCode[]) {
  const users = await prisma.user.findMany({ where: { role: { in: roles }, status: "ACTIVE" }, select: { id: true } });
  return users.map((u) => u.id);
}

/**
 * Creates reminder notifications. Each carries a dedupe key, so running the sweep repeatedly
 * never duplicates a reminder for the same item on the same day.
 */
export async function runReminderSweep(now = new Date()) {
  const [dueSoonDays, inactivityDays, courtDays] = await Promise.all([getSetting("reminders.dueSoonDays"), getSetting("reminders.inactivityDays"), getSetting("reminders.courtDateDays")]);
  const day = today();
  const out: NewNotification[] = [];
  const horizon = new Date(now.getTime() + Math.max(dueSoonDays, courtDays) * 86_400_000 + 86_400_000);
  const liveCase = { isDeleted: false, status: { not: "CLOSED" as const } };

  // Tasks: due soon, due today, overdue — including police, DCI, DPP and advocate follow-ups.
  const tasks = await prisma.task.findMany({
    where: { isDeleted: false, assigneeId: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lte: horizon }, case: liveCase },
    select: { id: true, title: true, status: true, dueDate: true, category: true, assigneeId: true, caseId: true, case: { select: { reference: true } } },
  });
  for (const t of tasks) {
    const state = deadlineState(t, now, dueSoonDays);
    if (state !== "OVERDUE" && state !== "DUE_TODAY" && state !== "DUE_SOON") continue;
    const kind = t.category.endsWith("FOLLOW_UP") && t.category !== "DEMAND_FOLLOW_UP" && t.category !== "RECOVERY_FOLLOW_UP" ? "FOLLOW_UP" : state;
    const what = state === "OVERDUE" ? "is overdue" : state === "DUE_TODAY" ? "is due today" : `is due in ${daysUntil(t.dueDate!, now)} day(s)`;
    out.push({
      userId: t.assigneeId!,
      kind,
      title: `${kind === "FOLLOW_UP" ? enumLabel(t.category) + ": " : ""}${t.title}`.slice(0, 200),
      body: `Task on ${t.case.reference} ${what}.`,
      link: `/cases/${t.caseId}?tab=tasks`,
      dedupeKey: `task:${t.id}:${state}:${day}`,
    });
  }

  // Inactive cases → lead investigator.
  const inactive = await prisma.case.findMany({
    where: { ...liveCase, status: { notIn: ["CLOSED", "DRAFT"] }, leadInvestigatorId: { not: null }, lastActivityAt: { lt: new Date(now.getTime() - inactivityDays * 86_400_000) } },
    select: { id: true, reference: true, title: true, leadInvestigatorId: true, lastActivityAt: true },
    take: 500,
  });
  const week = `${now.getUTCFullYear()}-w${Math.floor(now.getTime() / (7 * 86_400_000))}`;
  for (const c of inactive) {
    out.push({
      userId: c.leadInvestigatorId!,
      kind: "INACTIVE_CASE",
      title: `No activity on ${c.reference}`,
      body: `${c.title} has had no recorded activity for over ${inactivityDays} days.`,
      link: `/cases/${c.id}`,
      dedupeKey: `inactive:${c.id}:${week}`,
    });
  }

  // Court dates (civil) and next dates (criminal) → internal officer and case lead.
  const courtHorizon = new Date(now.getTime() + courtDays * 86_400_000);
  const [events, milestones] = await Promise.all([
    prisma.courtEvent.findMany({
      where: { isDeleted: false, nextCourtDate: { gte: new Date(now.getTime() - 86_400_000), lte: courtHorizon }, matter: { isDeleted: false, case: liveCase } },
      select: {
        id: true,
        nextCourtDate: true,
        eventType: true,
        matter: { select: { courtCaseNumber: true, internalLegalOfficerId: true, caseId: true, case: { select: { reference: true, leadInvestigatorId: true } } } },
      },
    }),
    prisma.criminalMilestone.findMany({
      where: { isDeleted: false, nextDate: { gte: new Date(now.getTime() - 86_400_000), lte: courtHorizon }, matter: { isDeleted: false, case: liveCase } },
      select: {
        id: true,
        nextDate: true,
        milestone: true,
        matter: { select: { obNumber: true, internalOfficerId: true, caseId: true, case: { select: { reference: true, leadInvestigatorId: true } } } },
      },
    }),
  ]);
  for (const e of events) {
    for (const userId of new Set([e.matter.internalLegalOfficerId, e.matter.case.leadInvestigatorId].filter(Boolean) as string[])) {
      out.push({
        userId,
        kind: "COURT_DATE",
        title: `Court date ${e.nextCourtDate!.toISOString().slice(0, 10)} — ${e.matter.courtCaseNumber ?? e.matter.case.reference}`,
        body: `Next court date after ${enumLabel(e.eventType).toLowerCase()} on ${e.matter.case.reference}.`,
        link: `/cases/${e.matter.caseId}?tab=civil`,
        dedupeKey: `court:${e.id}:${userId}:${day}`,
      });
    }
  }
  for (const m of milestones) {
    for (const userId of new Set([m.matter.internalOfficerId, m.matter.case.leadInvestigatorId].filter(Boolean) as string[])) {
      out.push({
        userId,
        kind: "FOLLOW_UP",
        title: `Police/DCI/DPP follow-up ${m.nextDate!.toISOString().slice(0, 10)} — ${m.matter.obNumber ?? m.matter.case.reference}`,
        body: `Next step after "${enumLabel(m.milestone)}" on ${m.matter.case.reference}.`,
        link: `/cases/${m.matter.caseId}?tab=criminal`,
        dedupeKey: `milestone:${m.id}:${userId}:${day}`,
      });
    }
  }

  // Approvals awaiting action.
  const [findings, expenses, advances, writeOffs] = await Promise.all([
    prisma.finding.findMany({ where: { isDeleted: false, status: "SUBMITTED", case: liveCase }, select: { id: true, title: true, caseId: true, case: { select: { reference: true } } } }),
    prisma.expense.count({ where: { isDeleted: false, status: "SUBMITTED", case: liveCase } }),
    prisma.advance.count({ where: { isDeleted: false, status: "REQUESTED", case: liveCase } }),
    prisma.writeOff.findMany({
      where: { isDeleted: false, status: { in: ["FINANCE_REVIEW", "MANAGEMENT_APPROVAL", "BOARD_APPROVAL"] }, case: liveCase },
      select: { id: true, reference: true, status: true, caseId: true },
    }),
  ]);
  const managers = findings.length || writeOffs.length ? await usersWithRoles(["MANAGEMENT_APPROVER"]) : [];
  const finance = expenses || advances || writeOffs.length ? await usersWithRoles(["FINANCE_REVIEWER"]) : [];
  for (const f of findings) {
    for (const userId of managers) {
      out.push({
        userId,
        kind: "APPROVAL",
        title: `Decision needed: ${f.case.reference}`,
        body: `Findings "${f.title}" await a management decision.`,
        link: `/cases/${f.caseId}?tab=findings`,
        dedupeKey: `finding:${f.id}:${userId}:${day}`,
      });
    }
  }
  for (const w of writeOffs) {
    const recipients = w.status === "FINANCE_REVIEW" ? finance : managers;
    for (const userId of recipients) {
      out.push({
        userId,
        kind: "APPROVAL",
        title: `Write-off ${w.reference} awaits ${enumLabel(w.status).toLowerCase()}`,
        body: "A write-off is waiting for your review.",
        link: `/cases/${w.caseId}?tab=write-offs`,
        dedupeKey: `writeoff:${w.id}:${w.status}:${userId}:${day}`,
      });
    }
  }
  if (expenses || advances) {
    for (const userId of finance) {
      out.push({
        userId,
        kind: "APPROVAL",
        title: "Finance approvals waiting",
        body: `${expenses} expense(s) and ${advances} advance request(s) await approval.`,
        link: "/expenses",
        dedupeKey: `finance-queue:${userId}:${day}`,
      });
    }
  }

  // Unaccounted advances past their deadline → employee.
  const overdueAdvances = await prisma.advance.findMany({
    where: { isDeleted: false, status: { in: ["ISSUED", "PARTLY_ACCOUNTED"] }, accountingDeadline: { lt: now } },
    select: { id: true, reference: true, employeeId: true, caseId: true },
  });
  for (const a of overdueAdvances) {
    out.push({
      userId: a.employeeId,
      kind: "OVERDUE",
      title: `Account for advance ${a.reference}`,
      body: "The accounting deadline for this advance has passed.",
      link: `/cases/${a.caseId}?tab=costs`,
      dedupeKey: `advance:${a.id}:${day}`,
    });
  }

  // Notifications already sent for the same item (same dedupeKey) are skipped.
  const created = await createNotifications(prisma, out);
  return { candidates: out.length, created };
}
