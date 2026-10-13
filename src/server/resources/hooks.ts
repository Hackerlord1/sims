import "server-only";
import type { Tx } from "@/server/db";
import { badRequest } from "@/server/api/errors";
import type { CurrentUser } from "@/server/auth/principal";
import { nextCaseReference, nextYearReference } from "@/server/references";
import { expenseTotals } from "@/lib/finance";
import { maskAccount } from "@/lib/masking";
import { money, toDbString } from "@/lib/money";

export type Row = Record<string, unknown>;

export interface HookContext {
  tx: Tx;
  user: CurrentUser;
  caseRow: { id: string; reference: string; currency: string } | null;
}

export interface ResourceHooks {
  /** Fills server-managed columns on create (references, totals, actors). */
  beforeCreate?: (data: Row, ctx: HookContext) => Promise<void> | void;
  /** Validates and derives values on update. `existing` is the current row. */
  beforeUpdate?: (data: Row, existing: Row, ctx: HookContext) => Promise<void> | void;
  /** Reason the row may not be soft-deleted, or null. Legal hold and closed cases are checked generically. */
  protection?: (row: Row) => string | null;
}

const statusIn = (row: Row, ...s: string[]) => s.includes(String(row.status));

export const HOOKS: Record<string, ResourceHooks> = {
  cases: {
    async beforeCreate(data, { tx }) {
      data.reference = await nextYearReference(tx, "case");
      data.status = "DRAFT";
      data.currency = String(data.currency ?? "KES").toUpperCase();
      data.openedAt ??= new Date();
    },
    beforeUpdate(data) {
      if (data.currency) data.currency = String(data.currency).toUpperCase();
    },
  },

  subfiles: {
    async beforeCreate(data, { tx, caseRow }) {
      const { sequence, reference } = await nextCaseReference(tx, "subFile", caseRow!);
      data.sequence = sequence;
      data.reference = reference;
    },
  },

  tasks: {
    async beforeCreate(data, { tx, caseRow }) {
      const { reference } = await nextCaseReference(tx, "task", caseRow!);
      data.reference = reference;
      if (data.status === "COMPLETED") data.completedAt = new Date();
    },
    beforeUpdate(data, existing) {
      if (data.status === "COMPLETED" && existing.status !== "COMPLETED") data.completedAt = new Date();
      if (data.status && data.status !== "COMPLETED" && existing.status === "COMPLETED") data.completedAt = null;
    },
  },

  cheques: {
    beforeCreate(data) {
      if (data.accountNumberMasked) data.accountNumberMasked = maskAccount(String(data.accountNumberMasked));
    },
    beforeUpdate(data, existing) {
      if (data.accountNumberMasked && data.accountNumberMasked !== existing.accountNumberMasked) {
        data.accountNumberMasked = maskAccount(String(data.accountNumberMasked));
      }
      if (data.replacementChequeId && data.replacementChequeId === existing.id) {
        throw badRequest("A cheque cannot replace itself.");
      }
    },
  },

  "party-statements": {
    beforeUpdate(_data, existing) {
      if (existing.signed) throw badRequest("A signed statement cannot be edited. Record a new statement instead.");
    },
    protection: (row) => (row.signed ? "Signed statements cannot be deleted." : null),
  },

  evidence: {
    protection: () => "Original evidence cannot be deleted. Archive it instead.",
  },

  "financial-statements": {
    protection: () => "Original financial statements cannot be deleted. Archive them instead.",
  },

  findings: {
    beforeCreate(data) {
      data.status = "DRAFT";
    },
    beforeUpdate(_data, existing) {
      if (!statusIn(existing, "DRAFT", "RETURNED")) {
        throw badRequest("A finding can only be edited while it is a draft or has been returned for more work.");
      }
    },
  },

  "court-events": {
    protection: (row) => (["RULING", "JUDGMENT", "DECREE", "CONSENT"].includes(String(row.eventType)) || row.orders ? "Court orders and judgments cannot be deleted." : null),
  },

  "criminal-milestones": {
    protection: (row) => (row.milestone === "JUDGMENT" ? "Judgments cannot be deleted." : null),
  },

  "write-offs": {
    async beforeCreate(data, { tx }) {
      data.reference = await nextYearReference(tx, "writeOff");
      data.status = "DRAFT";
    },
    beforeUpdate(_data, existing) {
      if (!statusIn(existing, "DRAFT")) throw badRequest("A write-off can only be edited while it is a draft.");
    },
    protection: (row) => (statusIn(row, "APPROVED", "CLOSED") ? "Approved write-offs cannot be deleted." : null),
  },

  expenses: {
    async beforeCreate(data, { tx, user, caseRow }) {
      data.reference = await nextYearReference(tx, "expense");
      const totals = expenseTotals({ amountBeforeTax: data.amountBeforeTax as string, tax: (data.tax as string) ?? "0" });
      data.tax = toDbString(totals.tax);
      data.totalAmount = toDbString(totals.totalAmount);
      data.requestedAmount ??= data.totalAmount;
      if (money(data.requestedAmount as string).greaterThan(totals.totalAmount)) {
        throw badRequest("The requested amount cannot exceed the total amount.");
      }
      data.status = "DRAFT";
      data.employeeId ??= user.id;
      data.currency = String(data.currency ?? caseRow?.currency ?? "KES").toUpperCase();
    },
    beforeUpdate(data, existing) {
      const amountFields = ["amountBeforeTax", "tax", "requestedAmount", "pathway", "category", "caseId", "advanceId"];
      const touchesAmounts = amountFields.some((f) => f in data && data[f] !== undefined);
      if (touchesAmounts && !statusIn(existing, "DRAFT")) {
        throw badRequest("Amounts, pathway and category can only be changed while the expense is a draft.");
      }
      if (touchesAmounts) {
        const totals = expenseTotals({
          amountBeforeTax: (data.amountBeforeTax ?? existing.amountBeforeTax) as string,
          tax: (data.tax ?? existing.tax ?? "0") as string,
        });
        data.totalAmount = toDbString(totals.totalAmount);
        const requested = money((data.requestedAmount ?? existing.requestedAmount) as string);
        if (requested.greaterThan(totals.totalAmount)) throw badRequest("The requested amount cannot exceed the total amount.");
      }
    },
    protection: (row) => (statusIn(row, "APPROVED", "PARTIALLY_APPROVED", "PAID", "AWAITING_RECEIPT", "ACCOUNTED_FOR", "CLOSED") ? "Approved or paid expenses cannot be deleted." : null),
  },

  advances: {
    async beforeCreate(data, { tx }) {
      data.reference = await nextYearReference(tx, "advance");
      data.status = "REQUESTED";
    },
    beforeUpdate(data, existing) {
      if ("amountRequested" in data && data.amountRequested !== undefined && !statusIn(existing, "REQUESTED")) {
        throw badRequest("The requested amount can only change before approval.");
      }
    },
    protection: (row) => (statusIn(row, "REQUESTED", "REJECTED") ? null : "Issued advances cannot be deleted."),
  },

  budgets: {
    beforeCreate(data) {
      data.status = "PROPOSED";
    },
    beforeUpdate(data, existing) {
      if ("approvedAmount" in data && data.approvedAmount !== undefined && existing.status === "APPROVED") {
        data.status = "REVISED";
        data.approverId = null;
        data.approvedAt = null;
      }
    },
  },

  recoveries: {
    async beforeCreate(data, { tx, user }) {
      data.reference = await nextYearReference(tx, "recovery");
      data.status = "RECORDED";
      data.recordedById = user.id;
      data.recoveryCosts ??= "0.00";
      if (money(data.recoveryCosts as string).greaterThan(money(data.grossAmount as string))) {
        throw badRequest("Recovery costs cannot exceed the gross amount.");
      }
    },
    beforeUpdate(data, existing) {
      if (!statusIn(existing, "RECORDED")) throw badRequest("Only unverified recoveries can be edited.");
      const gross = money((data.grossAmount ?? existing.grossAmount) as string);
      const costs = money((data.recoveryCosts ?? existing.recoveryCosts ?? "0") as string);
      if (costs.greaterThan(gross)) throw badRequest("Recovery costs cannot exceed the gross amount.");
    },
    protection: (row) => (row.status === "VERIFIED" ? "Verified recovery receipts cannot be deleted." : null),
  },
};
