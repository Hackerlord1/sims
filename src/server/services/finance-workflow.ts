import "server-only";
import { prisma, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { requireCaseAccess } from "@/server/authz";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import type { CurrentUser } from "@/server/auth/principal";
import { getSetting } from "@/server/services/settings";
import { advancePosition, approvalSplit, COUNTED_EXPENSE_STATUSES } from "@/lib/finance";
import { assertMakerChecker, type Action, type Module } from "@/lib/permissions";
import { money, sum, toDbString } from "@/lib/money";

function invalid(message: string): never {
  throw new ApiError(409, "INVALID_TRANSITION", message);
}

type LockedTable = "Expense" | "Budget" | "Advance" | "Recovery" | "WriteOff";

async function lockRow(tx: Tx, table: LockedTable, id: string) {
  // Row lock so two approvers cannot act on the same record at once. The table name is a fixed
  // literal from the type above (never user input); the id is a bound parameter.
  await tx.$queryRawUnsafe(`SELECT id FROM \`${table}\` WHERE id = ? FOR UPDATE`, id);
}

async function guard(user: CurrentUser, model: "expense" | "advance" | "budget" | "recovery" | "writeOff", id: string, module: Module, action: Action) {
  const delegate = prisma[model] as unknown as { findFirst(args: unknown): Promise<{ caseId: string; isDeleted: boolean } | null> };
  const row = await delegate.findFirst({ where: { id, isDeleted: false }, select: { caseId: true, isDeleted: true } });
  if (!row) throw notFound();
  const subject = await requireCaseAccess(user, row.caseId, module, action);
  if (subject.status === "CLOSED") invalid("This case is closed. Reopen it before changing its records.");
  return row.caseId;
}

const log = (tx: Tx, user: CurrentUser, action: string, entityType: string, entityId: string, caseId: string, before: object, after: object, reason?: string | null) =>
  audit(
    { action, actorId: user.id, actorLabel: user.username, entityType, entityId, caseId, before: before as Record<string, unknown>, after: after as Record<string, unknown>, reason: reason ?? null },
    tx,
  );

// ───────────────────── Expenses ─────────────────────

export async function submitExpense(user: CurrentUser, id: string) {
  const caseId = await guard(user, "expense", id, "EXPENSES", "EDIT");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Expense", id);
    const e = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (e.status !== "DRAFT") invalid("Only draft expenses can be submitted.");
    const updated = await tx.expense.update({ where: { id }, data: { status: "SUBMITTED", version: { increment: 1 } } });
    await log(tx, user, "expenses.submit", "expense", id, caseId, { status: e.status }, { status: updated.status });
    return updated;
  });
}

export async function decideExpense(user: CurrentUser, id: string, input: { approvedAmount: string; comment?: string }) {
  const caseId = await guard(user, "expense", id, "EXPENSES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Expense", id);
    const e = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (e.status !== "SUBMITTED") invalid("Only submitted expenses can be approved or rejected.");
    assertMakerChecker(e.createdById, user.id);
    assertMakerChecker(e.employeeId, user.id);
    let split;
    try {
      split = approvalSplit(e.requestedAmount, input.approvedAmount);
    } catch (err) {
      throw badRequest((err as Error).message);
    }
    if (split.status !== "APPROVED" && !input.comment?.trim()) throw badRequest("A comment is required when an expense is reduced or rejected.");
    const updated = await tx.expense.update({
      where: { id },
      data: {
        status: split.status,
        approvedAmount: toDbString(split.approvedAmount),
        rejectedAmount: toDbString(split.rejectedAmount),
        approverId: user.id,
        approvedAt: new Date(),
        approvalComment: input.comment ?? null,
        version: { increment: 1 },
      },
    });
    await log(
      tx,
      user,
      split.status === "REJECTED" ? "expenses.reject" : "expenses.approve",
      "expense",
      id,
      caseId,
      { status: e.status, approvedAmount: e.approvedAmount },
      { status: updated.status, approvedAmount: updated.approvedAmount },
      input.comment,
    );
    return updated;
  });
}

export async function payExpense(user: CurrentUser, id: string, input: { paidAmount: string; paymentReference: string }) {
  const caseId = await guard(user, "expense", id, "EXPENSES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Expense", id);
    const e = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(e.status)) invalid("Only approved expenses can be paid.");
    const paid = money(input.paidAmount);
    if (paid.lessThanOrEqualTo(0) || paid.greaterThan(e.approvedAmount.toString())) throw badRequest("The paid amount must be more than zero and not exceed the approved amount.");
    const receipts = await tx.evidence.count({ where: { linkType: "EXPENSE", linkId: id, isDeleted: false } });
    const updated = await tx.expense.update({
      where: { id },
      data: { status: receipts ? "PAID" : "AWAITING_RECEIPT", paidAmount: toDbString(paid), paymentReference: input.paymentReference, version: { increment: 1 } },
    });
    await log(tx, user, "expenses.pay", "expense", id, caseId, { status: e.status, paidAmount: e.paidAmount }, { status: updated.status, paidAmount: updated.paidAmount });
    return updated;
  });
}

export async function accountExpense(user: CurrentUser, id: string) {
  const caseId = await guard(user, "expense", id, "EXPENSES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Expense", id);
    const e = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (!["PAID", "AWAITING_RECEIPT"].includes(e.status)) invalid("Only paid expenses can be marked as accounted for.");
    const receipts = await tx.evidence.count({ where: { linkType: "EXPENSE", linkId: id, isDeleted: false } });
    if (!receipts) throw badRequest("Upload the receipt or invoice before marking the expense as accounted for.");
    const updated = await tx.expense.update({ where: { id }, data: { status: "ACCOUNTED_FOR", version: { increment: 1 } } });
    await log(tx, user, "expenses.account", "expense", id, caseId, { status: e.status }, { status: updated.status });
    return updated;
  });
}

export async function closeExpense(user: CurrentUser, id: string) {
  const caseId = await guard(user, "expense", id, "EXPENSES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Expense", id);
    const e = await tx.expense.findUniqueOrThrow({ where: { id } });
    if (!["ACCOUNTED_FOR", "REJECTED"].includes(e.status)) invalid("Only accounted-for or rejected expenses can be closed.");
    const updated = await tx.expense.update({ where: { id }, data: { status: "CLOSED", version: { increment: 1 } } });
    await log(tx, user, "expenses.close", "expense", id, caseId, { status: e.status }, { status: updated.status });
    return updated;
  });
}

// ───────────────────── Budgets ─────────────────────

export async function approveBudget(user: CurrentUser, id: string, comment?: string) {
  const caseId = await guard(user, "budget", id, "BUDGETS", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Budget", id);
    const b = await tx.budget.findUniqueOrThrow({ where: { id } });
    if (b.status === "APPROVED") invalid("This budget line is already approved.");
    assertMakerChecker(b.createdById, user.id);
    const updated = await tx.budget.update({ where: { id }, data: { status: "APPROVED", approverId: user.id, approvedAt: new Date(), version: { increment: 1 } } });
    await log(tx, user, "budgets.approve", "budget", id, caseId, { status: b.status }, { status: "APPROVED", approvedAmount: b.approvedAmount }, comment);
    return updated;
  });
}

// ───────────────────── Advances and imprests ─────────────────────

async function advanceSpent(tx: Tx, advanceId: string) {
  const expenses = await tx.expense.findMany({ where: { advanceId, isDeleted: false }, select: { status: true, approvedAmount: true } });
  return sum(expenses.filter((e) => COUNTED_EXPENSE_STATUSES.has(e.status)).map((e) => e.approvedAmount));
}

export async function decideAdvance(user: CurrentUser, id: string, input: { approve: boolean; amountApproved?: string; comment?: string }) {
  const caseId = await guard(user, "advance", id, "ADVANCES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Advance", id);
    const a = await tx.advance.findUniqueOrThrow({ where: { id } });
    if (a.status !== "REQUESTED") invalid("Only requested advances can be approved or rejected.");
    assertMakerChecker(a.createdById, user.id);
    assertMakerChecker(a.employeeId, user.id);
    let data;
    if (input.approve) {
      const amount = money(input.amountApproved ?? a.amountRequested.toString());
      if (amount.lessThanOrEqualTo(0) || amount.greaterThan(a.amountRequested.toString())) throw badRequest("The approved amount must be more than zero and not exceed the amount requested.");
      data = { status: "APPROVED" as const, amountApproved: toDbString(amount), approverId: user.id, approvedAt: new Date() };
    } else {
      if (!input.comment?.trim()) throw badRequest("A reason is required to reject an advance.");
      data = { status: "REJECTED" as const, approverId: user.id, approvedAt: new Date() };
    }
    const updated = await tx.advance.update({
      where: { id },
      data: { ...data, notes: input.comment ? `${a.notes ? a.notes + "\n" : ""}Decision: ${input.comment}` : a.notes, version: { increment: 1 } },
    });
    await log(
      tx,
      user,
      input.approve ? "advances.approve" : "advances.reject",
      "advance",
      id,
      caseId,
      { status: a.status },
      { status: updated.status, amountApproved: updated.amountApproved },
      input.comment,
    );
    return updated;
  });
}

export async function issueAdvance(user: CurrentUser, id: string, input: { amountIssued: string; accountingDeadline: Date }) {
  const caseId = await guard(user, "advance", id, "ADVANCES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Advance", id);
    const a = await tx.advance.findUniqueOrThrow({ where: { id } });
    if (a.status !== "APPROVED") invalid("Only approved advances can be issued.");
    const amount = money(input.amountIssued);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(a.amountApproved.toString())) throw badRequest("The issued amount must be more than zero and not exceed the approved amount.");
    const updated = await tx.advance.update({
      where: { id },
      data: { status: "ISSUED", amountIssued: toDbString(amount), issuedAt: new Date(), accountingDeadline: input.accountingDeadline, version: { increment: 1 } },
    });
    await log(tx, user, "advances.issue", "advance", id, caseId, { status: a.status }, { status: updated.status, amountIssued: updated.amountIssued });
    return updated;
  });
}

/** Records returned cash and settles the advance against accounted expenses. */
export async function accountAdvance(user: CurrentUser, id: string, input: { amountReturned: string }) {
  const caseId = await guard(user, "advance", id, "ADVANCES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Advance", id);
    const a = await tx.advance.findUniqueOrThrow({ where: { id } });
    if (!["ISSUED", "PARTLY_ACCOUNTED"].includes(a.status)) invalid("Only issued advances can be accounted for.");
    const returned = money(input.amountReturned);
    if (returned.isNegative() || returned.greaterThan(a.amountIssued.toString())) throw badRequest("The returned amount cannot be negative or exceed the amount issued.");
    const spent = await advanceSpent(tx, id);
    const pos = advancePosition({ amountIssued: a.amountIssued, amountReturned: returned, actualExpenditure: spent });
    const status = pos.outstandingBalance.isZero() ? "ACCOUNTED" : "PARTLY_ACCOUNTED";
    const updated = await tx.advance.update({
      where: { id },
      data: { status, amountReturned: toDbString(returned), accountingDate: status === "ACCOUNTED" ? new Date() : null, version: { increment: 1 } },
    });
    await log(
      tx,
      user,
      "advances.account",
      "advance",
      id,
      caseId,
      { status: a.status, amountReturned: a.amountReturned },
      { status, amountReturned: updated.amountReturned, actualExpenditure: toDbString(spent) },
    );
    return {
      ...updated,
      position: { actualExpenditure: toDbString(pos.actualExpenditure), outstandingBalance: toDbString(pos.outstandingBalance), additionalAmountDue: toDbString(pos.additionalAmountDue) },
    };
  });
}

export async function closeAdvance(user: CurrentUser, id: string) {
  const caseId = await guard(user, "advance", id, "ADVANCES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Advance", id);
    const a = await tx.advance.findUniqueOrThrow({ where: { id } });
    if (!["ACCOUNTED", "REJECTED"].includes(a.status)) invalid("Only fully accounted or rejected advances can be closed.");
    const updated = await tx.advance.update({ where: { id }, data: { status: "CLOSED", version: { increment: 1 } } });
    await log(tx, user, "advances.close", "advance", id, caseId, { status: a.status }, { status: "CLOSED" });
    return updated;
  });
}

// ───────────────────── Recoveries ─────────────────────

/** Verifies a recovery and posts it to the linked invoice and cheque in one transaction. */
export async function verifyRecovery(user: CurrentUser, id: string) {
  const caseId = await guard(user, "recovery", id, "RECOVERIES", "APPROVE");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Recovery", id);
    await tx.$queryRaw`SELECT id FROM \`Case\` WHERE id = ${caseId} FOR UPDATE`;
    const r = await tx.recovery.findUniqueOrThrow({ where: { id } });
    if (r.status !== "RECORDED") invalid("Only unverified recoveries can be verified.");
    assertMakerChecker(r.recordedById, user.id);
    const evidence = await tx.evidence.count({ where: { linkType: "RECOVERY", linkId: id, isDeleted: false } });
    if (!evidence && !r.receiptNumber && !r.paymentReference) {
      throw badRequest("Add a receipt number, a payment reference or supporting evidence before verifying.");
    }
    const c = await tx.case.findUniqueOrThrow({ where: { id: caseId }, select: { amountConfirmedRecoverable: true } });
    const verified = await tx.recovery.aggregate({ where: { caseId, status: "VERIFIED", isDeleted: false }, _sum: { grossAmount: true } });
    const totalAfter = money(verified._sum.grossAmount).plus(r.grossAmount.toString());
    const remaining = money(c.amountConfirmedRecoverable).minus(totalAfter);

    if (r.invoiceId) {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id: r.invoiceId } });
      const paid = money(inv.amountPaid).plus(r.grossAmount.toString());
      const fully = paid.greaterThanOrEqualTo(inv.invoiceAmount.toString());
      await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: toDbString(paid), recoveryStatus: fully ? "RECOVERED" : "PARTLY_RECOVERED", version: { increment: 1 } } });
    }
    if (r.chequeId) {
      const ch = await tx.cheque.findUniqueOrThrow({ where: { id: r.chequeId } });
      const recovered = await tx.recovery.aggregate({ where: { chequeId: ch.id, status: "VERIFIED", isDeleted: false }, _sum: { grossAmount: true } });
      const chequeTotal = money(recovered._sum.grossAmount).plus(r.grossAmount.toString());
      if (chequeTotal.greaterThanOrEqualTo(ch.amount.toString())) await tx.cheque.update({ where: { id: ch.id }, data: { status: "RECOVERED", version: { increment: 1 } } });
    }
    const updated = await tx.recovery.update({
      where: { id },
      data: { status: "VERIFIED", verifiedById: user.id, verifiedAt: new Date(), remainingBalance: toDbString(remaining), version: { increment: 1 } },
    });
    await tx.case.update({ where: { id: caseId }, data: { lastActivityAt: new Date() } });
    await log(tx, user, "recoveries.verify", "recovery", id, caseId, { status: r.status }, { status: "VERIFIED", grossAmount: r.grossAmount, remainingBalance: toDbString(remaining) });
    return updated;
  });
}

export async function rejectRecovery(user: CurrentUser, id: string, reason: string) {
  const caseId = await guard(user, "recovery", id, "RECOVERIES", "APPROVE");
  if (!reason.trim()) throw badRequest("A reason is required.");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "Recovery", id);
    const r = await tx.recovery.findUniqueOrThrow({ where: { id } });
    if (r.status !== "RECORDED") invalid("Only unverified recoveries can be rejected.");
    assertMakerChecker(r.recordedById, user.id);
    const updated = await tx.recovery.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason, verifiedById: user.id, verifiedAt: new Date(), version: { increment: 1 } } });
    await log(tx, user, "recoveries.reject", "recovery", id, caseId, { status: r.status }, { status: "REJECTED" }, reason);
    return updated;
  });
}

// ───────────────────── Write-offs ─────────────────────

export type WriteOffStep = "submit" | "finance_review" | "management_approval" | "board_approval" | "reject" | "record_accounting" | "close";

export async function advanceWriteOff(
  user: CurrentUser,
  id: string,
  step: WriteOffStep,
  input: { notes?: string; boardApprovalReference?: string; boardApprovalDate?: Date; accountingEntryReference?: string },
) {
  const needsApprove = step !== "submit";
  const caseId = await guard(user, "writeOff", id, "WRITE_OFFS", needsApprove ? "APPROVE" : "EDIT");
  const threshold = await getSetting("writeOff.boardThreshold");
  return prisma.$transaction(async (tx) => {
    await lockRow(tx, "WriteOff", id);
    const w = await tx.writeOff.findUniqueOrThrow({ where: { id } });
    const isFinance = user.role === "FINANCE_REVIEWER" || user.role === "SYSTEM_ADMIN";
    const isManagement = user.role === "MANAGEMENT_APPROVER" || user.role === "SYSTEM_ADMIN";
    let data: Record<string, unknown>;
    switch (step) {
      case "submit":
        if (w.status !== "DRAFT") invalid("Only draft write-offs can be submitted.");
        data = { status: "FINANCE_REVIEW", boardApprovalRequired: money(w.amount).greaterThanOrEqualTo(threshold) };
        break;
      case "finance_review":
        if (w.status !== "FINANCE_REVIEW") invalid("This write-off is not awaiting finance review.");
        if (!isFinance) throw new ApiError(403, "FORBIDDEN", "Finance review must be completed by a finance reviewer.");
        assertMakerChecker(w.createdById, user.id);
        data = { status: "MANAGEMENT_APPROVAL", financeReviewById: user.id, financeReviewAt: new Date(), financeReviewNotes: input.notes ?? null };
        break;
      case "management_approval":
        if (w.status !== "MANAGEMENT_APPROVAL") invalid("This write-off is not awaiting management approval.");
        if (!isManagement) throw new ApiError(403, "FORBIDDEN", "Management approval must be given by a management approver.");
        assertMakerChecker(w.createdById, user.id);
        assertMakerChecker(w.financeReviewById, user.id);
        data = { status: w.boardApprovalRequired ? "BOARD_APPROVAL" : "APPROVED", managementApprovalById: user.id, managementApprovalAt: new Date() };
        break;
      case "board_approval":
        if (w.status !== "BOARD_APPROVAL") invalid("This write-off is not awaiting board approval.");
        if (!isManagement) throw new ApiError(403, "FORBIDDEN", "Board approval is recorded by a management approver.");
        if (!input.boardApprovalReference?.trim() || !input.boardApprovalDate) throw badRequest("Enter the board resolution reference and date.");
        data = { status: "APPROVED", boardApprovalReference: input.boardApprovalReference, boardApprovalDate: input.boardApprovalDate };
        break;
      case "reject":
        if (!["FINANCE_REVIEW", "MANAGEMENT_APPROVAL", "BOARD_APPROVAL"].includes(w.status)) invalid("Only write-offs in approval can be rejected.");
        if (!input.notes?.trim()) throw badRequest("A reason is required to reject a write-off.");
        assertMakerChecker(w.createdById, user.id);
        data = { status: "REJECTED" };
        break;
      case "record_accounting":
        if (w.status !== "APPROVED") invalid("Only approved write-offs can be posted to the ledger.");
        if (!isFinance) throw new ApiError(403, "FORBIDDEN", "Only finance can record the accounting entry.");
        if (!input.accountingEntryReference?.trim()) throw badRequest("Enter the accounting-entry reference.");
        data = { accountingEntryReference: input.accountingEntryReference };
        break;
      case "close":
        if (w.status !== "APPROVED") invalid("Only approved write-offs can be closed.");
        if (!w.accountingEntryReference) throw badRequest("Record the accounting entry before closing the write-off.");
        data = { status: "CLOSED", closedAt: new Date() };
        break;
    }
    const updated = await tx.writeOff.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    await log(tx, user, `write-offs.${step}`, "writeOff", id, caseId, { status: w.status }, { status: updated.status }, input.notes);
    return updated;
  });
}
