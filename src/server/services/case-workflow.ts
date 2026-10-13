import "server-only";
import type { CaseAssignmentRole, CaseStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { requireCaseAccess } from "@/server/authz";
import { ApiError, badRequest, conflict } from "@/server/api/errors";
import type { CurrentUser } from "@/server/auth/principal";
import { assertTransition, closureBlocked, closureChecklist, type ClosureFacts } from "@/lib/case-status";
import { computeCaseFinancials, budgetVsActual, type Pathway } from "@/lib/finance";

const ACTIVE_CRIMINAL = ["PREPARING", "REPORTED", "UNDER_POLICE_INVESTIGATION", "WITH_DPP", "CHARGED", "IN_COURT"] as const;
const ACTIVE_CIVIL = ["REFERRED", "DEMAND_ISSUED", "NEGOTIATION", "APPROVED_TO_SUE", "FILED", "IN_COURT", "JUDGMENT_OBTAINED", "EXECUTION"] as const;

async function lockCase(tx: Tx, caseId: string) {
  // Serialises concurrent workflow actions on the same case.
  await tx.$queryRaw`SELECT id FROM \`Case\` WHERE id = ${caseId} FOR UPDATE`;
  return tx.case.findUniqueOrThrow({ where: { id: caseId } });
}

export async function changeCaseStatus(user: CurrentUser, caseId: string, to: CaseStatus, reason: string | undefined) {
  await requireCaseAccess(user, caseId, "CASES", "EDIT");
  return prisma.$transaction(async (tx) => {
    const c = await lockCase(tx, caseId);
    assertTransition(c.status, to, "manual");
    const updated = await tx.case.update({ where: { id: caseId }, data: { status: to, version: { increment: 1 }, lastActivityAt: new Date() } });
    await tx.caseStatusHistory.create({ data: { caseId, fromStatus: c.status, toStatus: to, reason: reason ?? null, changedById: user.id } });
    await audit(
      { action: "cases.status_change", actorId: user.id, actorLabel: user.username, entityType: "case", entityId: caseId, caseId, reason, before: { status: c.status }, after: { status: to } },
      tx,
    );
    return updated;
  });
}

export async function closureFacts(db: Tx | typeof prisma, caseId: string, status: CaseStatus): Promise<ClosureFacts> {
  const live = { caseId, isDeleted: false };
  const [openTasks, openSubFiles, undecided, decided, pendingExpenses, unverified, advances, criminal, civil, pendingWriteOffs] = await Promise.all([
    db.task.count({ where: { ...live, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    db.subFile.count({ where: { ...live, status: { notIn: ["COMPLETED", "CLOSED"] } } }),
    db.finding.count({ where: { ...live, status: { in: ["SUBMITTED"] } } }),
    db.finding.count({ where: { ...live, status: "DECIDED" } }),
    db.expense.count({ where: { ...live, status: "SUBMITTED" } }),
    db.recovery.count({ where: { ...live, status: "RECORDED" } }),
    db.advance.count({ where: { ...live, status: { in: ["APPROVED", "ISSUED", "PARTLY_ACCOUNTED"] } } }),
    db.criminalMatter.count({ where: { ...live, status: { in: [...ACTIVE_CRIMINAL] } } }),
    db.civilMatter.count({ where: { ...live, status: { in: [...ACTIVE_CIVIL] } } }),
    db.writeOff.count({ where: { ...live, status: { in: ["FINANCE_REVIEW", "MANAGEMENT_APPROVAL", "BOARD_APPROVAL"] } } }),
  ]);
  return {
    status,
    openTasks,
    openSubFiles,
    undecidedFindings: undecided,
    decidedFindings: decided,
    pendingExpenses,
    unverifiedRecoveries: unverified,
    outstandingAdvances: advances,
    activeCriminalMatters: criminal,
    activeCivilMatters: civil,
    pendingWriteOffs,
  };
}

export async function closureCheck(user: CurrentUser, caseId: string) {
  const subject = await requireCaseAccess(user, caseId, "CASES", "VIEW");
  const checks = closureChecklist(await closureFacts(prisma, caseId, subject.status));
  return { checks, blocked: closureBlocked(checks) };
}

/** Closes a case after re-evaluating the checklist inside the transaction. Requires case approval rights. */
export async function closeCase(user: CurrentUser, caseId: string, input: { reason: string; summary: string }) {
  await requireCaseAccess(user, caseId, "CASES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    const c = await lockCase(tx, caseId);
    assertTransition(c.status, "CLOSED", "closure");
    const checks = closureChecklist(await closureFacts(tx, caseId, c.status));
    if (closureBlocked(checks)) {
      throw new ApiError(409, "INVALID_TRANSITION", "The case cannot be closed until the blocking checks pass.", { checks });
    }
    const now = new Date();
    const updated = await tx.case.update({
      where: { id: caseId },
      data: { status: "CLOSED", stage: "CONCLUDED", actualClosureDate: now, closureReason: input.reason, version: { increment: 1 }, lastActivityAt: now },
    });
    await tx.caseClosure.create({ data: { caseId, reason: input.reason, summary: input.summary, checklist: checks as unknown as Prisma.InputJsonValue, closedById: user.id } });
    await tx.caseStatusHistory.create({ data: { caseId, fromStatus: c.status, toStatus: "CLOSED", reason: input.reason, changedById: user.id } });
    await audit(
      {
        action: "cases.close",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "case",
        entityId: caseId,
        caseId,
        reason: input.reason,
        before: { status: c.status },
        after: { status: "CLOSED" },
      },
      tx,
    );
    return updated;
  });
}

export async function reopenCase(user: CurrentUser, caseId: string, input: { reason: string; newInformation: string }) {
  await requireCaseAccess(user, caseId, "CASES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    const c = await lockCase(tx, caseId);
    assertTransition(c.status, "REOPENED", "reopen");
    const updated = await tx.case.update({
      where: { id: caseId },
      data: { status: "REOPENED", stage: "EVIDENCE_GATHERING", actualClosureDate: null, version: { increment: 1 }, lastActivityAt: new Date() },
    });
    await tx.caseReopening.create({ data: { caseId, reason: input.reason, newInformation: input.newInformation, previousStatus: c.status, reopenedById: user.id } });
    await tx.caseStatusHistory.create({ data: { caseId, fromStatus: c.status, toStatus: "REOPENED", reason: input.reason, changedById: user.id } });
    await audit(
      {
        action: "cases.reopen",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "case",
        entityId: caseId,
        caseId,
        reason: input.reason,
        before: { status: c.status },
        after: { status: "REOPENED" },
      },
      tx,
    );
    return updated;
  });
}

export async function setCaseLegalHold(user: CurrentUser, caseId: string, on: boolean, reason: string) {
  await requireCaseAccess(user, caseId, "CASES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    const c = await lockCase(tx, caseId);
    if (c.legalHold === on) throw conflict(on ? "The case is already under legal hold." : "The case is not under legal hold.");
    const updated = await tx.case.update({ where: { id: caseId }, data: { legalHold: on, version: { increment: 1 } } });
    await audit(
      {
        action: on ? "cases.legal_hold.on" : "cases.legal_hold.off",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "case",
        entityId: caseId,
        caseId,
        reason,
        before: { legalHold: c.legalHold },
        after: { legalHold: on },
      },
      tx,
    );
    return updated;
  });
}

export async function listAssignments(user: CurrentUser, caseId: string) {
  await requireCaseAccess(user, caseId, "CASES", "VIEW");
  return prisma.caseAssignment.findMany({
    where: { caseId, active: true },
    include: { user: { select: { id: true, fullName: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function addAssignment(user: CurrentUser, caseId: string, input: { userId: string; role: CaseAssignmentRole }) {
  await requireCaseAccess(user, caseId, "CASES", "EDIT");
  const target = await prisma.user.findFirst({ where: { id: input.userId, status: "ACTIVE" } });
  if (!target) throw badRequest("User not found or inactive.");
  if (input.role === "EXTERNAL_ADVOCATE" && target.role !== "EXTERNAL_ADVOCATE_RESTRICTED") {
    throw badRequest("Only restricted external advocate accounts can hold the external advocate role.");
  }
  return prisma.$transaction(async (tx) => {
    const a = await tx.caseAssignment.upsert({
      where: { caseId_userId_role: { caseId, userId: input.userId, role: input.role } },
      update: { active: true, endedAt: null, assignedById: user.id },
      create: { caseId, userId: input.userId, role: input.role, assignedById: user.id },
    });
    await audit(
      { action: "cases.assignment.add", actorId: user.id, actorLabel: user.username, entityType: "caseAssignment", entityId: a.id, caseId, after: { userId: input.userId, role: input.role } },
      tx,
    );
    return a;
  });
}

export async function endAssignment(user: CurrentUser, caseId: string, assignmentId: string) {
  await requireCaseAccess(user, caseId, "CASES", "EDIT");
  return prisma.$transaction(async (tx) => {
    const a = await tx.caseAssignment.findFirst({ where: { id: assignmentId, caseId, active: true } });
    if (!a) throw badRequest("Assignment not found.");
    await tx.caseAssignment.update({ where: { id: a.id }, data: { active: false, endedAt: new Date() } });
    await audit({ action: "cases.assignment.end", actorId: user.id, actorLabel: user.username, entityType: "caseAssignment", entityId: a.id, caseId, before: { userId: a.userId, role: a.role } }, tx);
    return { ended: true };
  });
}

/** Everything the case overview needs in one round trip (grouped queries, no per-row lookups). */
export async function caseSummary(user: CurrentUser, caseId: string) {
  await requireCaseAccess(user, caseId, "CASES", "VIEW");
  const live = { caseId, isDeleted: false };
  const [c, expenses, recoveries, writeOffs, invoices, cheques, budgets, counts, history, reopenings, closures] = await Promise.all([
    prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        company: { select: { name: true } },
        branch: { select: { name: true } },
        leadInvestigator: { select: { id: true, fullName: true } },
        supervisingManager: { select: { id: true, fullName: true } },
      },
    }),
    prisma.expense.findMany({ where: live, select: { pathway: true, status: true, approvedAmount: true } }),
    prisma.recovery.findMany({ where: live, select: { status: true, grossAmount: true, recoveryCosts: true } }),
    prisma.writeOff.findMany({ where: live, select: { status: true, amount: true } }),
    prisma.invoice.findMany({ where: live, select: { classification: true, invoiceAmount: true, amountPaid: true } }),
    prisma.cheque.findMany({ where: live, select: { amount: true, status: true, dateDishonoured: true } }),
    prisma.budget.findMany({ where: live, select: { pathway: true, status: true, approvedAmount: true } }),
    Promise.all([
      prisma.subFile.count({ where: live }),
      prisma.party.count({ where: live }),
      prisma.invoice.count({ where: live }),
      prisma.cheque.count({ where: live }),
      prisma.interview.count({ where: live }),
      prisma.evidence.count({ where: live }),
      prisma.workLog.count({ where: live }),
      prisma.task.count({ where: { ...live, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
      prisma.task.count({ where: { ...live, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: new Date() } } }),
      prisma.criminalMatter.count({ where: live }),
      prisma.civilMatter.count({ where: live }),
      prisma.financialStatement.count({ where: live }),
    ]),
    prisma.caseStatusHistory.findMany({ where: { caseId }, orderBy: { changedAt: "desc" }, take: 30 }),
    prisma.caseReopening.findMany({ where: { caseId }, orderBy: { reopenedAt: "desc" } }),
    prisma.caseClosure.findMany({ where: { caseId }, orderBy: { closedAt: "desc" } }),
  ]);
  const typedExpenses = expenses.map((e) => ({ ...e, pathway: e.pathway as Pathway }));
  const financials = computeCaseFinancials({ exposure: c, expenses: typedExpenses, recoveries, writeOffs, invoices, cheques });
  const budget = budgetVsActual(
    budgets.map((b) => ({ ...b, pathway: b.pathway as Pathway })),
    typedExpenses,
    recoveries,
  );
  const [subFiles, parties, invoiceCount, chequeCount, interviews, evidence, workLogs, openTasks, overdueTasks, criminal, civil, statements] = counts;
  const userIds = [...new Set([...history.map((h) => h.changedById), ...reopenings.map((r) => r.reopenedById), ...closures.map((x) => x.closedById)])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
  const names = Object.fromEntries(users.map((u) => [u.id, u.fullName]));
  return {
    case: c,
    financials,
    budget,
    counts: { subFiles, parties, invoices: invoiceCount, cheques: chequeCount, interviews, evidence, workLogs, openTasks, overdueTasks, criminal, civil, statements },
    history: history.map((h) => ({ ...h, changedBy: names[h.changedById] ?? "Unknown" })),
    reopenings: reopenings.map((r) => ({ ...r, reopenedBy: names[r.reopenedById] ?? "Unknown" })),
    closures: closures.map((x) => ({ ...x, closedBy: names[x.closedById] ?? "Unknown" })),
  };
}
