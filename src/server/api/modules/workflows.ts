import "server-only";
import { z } from "zod";
import { idParam, type Router } from "@/server/api/router";
import * as cases from "@/server/services/case-workflow";
import * as finance from "@/server/services/finance-workflow";
import * as records from "@/server/services/case-records";
import { ENUMS } from "@/lib/enums";
import { parseDateInput } from "@/lib/resources/schema";
import { isMoneyText, toDbString } from "@/lib/money";

const moneyText = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).replace(/[,\s]/g, ""))
  .refine((v) => isMoneyText(v) && !v.startsWith("-"), "Enter a valid non-negative amount.")
  .transform((v) => toDbString(v));
const dateInput = z.unknown().transform((v, ctx) => {
  const d = parseDateInput(v);
  if (!d) {
    ctx.addIssue({ code: "custom", message: "Enter a valid date." });
    return z.NEVER;
  }
  return d;
});
const reason = z.string().trim().min(3, "Enter a reason.").max(2000);
const optionalText = z.string().trim().max(2000).optional();

export function registerWorkflows(router: Router) {
  // ── Cases
  router.add({
    method: "GET",
    path: "/cases/:id/summary",
    summary: "Case overview: financial exposure, costs, recovery ratios, counts and status history",
    tags: ["Cases"],
    handler: ({ user, params }) => cases.caseSummary(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/cases/:id/status",
    summary: "Change the case status along the permitted transitions",
    tags: ["Cases"],
    body: z.object({ status: z.enum(ENUMS.CaseStatus), reason: z.string().trim().max(2000).optional() }),
    handler: ({ user, params, body }) => cases.changeCaseStatus(user, idParam(params), body.status, body.reason),
  });
  router.add({
    method: "GET",
    path: "/cases/:id/closure-check",
    summary: "Closure checklist (blocking checks and warnings)",
    tags: ["Cases"],
    handler: ({ user, params }) => cases.closureCheck(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/cases/:id/close",
    summary: "Close a case (transactional; blocked while work is outstanding)",
    tags: ["Cases"],
    body: z.object({ reason, summary: z.string().trim().min(10, "Write a closure summary of at least 10 characters.").max(20000) }),
    handler: ({ user, params, body }) => cases.closeCase(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/cases/:id/reopen",
    summary: "Reopen a closed case with the new information that justifies it",
    tags: ["Cases"],
    body: z.object({ reason, newInformation: z.string().trim().min(10, "Describe the new information.").max(20000) }),
    handler: ({ user, params, body }) => cases.reopenCase(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/cases/:id/legal-hold",
    summary: "Place or release a legal hold on the case",
    tags: ["Cases"],
    body: z.object({ on: z.boolean(), reason }),
    handler: ({ user, params, body }) => cases.setCaseLegalHold(user, idParam(params), body.on, body.reason),
  });
  router.add({
    method: "GET",
    path: "/cases/:id/assignments",
    summary: "Case team (supporting investigators, reviewers, legal, HR, finance, advocates)",
    tags: ["Cases"],
    handler: ({ user, params }) => cases.listAssignments(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/cases/:id/assignments",
    summary: "Add a team member to the case",
    tags: ["Cases"],
    body: z.object({ userId: z.string().min(1).max(64), role: z.enum(ENUMS.CaseAssignmentRole) }),
    handler: ({ user, params, body }) => cases.addAssignment(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/cases/:id/assignments/:assignmentId/end",
    summary: "Remove a team member from the case",
    tags: ["Cases"],
    handler: ({ user, params }) => cases.endAssignment(user, idParam(params), idParam(params, "assignmentId")),
  });

  // ── Expenses
  router.add({
    method: "POST",
    path: "/expenses/:id/submit",
    summary: "Submit a draft expense for approval",
    tags: ["Expenses"],
    handler: ({ user, params }) => finance.submitExpense(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/expenses/:id/decision",
    summary: "Approve in full, approve in part or reject (approved amount 0) a submitted expense",
    tags: ["Expenses"],
    body: z.object({ approvedAmount: moneyText, comment: optionalText }),
    handler: ({ user, params, body }) => finance.decideExpense(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/expenses/:id/pay",
    summary: "Record payment of an approved expense",
    tags: ["Expenses"],
    body: z.object({ paidAmount: moneyText, paymentReference: z.string().trim().min(1, "Enter the payment reference.").max(100) }),
    handler: ({ user, params, body }) => finance.payExpense(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/expenses/:id/account",
    summary: "Mark a paid expense accounted for (receipt required)",
    tags: ["Expenses"],
    handler: ({ user, params }) => finance.accountExpense(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/expenses/:id/close",
    summary: "Close an accounted or rejected expense",
    tags: ["Expenses"],
    handler: ({ user, params }) => finance.closeExpense(user, idParam(params)),
  });

  // ── Budgets
  router.add({
    method: "POST",
    path: "/budgets/:id/approve",
    summary: "Approve a budget line",
    tags: ["Budgets"],
    body: z.object({ comment: optionalText }),
    handler: ({ user, params, body }) => finance.approveBudget(user, idParam(params), body.comment),
  });

  // ── Advances
  router.add({
    method: "POST",
    path: "/advances/:id/decision",
    summary: "Approve or reject an advance request",
    tags: ["Advances"],
    body: z.object({ approve: z.boolean(), amountApproved: moneyText.optional(), comment: optionalText }),
    handler: ({ user, params, body }) => finance.decideAdvance(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/advances/:id/issue",
    summary: "Record issue of an approved advance and its accounting deadline",
    tags: ["Advances"],
    body: z.object({ amountIssued: moneyText, accountingDeadline: dateInput }),
    handler: ({ user, params, body }) => finance.issueAdvance(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/advances/:id/account",
    summary: "Account for an advance: record returned cash; expenses linked to the advance count as expenditure",
    tags: ["Advances"],
    body: z.object({ amountReturned: moneyText }),
    handler: ({ user, params, body }) => finance.accountAdvance(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/advances/:id/close",
    summary: "Close a fully accounted advance",
    tags: ["Advances"],
    handler: ({ user, params }) => finance.closeAdvance(user, idParam(params)),
  });

  // ── Recoveries
  router.add({
    method: "POST",
    path: "/recoveries/:id/verify",
    summary: "Verify a recovery and post it to the linked invoice and cheque",
    tags: ["Recoveries"],
    handler: ({ user, params }) => finance.verifyRecovery(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/recoveries/:id/reject",
    summary: "Reject an unverified recovery",
    tags: ["Recoveries"],
    body: z.object({ reason }),
    handler: ({ user, params, body }) => finance.rejectRecovery(user, idParam(params), body.reason),
  });

  // ── Write-offs (one literal path per step so generic record routes are never shadowed)
  const writeOffBody = z.object({
    notes: optionalText,
    boardApprovalReference: z.string().trim().max(100).optional(),
    boardApprovalDate: dateInput.optional(),
    accountingEntryReference: z.string().trim().max(100).optional(),
  });
  const WRITE_OFF_STEPS: [finance.WriteOffStep, string][] = [
    ["submit", "Submit a draft write-off for finance review"],
    ["finance_review", "Finance review (finance reviewer; not the author)"],
    ["management_approval", "Management approval (goes to board approval above the threshold)"],
    ["board_approval", "Record board approval (resolution reference and date)"],
    ["reject", "Reject a write-off in approval (reason required)"],
    ["record_accounting", "Record the accounting-entry reference"],
    ["close", "Close an approved, posted write-off"],
  ];
  for (const [step, summary] of WRITE_OFF_STEPS) {
    router.add({
      method: "POST",
      path: `/write-offs/:id/${step.replace(/_/g, "-")}`,
      summary,
      tags: ["Write-offs"],
      body: writeOffBody,
      handler: ({ user, params, body }) => finance.advanceWriteOff(user, idParam(params), step, body),
    });
  }

  // ── Findings and decisions
  router.add({
    method: "GET",
    path: "/findings/:id/detail",
    summary: "Recommendations and management decisions for a finding",
    tags: ["Findings"],
    handler: ({ user, params }) => records.findingDetail(user, idParam(params)),
  });
  router.add({
    method: "PUT",
    path: "/findings/:id/recommendations",
    summary: "Set the recommendations on a draft finding (several may apply, e.g. criminal and civil action)",
    tags: ["Findings"],
    body: z.object({ items: z.array(z.object({ type: z.enum(ENUMS.RecommendationType), details: z.string().trim().max(5000).nullish() })).max(12) }),
    handler: ({ user, params, body }) => records.setRecommendations(user, idParam(params), body.items),
  });
  router.add({
    method: "POST",
    path: "/findings/:id/submit",
    summary: "Submit a finding for management decision",
    tags: ["Findings"],
    handler: ({ user, params }) => records.submitFinding(user, idParam(params)),
  });
  router.add({
    method: "POST",
    path: "/findings/:id/decision",
    summary: "Record the management decision (approver cannot be the author)",
    tags: ["Findings"],
    body: z.object({
      outcome: z.enum(ENUMS.DecisionOutcome),
      decisionDate: dateInput,
      conditions: z.string().trim().max(5000).nullish(),
      comments: z.string().trim().max(5000).nullish(),
      approvedTypes: z.array(z.enum(ENUMS.RecommendationType)).max(12).default([]),
    }),
    handler: ({ user, params, body }) => records.decideFinding(user, idParam(params), body),
  });

  // ── Work-done log
  router.add({
    method: "POST",
    path: "/work-logs/:id/tasks",
    summary: "Generate a follow-up task from a work-done entry",
    tags: ["Work-done log"],
    body: z.object({
      title: z.string().trim().max(300).optional(),
      assigneeId: z.string().max(64).nullish(),
      dueDate: dateInput.nullish(),
      category: z.enum(ENUMS.TaskCategory).optional(),
      priority: z.enum(ENUMS.Priority).optional(),
    }),
    handler: ({ user, params, body }) => records.taskFromWorkLog(user, idParam(params), body),
  });
  router.add({
    method: "POST",
    path: "/work-logs/:id/review",
    summary: "Supervisor review of a work-done entry",
    tags: ["Work-done log"],
    body: z.object({ status: z.enum(["REVIEWED", "RETURNED"]), comment: z.string().trim().max(5000) }),
    handler: ({ user, params, body }) => records.reviewWorkLog(user, idParam(params), body),
  });

  // ── Cheques
  router.add({ method: "GET", path: "/cheques/:id/invoices", summary: "Invoices linked to a cheque", tags: ["Cheques"], handler: ({ user, params }) => records.chequeInvoices(user, idParam(params)) });
  router.add({
    method: "PUT",
    path: "/cheques/:id/invoices",
    summary: "Replace the invoices linked to a cheque (with allocated amounts)",
    tags: ["Cheques"],
    body: z.object({ links: z.array(z.object({ invoiceId: z.string().min(1).max(64), amount: moneyText })).max(500) }),
    handler: ({ user, params, body }) => records.setChequeInvoices(user, idParam(params), body.links),
  });
}
