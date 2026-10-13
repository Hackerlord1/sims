import "server-only";
import type { DecisionOutcome, RecommendationType, TaskCategory, Priority } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { requireCaseAccess } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import type { CurrentUser } from "@/server/auth/principal";
import { nextCaseReference } from "@/server/references";
import { assertMakerChecker } from "@/lib/permissions";
import { money, toDbString } from "@/lib/money";

function invalid(message: string): never {
  throw new ApiError(409, "INVALID_TRANSITION", message);
}

async function caseOf<T extends { caseId: string; isDeleted: boolean }>(row: T | null, what: string): Promise<T> {
  if (!row || row.isDeleted) throw notFound(what);
  return row;
}

// ───────────────────── Findings, recommendations, decisions ─────────────────────

export async function findingDetail(user: CurrentUser, id: string) {
  const f = await caseOf(await prisma.finding.findUnique({ where: { id }, include: { recommendations: { orderBy: { createdAt: "asc" } }, decisions: { orderBy: { createdAt: "desc" } } } }), "Finding");
  await requireCaseAccess(user, f.caseId, "FINDINGS", "VIEW");
  const approvers = await prisma.user.findMany({ where: { id: { in: f.decisions.map((d) => d.approverId) } }, select: { id: true, fullName: true } });
  const names = Object.fromEntries(approvers.map((u) => [u.id, u.fullName]));
  return { recommendations: f.recommendations, decisions: f.decisions.map((d) => ({ ...d, approver: names[d.approverId] ?? "Unknown" })) };
}

export async function setRecommendations(user: CurrentUser, id: string, items: { type: RecommendationType; details?: string | null }[]) {
  const f = await caseOf(await prisma.finding.findUnique({ where: { id } }), "Finding");
  await requireCaseAccess(user, f.caseId, "FINDINGS", "EDIT");
  if (!["DRAFT", "RETURNED"].includes(f.status)) invalid("Recommendations can only change while the finding is a draft or returned.");
  const types = new Set(items.map((i) => i.type));
  if (types.size !== items.length) throw badRequest("Each recommendation type can appear only once.");
  return prisma.$transaction(async (tx) => {
    const before = await tx.recommendation.findMany({ where: { findingId: id } });
    await tx.recommendation.deleteMany({ where: { findingId: id } });
    await tx.recommendation.createMany({ data: items.map((i) => ({ findingId: id, type: i.type, details: i.details ?? null, createdById: user.id })) });
    await audit(
      {
        action: "findings.recommendations",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "finding",
        entityId: id,
        caseId: f.caseId,
        before: { types: before.map((b) => b.type).join(", ") },
        after: { types: items.map((i) => i.type).join(", ") },
      },
      tx,
    );
    return tx.recommendation.findMany({ where: { findingId: id } });
  });
}

export async function submitFinding(user: CurrentUser, id: string) {
  const f = await caseOf(await prisma.finding.findUnique({ where: { id }, include: { recommendations: true } }), "Finding");
  await requireCaseAccess(user, f.caseId, "FINDINGS", "EDIT");
  if (!["DRAFT", "RETURNED"].includes(f.status)) invalid("Only draft or returned findings can be submitted.");
  if (!f.investigatorConclusion?.trim()) throw badRequest("Record the investigator conclusion before submitting.");
  if (!f.recommendations.length) throw badRequest("Add at least one recommendation before submitting.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.finding.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), version: { increment: 1 } } });
    const c = await tx.case.findUniqueOrThrow({ where: { id: f.caseId } });
    if (!["CLOSED", "DRAFT"].includes(c.status) && c.status !== "AWAITING_MANAGEMENT_DECISION") {
      await tx.case.update({ where: { id: c.id }, data: { status: "AWAITING_MANAGEMENT_DECISION", lastActivityAt: new Date() } });
      await tx.caseStatusHistory.create({ data: { caseId: c.id, fromStatus: c.status, toStatus: "AWAITING_MANAGEMENT_DECISION", reason: "Findings submitted for decision", changedById: user.id } });
    }
    await audit(
      { action: "findings.submit", actorId: user.id, actorLabel: user.username, entityType: "finding", entityId: id, caseId: f.caseId, before: { status: f.status }, after: { status: "SUBMITTED" } },
      tx,
    );
    return updated;
  });
}

/**
 * Management decision on a submitted finding. The approver must not be the author. Approved
 * recommendations are marked; criminal and civil action may be approved together.
 */
export async function decideFinding(
  user: CurrentUser,
  id: string,
  input: { outcome: DecisionOutcome; decisionDate: Date; conditions?: string | null; comments?: string | null; approvedTypes: RecommendationType[] },
) {
  const f = await caseOf(await prisma.finding.findUnique({ where: { id }, include: { recommendations: true } }), "Finding");
  await requireCaseAccess(user, f.caseId, "DECISIONS", "APPROVE");
  if (f.status !== "SUBMITTED") invalid("Only submitted findings can receive a management decision.");
  assertMakerChecker(f.createdById, user.id);
  if (input.outcome === "APPROVED_WITH_CONDITIONS" && !input.conditions?.trim()) throw badRequest("State the conditions of approval.");
  if ((input.outcome === "REJECTED" || input.outcome === "RETURNED_FOR_MORE_WORK") && !input.comments?.trim()) throw badRequest("Explain the decision.");
  const known = new Set(f.recommendations.map((r) => r.type));
  if (input.approvedTypes.some((t) => !known.has(t))) throw badRequest("Only recommendations on this finding can be approved.");

  return prisma.$transaction(async (tx) => {
    const approving = input.outcome === "APPROVED" || input.outcome === "APPROVED_WITH_CONDITIONS";
    for (const r of f.recommendations) {
      await tx.recommendation.update({ where: { id: r.id }, data: { approved: approving ? input.approvedTypes.includes(r.type) : false } });
    }
    const decision = await tx.managementDecision.create({
      data: { findingId: id, outcome: input.outcome, approverId: user.id, decisionDate: input.decisionDate, conditions: input.conditions ?? null, comments: input.comments ?? null },
    });
    const status = input.outcome === "RETURNED_FOR_MORE_WORK" ? "RETURNED" : "DECIDED";
    await tx.finding.update({ where: { id }, data: { status, version: { increment: 1 } } });
    await tx.case.update({ where: { id: f.caseId }, data: { lastActivityAt: new Date() } });
    await audit(
      {
        action: "findings.decision",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "finding",
        entityId: id,
        caseId: f.caseId,
        reason: input.comments ?? input.conditions ?? null,
        before: { status: f.status },
        after: { status, outcome: input.outcome, approved: input.approvedTypes.join(", ") },
      },
      tx,
    );
    return decision;
  });
}

// ───────────────────── Work-done log ─────────────────────

export async function taskFromWorkLog(
  user: CurrentUser,
  workLogId: string,
  input: { title?: string; assigneeId?: string | null; dueDate?: Date | null; category?: TaskCategory; priority?: Priority },
) {
  const w = await caseOf(await prisma.workLog.findUnique({ where: { id: workLogId } }), "Work-done entry");
  const subject = await requireCaseAccess(user, w.caseId, "TASKS", "CREATE");
  if (subject.status === "CLOSED") invalid("This case is closed. Reopen it before adding tasks.");
  const title = (input.title ?? w.nextTask ?? "").trim();
  if (!title) throw badRequest("Enter a task title (or record the next task on the work-done entry).");
  const assigneeId = input.assigneeId ?? w.responsibleOfficerId ?? null;
  if (assigneeId && !(await prisma.user.findFirst({ where: { id: assigneeId, status: "ACTIVE" } }))) throw badRequest("Assignee not found or inactive.");
  return prisma.$transaction(async (tx) => {
    const { reference } = await nextCaseReference(tx, "task", subject);
    const task = await tx.task.create({
      data: {
        reference,
        caseId: w.caseId,
        subFileId: w.subFileId,
        title: title.slice(0, 300),
        description: `Follow-up from work-done entry of ${w.occurredAt.toISOString().slice(0, 10)}: ${w.workPerformed.slice(0, 500)}`,
        category: input.category ?? "GENERAL",
        priority: input.priority ?? "MEDIUM",
        assigneeId,
        dueDate: input.dueDate ?? w.dueDate,
        sourceWorkLogId: w.id,
        createdById: user.id,
      },
    });
    await tx.case.update({ where: { id: w.caseId }, data: { lastActivityAt: new Date() } });
    await audit({ action: "tasks.create_from_work_log", actorId: user.id, actorLabel: user.username, entityType: "task", entityId: task.id, caseId: w.caseId, after: task }, tx);
    return task;
  });
}

export async function reviewWorkLog(user: CurrentUser, workLogId: string, input: { status: "REVIEWED" | "RETURNED"; comment: string }) {
  const w = await caseOf(await prisma.workLog.findUnique({ where: { id: workLogId } }), "Work-done entry");
  await requireCaseAccess(user, w.caseId, "WORK_LOGS", "EDIT");
  assertMakerChecker(w.investigatorId, user.id);
  if (!input.comment.trim()) throw badRequest("Enter review comments.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.workLog.update({
      where: { id: workLogId },
      data: { supervisorStatus: input.status, supervisorReview: input.comment, supervisorId: user.id, supervisorReviewedAt: new Date(), version: { increment: 1 } },
    });
    await audit(
      {
        action: "work-logs.review",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "workLog",
        entityId: workLogId,
        caseId: w.caseId,
        before: { supervisorStatus: w.supervisorStatus },
        after: { supervisorStatus: input.status },
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────── Cheque ↔ invoice links ─────────────────────

export async function chequeInvoices(user: CurrentUser, chequeId: string) {
  const ch = await caseOf(await prisma.cheque.findUnique({ where: { id: chequeId } }), "Cheque");
  await requireCaseAccess(user, ch.caseId, "CHEQUES", "VIEW");
  const links = await prisma.chequeInvoice.findMany({
    where: { chequeId },
    include: { invoice: { select: { id: true, invoiceNumber: true, customerName: true, invoiceAmount: true, amountPaid: true, isDeleted: true } } },
  });
  return links.filter((l) => !l.invoice.isDeleted);
}

export async function setChequeInvoices(user: CurrentUser, chequeId: string, links: { invoiceId: string; amount: string }[]) {
  const ch = await caseOf(await prisma.cheque.findUnique({ where: { id: chequeId } }), "Cheque");
  const subject = await requireCaseAccess(user, ch.caseId, "CHEQUES", "EDIT");
  if (subject.status === "CLOSED") invalid("This case is closed.");
  const ids = links.map((l) => l.invoiceId);
  if (new Set(ids).size !== ids.length) throw badRequest("An invoice can be linked only once.");
  const invoices = await prisma.invoice.findMany({ where: { id: { in: ids }, caseId: ch.caseId, isDeleted: false }, select: { id: true } });
  if (invoices.length !== ids.length) throw badRequest("Every linked invoice must belong to this case.");
  for (const l of links) if (money(l.amount).isNegative()) throw badRequest("Allocated amounts cannot be negative.");
  return prisma.$transaction(async (tx) => {
    const before = await tx.chequeInvoice.findMany({ where: { chequeId } });
    await tx.chequeInvoice.deleteMany({ where: { chequeId } });
    if (links.length) await tx.chequeInvoice.createMany({ data: links.map((l) => ({ chequeId, invoiceId: l.invoiceId, amount: toDbString(l.amount) })) });
    await tx.case.update({ where: { id: ch.caseId }, data: { lastActivityAt: new Date() } });
    await audit(
      {
        action: "cheques.link_invoices",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "cheque",
        entityId: chequeId,
        caseId: ch.caseId,
        before: { invoices: before.length },
        after: { invoices: links.length },
      },
      tx,
    );
    return { linked: links.length };
  });
}
