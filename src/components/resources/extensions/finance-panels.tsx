"use client";

import { BadgeCheck, CheckCircle2, CircleDollarSign, HandCoins, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { rowCurrency } from "@/components/resources/cells";
import type { ExtensionProps } from "@/components/resources/detail-extensions";
import { ActionButton, ActionDialog, PanelSection, post } from "@/components/resources/extensions/action";
import { ResourceTable } from "@/components/resources/resource-table";
import { LinkedEvidence } from "@/components/evidence/linked-evidence";
import { useCan, useSession } from "@/components/session-context";
import { StatusBadge } from "@/components/ui/badge";
import { Money } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { enumLabel } from "@/lib/enums";

const caseIdOf = (row: ExtensionProps["row"]) => String(row.caseId);

// ───────────────────── Expenses ─────────────────────

export function ExpensePanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const status = String(row.status);
  const cur = rowCurrency(row);
  const [approved, setApproved] = useState(String(row.requestedAmount ?? ""));
  const [comment, setComment] = useState("");
  const [paid, setPaid] = useState(String(row.approvedAmount ?? ""));
  const [payRef, setPayRef] = useState("");
  const selfMade = row.createdById === me.id || row.employeeId === me.id;

  return (
    <div className="space-y-3">
      <PanelSection
        title="Approval workflow"
        actions={
          <>
            {status === "DRAFT" && can("EXPENSES", "EDIT") ? (
              <ActionButton path={`/expenses/${row.id}/submit`} success="Expense submitted for approval." onDone={refresh}>
                <Send className="h-4 w-4" aria-hidden /> Submit for approval
              </ActionButton>
            ) : null}
            {status === "SUBMITTED" && can("EXPENSES", "APPROVE") && !selfMade ? (
              <ActionDialog
                label="Approve or reject"
                icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
                title="Expense decision"
                description={`Requested: ${String(row.requestedAmount)} ${cur}. Enter the approved amount — the full amount approves, a lower amount partially approves, 0 rejects.`}
                onSubmit={async () => {
                  await post(`/expenses/${row.id}/decision`, { approvedAmount: approved, comment: comment || undefined }, "Decision recorded.");
                  await refresh();
                }}
              >
                <Field id="exp-approved" label="Approved amount" required>
                  <Input id="exp-approved" inputMode="decimal" className="ref" value={approved} onChange={(e) => setApproved(e.target.value)} />
                </Field>
                <Field id="exp-comment" label="Comment" hint="Required when reducing or rejecting.">
                  <Textarea id="exp-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {["APPROVED", "PARTIALLY_APPROVED"].includes(status) && can("EXPENSES", "APPROVE") ? (
              <ActionDialog
                label="Record payment"
                icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
                title="Record payment"
                onSubmit={async () => {
                  await post(`/expenses/${row.id}/pay`, { paidAmount: paid, paymentReference: payRef }, "Payment recorded.");
                  await refresh();
                }}
              >
                <Field id="exp-paid" label="Paid amount" required>
                  <Input id="exp-paid" inputMode="decimal" className="ref" value={paid} onChange={(e) => setPaid(e.target.value)} />
                </Field>
                <Field id="exp-ref" label="Payment reference" required>
                  <Input id="exp-ref" className="ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {["PAID", "AWAITING_RECEIPT"].includes(status) && can("EXPENSES", "APPROVE") ? (
              <ActionButton path={`/expenses/${row.id}/account`} success="Expense accounted for." onDone={refresh} variant="secondary">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Mark accounted for
              </ActionButton>
            ) : null}
            {["ACCOUNTED_FOR", "REJECTED"].includes(status) && can("EXPENSES", "APPROVE") ? (
              <ActionButton path={`/expenses/${row.id}/close`} success="Expense closed." onDone={refresh} variant="secondary">
                Close expense
              </ActionButton>
            ) : null}
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Status</dt>
            <dd>
              <StatusBadge value={status} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Requested</dt>
            <dd>
              <Money value={row.requestedAmount as string} currency={cur} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Approved</dt>
            <dd>
              <Money value={row.approvedAmount as string} currency={cur} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Paid</dt>
            <dd>
              <Money value={row.paidAmount as string} currency={cur} />
            </dd>
          </div>
        </dl>
        {status === "SUBMITTED" && selfMade && can("EXPENSES", "APPROVE") ? <p className="mt-2 text-xs text-muted">You requested this expense, so another approver must decide it.</p> : null}
        {row.approvalComment ? <p className="mt-2 text-sm">Decision comment: {String(row.approvalComment)}</p> : null}
      </PanelSection>
      <LinkedEvidence caseId={caseIdOf(row)} linkType="EXPENSE" linkId={row.id} title="Receipt or invoice" defaultCategory="RECEIPT" uploadLabel="Upload receipt" />
    </div>
  );
}

// ───────────────────── Budgets ─────────────────────

export function BudgetPanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const status = String(row.status);
  return (
    <PanelSection
      title={`Budget line — ${enumLabel(String(row.pathway))}`}
      actions={
        status !== "APPROVED" && can("BUDGETS", "APPROVE") && row.createdById !== me.id ? (
          <ActionButton path={`/budgets/${row.id}/approve`} success="Budget approved." onDone={refresh}>
            <BadgeCheck className="h-4 w-4" aria-hidden /> Approve budget
          </ActionButton>
        ) : null
      }
    >
      <p className="text-sm">
        <StatusBadge value={status} /> <Money value={row.approvedAmount as string} currency={rowCurrency(row)} />
      </p>
    </PanelSection>
  );
}

// ───────────────────── Advances ─────────────────────

export function AdvancePanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const status = String(row.status);
  const cur = rowCurrency(row);
  const [amount, setAmount] = useState(String(row.amountRequested ?? ""));
  const [issueAmount, setIssueAmount] = useState(String(row.amountApproved ?? ""));
  const [deadline, setDeadline] = useState("");
  const [returned, setReturned] = useState(String(row.amountReturned ?? "0"));
  const [comment, setComment] = useState("");
  const selfMade = row.createdById === me.id || row.employeeId === me.id;

  return (
    <div className="space-y-3">
      <PanelSection
        title="Advance and imprest"
        actions={
          <>
            {status === "REQUESTED" && can("ADVANCES", "APPROVE") && !selfMade ? (
              <>
                <ActionDialog
                  label="Approve"
                  icon={<BadgeCheck className="h-4 w-4" aria-hidden />}
                  title="Approve advance"
                  onSubmit={async () => {
                    await post(`/advances/${row.id}/decision`, { approve: true, amountApproved: amount, comment: comment || undefined }, "Advance approved.");
                    await refresh();
                  }}
                >
                  <Field id="adv-amount" label="Amount approved" required>
                    <Input id="adv-amount" inputMode="decimal" className="ref" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                </ActionDialog>
                <ActionDialog
                  label="Reject"
                  variant="danger"
                  icon={<XCircle className="h-4 w-4" aria-hidden />}
                  title="Reject advance"
                  onSubmit={async () => {
                    await post(`/advances/${row.id}/decision`, { approve: false, comment }, "Advance rejected.");
                    await refresh();
                  }}
                >
                  <Field id="adv-reason" label="Reason" required>
                    <Textarea id="adv-reason" value={comment} onChange={(e) => setComment(e.target.value)} />
                  </Field>
                </ActionDialog>
              </>
            ) : null}
            {status === "APPROVED" && can("ADVANCES", "APPROVE") ? (
              <ActionDialog
                label="Issue funds"
                icon={<HandCoins className="h-4 w-4" aria-hidden />}
                title="Issue advance"
                onSubmit={async () => {
                  await post(`/advances/${row.id}/issue`, { amountIssued: issueAmount, accountingDeadline: deadline }, "Advance issued.");
                  await refresh();
                }}
              >
                <Field id="adv-issue" label="Amount issued" required>
                  <Input id="adv-issue" inputMode="decimal" className="ref" value={issueAmount} onChange={(e) => setIssueAmount(e.target.value)} />
                </Field>
                <Field id="adv-deadline" label="Accounting deadline" required>
                  <Input id="adv-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {["ISSUED", "PARTLY_ACCOUNTED"].includes(status) && can("ADVANCES", "APPROVE") ? (
              <ActionDialog
                label="Account for advance"
                icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
                title="Account for advance"
                description="Expenses linked to this advance (approved or later) count as actual expenditure. Enter any cash returned."
                onSubmit={async () => {
                  await post(`/advances/${row.id}/account`, { amountReturned: returned }, "Accounting recorded.");
                  await refresh();
                }}
              >
                <Field id="adv-returned" label="Amount returned" required>
                  <Input id="adv-returned" inputMode="decimal" className="ref" value={returned} onChange={(e) => setReturned(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {["ACCOUNTED", "REJECTED"].includes(status) && can("ADVANCES", "APPROVE") ? (
              <ActionButton path={`/advances/${row.id}/close`} success="Advance closed." onDone={refresh} variant="secondary">
                Close advance
              </ActionButton>
            ) : null}
          </>
        }
      >
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {(
            [
              ["Requested", row.amountRequested],
              ["Approved", row.amountApproved],
              ["Issued", row.amountIssued],
              ["Actual expenditure", row.actualExpenditure],
              ["Unused balance", row.unusedBalance],
              ["Returned", row.amountReturned],
              ["Additional amount due", row.additionalAmountDue],
              ["Outstanding balance", row.outstandingBalance],
            ] as [string, unknown][]
          ).map(([label, v]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd>
                <Money value={v as string} currency={cur} />
              </dd>
            </div>
          ))}
        </dl>
      </PanelSection>
      <ResourceTable
        resource="expenses"
        caseId={caseIdOf(row)}
        fixedFilters={{ advanceId: row.id }}
        createFixed={{ advanceId: row.id }}
        title="Expenses paid from this advance"
        allowModeSwitch={false}
        defaultPageSize={10}
      />
      <LinkedEvidence caseId={caseIdOf(row)} linkType="ADVANCE" linkId={row.id} title="Supporting receipts" defaultCategory="RECEIPT" uploadLabel="Upload receipt" />
    </div>
  );
}

// ───────────────────── Recoveries ─────────────────────

export function RecoveryPanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const status = String(row.status);
  const [reason, setReason] = useState("");
  const selfMade = row.recordedById === me.id;
  return (
    <div className="space-y-3">
      <PanelSection
        title="Verification"
        actions={
          status === "RECORDED" && can("RECOVERIES", "APPROVE") && !selfMade ? (
            <>
              <ActionButton path={`/recoveries/${row.id}/verify`} success="Recovery verified and posted." onDone={refresh}>
                <BadgeCheck className="h-4 w-4" aria-hidden /> Verify and post
              </ActionButton>
              <ActionDialog
                label="Reject"
                variant="danger"
                icon={<XCircle className="h-4 w-4" aria-hidden />}
                title="Reject recovery record"
                onSubmit={async () => {
                  await post(`/recoveries/${row.id}/reject`, { reason }, "Recovery rejected.");
                  await refresh();
                }}
              >
                <Field id="rec-reason" label="Reason" required>
                  <Textarea id="rec-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              </ActionDialog>
            </>
          ) : null
        }
      >
        <p className="text-sm">
          <StatusBadge value={status} /> Gross <Money value={row.grossAmount as string} currency={rowCurrency(row)} /> · Net <Money value={row.netAmount as string} currency={rowCurrency(row)} />
        </p>
        {status === "RECORDED" && selfMade ? <p className="mt-1 text-xs text-muted">You recorded this recovery, so another reviewer must verify it.</p> : null}
        {status === "VERIFIED" ? <p className="mt-1 text-xs text-muted">Verified recovery receipts are protected and cannot be deleted or changed.</p> : null}
        {row.rejectionReason ? <p className="mt-1 text-sm">Rejection reason: {String(row.rejectionReason)}</p> : null}
      </PanelSection>
      <LinkedEvidence
        caseId={caseIdOf(row)}
        linkType="RECOVERY"
        linkId={row.id}
        title="Receipt and supporting evidence"
        defaultCategory="RECEIPT"
        uploadLabel="Upload receipt"
        readOnly={status !== "RECORDED"}
      />
    </div>
  );
}

// ───────────────────── Write-offs ─────────────────────

export function WriteOffPanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const me = useSession();
  const status = String(row.status);
  const [notes, setNotes] = useState("");
  const [boardRef, setBoardRef] = useState("");
  const [boardDate, setBoardDate] = useState("");
  const [acctRef, setAcctRef] = useState("");
  const isFinance = me.role === "FINANCE_REVIEWER" || me.role === "SYSTEM_ADMIN";
  const isManagement = me.role === "MANAGEMENT_APPROVER" || me.role === "SYSTEM_ADMIN";
  const approve = can("WRITE_OFFS", "APPROVE");
  const step = (s: string, body: object, msg: string) => async () => {
    await post(`/write-offs/${row.id}/${s}`, body, msg);
    await refresh();
  };
  const steps = ["DRAFT", "FINANCE_REVIEW", "MANAGEMENT_APPROVAL", ...(row.boardApprovalRequired ? ["BOARD_APPROVAL"] : []), "APPROVED", "CLOSED"];

  return (
    <div className="space-y-3">
      <PanelSection
        title="Write-off approval"
        actions={
          <>
            {status === "DRAFT" && can("WRITE_OFFS", "EDIT") ? (
              <ActionButton path={`/write-offs/${row.id}/submit`} success="Submitted for finance review." onDone={refresh}>
                <Send className="h-4 w-4" aria-hidden /> Submit
              </ActionButton>
            ) : null}
            {status === "FINANCE_REVIEW" && approve && isFinance ? (
              <ActionDialog label="Complete finance review" title="Finance review" onSubmit={step("finance-review", { notes }, "Finance review recorded.")}>
                <Field id="wo-notes" label="Finance review notes">
                  <Textarea id="wo-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {status === "MANAGEMENT_APPROVAL" && approve && isManagement ? (
              <ActionButton path={`/write-offs/${row.id}/management-approval`} success="Management approval recorded." onDone={refresh}>
                <BadgeCheck className="h-4 w-4" aria-hidden /> Management approval
              </ActionButton>
            ) : null}
            {status === "BOARD_APPROVAL" && approve && isManagement ? (
              <ActionDialog
                label="Record board approval"
                title="Board approval"
                onSubmit={step("board-approval", { boardApprovalReference: boardRef, boardApprovalDate: boardDate }, "Board approval recorded.")}
              >
                <Field id="wo-bref" label="Board resolution reference" required>
                  <Input id="wo-bref" className="ref" value={boardRef} onChange={(e) => setBoardRef(e.target.value)} />
                </Field>
                <Field id="wo-bdate" label="Resolution date" required>
                  <Input id="wo-bdate" type="date" value={boardDate} onChange={(e) => setBoardDate(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {["FINANCE_REVIEW", "MANAGEMENT_APPROVAL", "BOARD_APPROVAL"].includes(status) && approve ? (
              <ActionDialog label="Reject" variant="danger" title="Reject write-off" onSubmit={step("reject", { notes }, "Write-off rejected.")}>
                <Field id="wo-reject" label="Reason" required>
                  <Textarea id="wo-reject" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {status === "APPROVED" && approve && isFinance && !row.accountingEntryReference ? (
              <ActionDialog label="Record accounting entry" title="Accounting entry" onSubmit={step("record-accounting", { accountingEntryReference: acctRef }, "Accounting entry recorded.")}>
                <Field id="wo-acct" label="Accounting-entry reference" required>
                  <Input id="wo-acct" className="ref" value={acctRef} onChange={(e) => setAcctRef(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {status === "APPROVED" && approve && row.accountingEntryReference ? (
              <ActionButton path={`/write-offs/${row.id}/close`} success="Write-off closed." onDone={refresh} variant="secondary">
                Close write-off
              </ActionButton>
            ) : null}
          </>
        }
      >
        <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Approval stages">
          {steps.map((s, i) => {
            const idx = steps.indexOf(status);
            const state = status === "REJECTED" ? "rejected" : i < idx ? "done" : i === idx ? "current" : "todo";
            return (
              <li key={s} className="flex items-center gap-1">
                <span className={state === "current" ? "font-semibold text-accent" : state === "done" ? "text-success" : "text-muted"}>
                  {state === "done" ? "✓ " : ""}
                  {enumLabel(s)}
                  <span className="sr-only"> ({state})</span>
                </span>
                {i < steps.length - 1 ? (
                  <span aria-hidden className="text-muted">
                    ›
                  </span>
                ) : null}
              </li>
            );
          })}
          {status === "REJECTED" ? (
            <li>
              <StatusBadge value="REJECTED" />
            </li>
          ) : null}
        </ol>
        {row.boardApprovalRequired ? <p className="mt-2 text-xs text-muted">This amount is at or above the board-approval threshold.</p> : null}
      </PanelSection>
      <LinkedEvidence caseId={caseIdOf(row)} linkType="WRITE_OFF" linkId={row.id} title="Legal opinion, approvals and accounting documents" />
    </div>
  );
}
