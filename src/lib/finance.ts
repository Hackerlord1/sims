// Investigation cost and recovery calculations. Pure functions over plain records so they can be
// unit-tested and reused by the API, reports and dashboards.
//
// Definitions (documented in docs/FINANCIAL-CALCULATIONS.md):
//   Actual expense         = approvedAmount of expenses in a counted status (approved or later)
//   Recovery & enforcement = RECOVERY-pathway expenses + recoveryCosts on verified recoveries
//   Total Investigation Cost = Internal + Criminal + Civil + Recovery & enforcement
//   Gross Recovery         = Σ grossAmount of VERIFIED recoveries
//   Net Recovery           = Gross Recovery − Total Investigation Cost
//   Outstanding Principal  = Confirmed Recoverable − Gross Recovery
//   Remaining Exposure     = Confirmed Recoverable − Gross Recovery − Written Off (approved)
//   Recovery Rate          = Gross Recovery / Confirmed Recoverable × 100   (null if denominator is 0)
//   Cost-to-Recovery Ratio = Total Investigation Cost / Gross Recovery × 100 (null if denominator is 0)
//   Budget Variance        = Approved Budget − Actual Expenses
//   Budget Utilisation     = Actual Expenses / Approved Budget × 100       (null if denominator is 0)

import { Decimal, money, nonNegative, percentage, sum, ZERO, type MoneyInput } from "@/lib/money";

export const COUNTED_EXPENSE_STATUSES = new Set(["APPROVED", "PARTIALLY_APPROVED", "PAID", "AWAITING_RECEIPT", "ACCOUNTED_FOR", "CLOSED"]);

export const APPROVED_WRITE_OFF_STATUSES = new Set(["APPROVED", "CLOSED"]);

/** Invoice classifications whose outstanding balance counts as "unsupported invoice value". */
export const UNSUPPORTED_INVOICE_CLASSES = new Set([
  "CUSTOMER_NOT_IDENTIFIED",
  "NO_PROOF_OF_DELIVERY",
  "DUPLICATE",
  "FICTITIOUS_INVOICE_SUSPECTED",
  "PAYMENT_MADE_TO_EMPLOYEE",
  "CASH_COLLECTED_NOT_REMITTED",
  "MPESA_PAID_TO_PERSONAL_NUMBER",
]);

export type Pathway = "INVESTIGATION" | "CRIMINAL" | "CIVIL" | "RECOVERY";
export const PATHWAYS: Pathway[] = ["INVESTIGATION", "CRIMINAL", "CIVIL", "RECOVERY"];

export interface ExpenseLike {
  pathway: Pathway;
  status: string;
  approvedAmount: MoneyInput;
  category?: string;
}
export interface RecoveryLike {
  status: string;
  grossAmount: MoneyInput;
  recoveryCosts: MoneyInput;
}
export interface WriteOffLike {
  status: string;
  amount: MoneyInput;
}
export interface InvoiceLike {
  classification: string;
  invoiceAmount: MoneyInput;
  amountPaid: MoneyInput;
}
export interface ChequeLike {
  amount: MoneyInput;
  status: string;
  dateDishonoured?: Date | string | null;
}
export interface BudgetLike {
  pathway: Pathway;
  status: string;
  approvedAmount: MoneyInput;
}

export interface CaseExposureInput {
  grossAmount: MoneyInput;
  amountDemanded: MoneyInput;
  amountDisputed: MoneyInput;
  amountAcknowledged: MoneyInput;
  amountConfirmedRecoverable: MoneyInput;
}

export const actualExpense = (e: ExpenseLike): Decimal => (COUNTED_EXPENSE_STATUSES.has(e.status) ? money(e.approvedAmount) : ZERO);

export function costsByPathway(expenses: ExpenseLike[], recoveries: RecoveryLike[] = []): Record<Pathway, Decimal> {
  const out: Record<Pathway, Decimal> = { INVESTIGATION: ZERO, CRIMINAL: ZERO, CIVIL: ZERO, RECOVERY: ZERO };
  for (const e of expenses) out[e.pathway] = out[e.pathway].plus(actualExpense(e));
  const recoveryCosts = sum(recoveries.filter((r) => r.status === "VERIFIED").map((r) => r.recoveryCosts));
  out.RECOVERY = out.RECOVERY.plus(recoveryCosts);
  return out;
}

export const grossRecovery = (recoveries: RecoveryLike[]): Decimal => sum(recoveries.filter((r) => r.status === "VERIFIED").map((r) => r.grossAmount));

export const recordNetRecovery = (r: Pick<RecoveryLike, "grossAmount" | "recoveryCosts">): Decimal => money(r.grossAmount).minus(money(r.recoveryCosts));

export const invoiceOutstanding = (i: Pick<InvoiceLike, "invoiceAmount" | "amountPaid">): Decimal => nonNegative(money(i.invoiceAmount).minus(money(i.amountPaid)));

export const unsupportedInvoiceValue = (invoices: InvoiceLike[]): Decimal => sum(invoices.filter((i) => UNSUPPORTED_INVOICE_CLASSES.has(i.classification)).map(invoiceOutstanding));

export const isDishonoured = (c: ChequeLike): boolean => c.status === "DISHONOURED" || (c.dateDishonoured !== null && c.dateDishonoured !== undefined);

export const badChequeValue = (cheques: ChequeLike[]): Decimal => sum(cheques.filter(isDishonoured).map((c) => c.amount));

export interface CaseFinancialSummary {
  grossAmount: Decimal;
  amountDemanded: Decimal;
  amountDisputed: Decimal;
  amountAcknowledged: Decimal;
  amountConfirmedRecoverable: Decimal;
  amountRecovered: Decimal;
  amountWrittenOff: Decimal;
  remainingExposure: Decimal;
  outstandingPrincipal: Decimal;
  unsupportedInvoiceValue: Decimal;
  badChequeValue: Decimal;
  investigationExpenses: Decimal;
  criminalExpenses: Decimal;
  civilExpenses: Decimal;
  recoveryExpenses: Decimal;
  totalCosts: Decimal;
  netRecovery: Decimal;
  recoveryRate: Decimal | null;
  costToRecoveryRatio: Decimal | null;
  /** True when recoveries plus write-offs exceed the confirmed recoverable amount. */
  overRecovered: boolean;
}

export function computeCaseFinancials(input: {
  exposure: CaseExposureInput;
  expenses: ExpenseLike[];
  recoveries: RecoveryLike[];
  writeOffs: WriteOffLike[];
  invoices: InvoiceLike[];
  cheques: ChequeLike[];
}): CaseFinancialSummary {
  const confirmed = money(input.exposure.amountConfirmedRecoverable);
  const recovered = grossRecovery(input.recoveries);
  const writtenOff = sum(input.writeOffs.filter((w) => APPROVED_WRITE_OFF_STATUSES.has(w.status)).map((w) => w.amount));
  const costs = costsByPathway(input.expenses, input.recoveries);
  const totalCosts = costs.INVESTIGATION.plus(costs.CRIMINAL).plus(costs.CIVIL).plus(costs.RECOVERY);
  const remaining = confirmed.minus(recovered).minus(writtenOff);

  return {
    grossAmount: money(input.exposure.grossAmount),
    amountDemanded: money(input.exposure.amountDemanded),
    amountDisputed: money(input.exposure.amountDisputed),
    amountAcknowledged: money(input.exposure.amountAcknowledged),
    amountConfirmedRecoverable: confirmed,
    amountRecovered: recovered,
    amountWrittenOff: writtenOff,
    remainingExposure: remaining,
    outstandingPrincipal: confirmed.minus(recovered),
    unsupportedInvoiceValue: unsupportedInvoiceValue(input.invoices),
    badChequeValue: badChequeValue(input.cheques),
    investigationExpenses: costs.INVESTIGATION,
    criminalExpenses: costs.CRIMINAL,
    civilExpenses: costs.CIVIL,
    recoveryExpenses: costs.RECOVERY,
    totalCosts,
    netRecovery: recovered.minus(totalCosts),
    recoveryRate: percentage(recovered, confirmed),
    costToRecoveryRatio: percentage(totalCosts, recovered),
    overRecovered: remaining.isNegative(),
  };
}

// ───────────────────── Budgets ─────────────────────

export interface BudgetLine {
  pathway: Pathway;
  approved: Decimal;
  actual: Decimal;
  variance: Decimal;
  utilisation: Decimal | null;
  overBudget: boolean;
}

export function budgetVsActual(budgets: BudgetLike[], expenses: ExpenseLike[], recoveries: RecoveryLike[] = []) {
  const actualByPathway = costsByPathway(expenses, recoveries);
  const lines: BudgetLine[] = PATHWAYS.map((pathway) => {
    const approved = sum(budgets.filter((b) => b.pathway === pathway && b.status !== "PROPOSED").map((b) => b.approvedAmount));
    const actual = actualByPathway[pathway];
    const variance = approved.minus(actual);
    return { pathway, approved, actual, variance, utilisation: percentage(actual, approved), overBudget: variance.isNegative() };
  });
  const approved = sum(lines.map((l) => l.approved));
  const actual = sum(lines.map((l) => l.actual));
  return {
    lines,
    total: {
      approved,
      actual,
      variance: approved.minus(actual),
      utilisation: percentage(actual, approved),
      overBudget: approved.minus(actual).isNegative(),
    },
  };
}

// ───────────────────── Advances and imprests ─────────────────────

export interface AdvanceInput {
  amountIssued: MoneyInput;
  amountReturned: MoneyInput;
  /** Σ approved amounts of expenses accounted against this advance. */
  actualExpenditure: MoneyInput;
}

export interface AdvancePosition {
  actualExpenditure: Decimal;
  unusedBalance: Decimal;
  additionalAmountDue: Decimal;
  outstandingBalance: Decimal;
}

/**
 * unused = max(issued − actual, 0); additional due to the employee = max(actual − issued, 0);
 * outstanding (still to be accounted or returned) = max(issued − actual − returned, 0).
 */
export function advancePosition(a: AdvanceInput): AdvancePosition {
  const issued = money(a.amountIssued);
  const actual = money(a.actualExpenditure);
  const returned = money(a.amountReturned);
  return {
    actualExpenditure: actual,
    unusedBalance: nonNegative(issued.minus(actual)),
    additionalAmountDue: nonNegative(actual.minus(issued)),
    outstandingBalance: nonNegative(issued.minus(actual).minus(returned)),
  };
}

export function isAdvanceUnaccounted(a: { status: string; accountingDeadline: Date | string | null }, position: AdvancePosition, now: Date = new Date()): boolean {
  if (!["ISSUED", "PARTLY_ACCOUNTED"].includes(a.status)) return false;
  if (!a.accountingDeadline) return false;
  return new Date(a.accountingDeadline).getTime() < now.getTime() && position.outstandingBalance.greaterThan(0);
}

// ───────────────────── Expenses ─────────────────────

/** Validates and derives expense totals. Throws with a user-facing message on inconsistent input. */
export function expenseTotals(input: { amountBeforeTax: MoneyInput; tax: MoneyInput }) {
  const before = money(input.amountBeforeTax);
  const tax = money(input.tax);
  if (before.isNegative() || tax.isNegative()) throw new Error("Amounts cannot be negative.");
  return { amountBeforeTax: before, tax, totalAmount: before.plus(tax) };
}

/** Result of an approval decision on a requested amount. */
export function approvalSplit(requested: MoneyInput, approved: MoneyInput) {
  const req = money(requested);
  const app = money(approved);
  if (app.isNegative()) throw new Error("Approved amount cannot be negative.");
  if (app.greaterThan(req)) throw new Error("Approved amount cannot exceed the requested amount.");
  const status = app.isZero() ? "REJECTED" : app.equals(req) ? "APPROVED" : "PARTIALLY_APPROVED";
  return { approvedAmount: app, rejectedAmount: req.minus(app), status } as const;
}
