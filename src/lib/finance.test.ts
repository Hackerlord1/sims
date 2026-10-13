import { describe, expect, it } from "vitest";
import {
  advancePosition,
  approvalSplit,
  budgetVsActual,
  computeCaseFinancials,
  costsByPathway,
  expenseTotals,
  isAdvanceUnaccounted,
  unsupportedInvoiceValue,
  type ExpenseLike,
  type RecoveryLike,
} from "./finance";

const exposure = (confirmed: string) => ({
  grossAmount: "1000000",
  amountDemanded: "900000",
  amountDisputed: "100000",
  amountAcknowledged: "300000",
  amountConfirmedRecoverable: confirmed,
});
const expense = (pathway: ExpenseLike["pathway"], approvedAmount: string, status = "APPROVED"): ExpenseLike => ({ pathway, approvedAmount, status });
const recovery = (grossAmount: string, recoveryCosts = "0", status = "VERIFIED"): RecoveryLike => ({ grossAmount, recoveryCosts, status });

describe("total investigation cost and net recovery", () => {
  const summary = computeCaseFinancials({
    exposure: exposure("800000"),
    expenses: [
      expense("INVESTIGATION", "20000"),
      expense("INVESTIGATION", "5000", "PAID"),
      expense("CRIMINAL", "7500.50"),
      expense("CIVIL", "40000"),
      expense("RECOVERY", "3000"),
      expense("INVESTIGATION", "99999", "SUBMITTED"), // not yet approved → excluded
      expense("CIVIL", "12345", "REJECTED"), // excluded
    ],
    recoveries: [recovery("200000", "2000"), recovery("100000"), recovery("50000", "0", "RECORDED")],
    writeOffs: [
      { status: "APPROVED", amount: "100000" },
      { status: "DRAFT", amount: "999" },
    ],
    invoices: [
      { classification: "NO_PROOF_OF_DELIVERY", invoiceAmount: "50000", amountPaid: "10000" },
      { classification: "VALID_AND_SUPPORTED", invoiceAmount: "70000", amountPaid: "0" },
      { classification: "FICTITIOUS_INVOICE_SUSPECTED", invoiceAmount: "30000", amountPaid: "40000" },
    ],
    cheques: [
      { amount: "25000", status: "DISHONOURED" },
      { amount: "10000", status: "CLEARED", dateDishonoured: null },
      { amount: "5000", status: "REPLACED", dateDishonoured: "2026-01-02" },
    ],
  });

  it("splits costs by pathway including recovery costs on verified receipts", () => {
    expect(summary.investigationExpenses.toFixed(2)).toBe("25000.00");
    expect(summary.criminalExpenses.toFixed(2)).toBe("7500.50");
    expect(summary.civilExpenses.toFixed(2)).toBe("40000.00");
    expect(summary.recoveryExpenses.toFixed(2)).toBe("5000.00"); // 3,000 expense + 2,000 recovery costs
    expect(summary.totalCosts.toFixed(2)).toBe("77500.50");
  });

  it("counts only verified recoveries", () => {
    expect(summary.amountRecovered.toFixed(2)).toBe("300000.00");
    expect(summary.netRecovery.toFixed(2)).toBe("222499.50");
  });

  it("computes principal, exposure and ratios", () => {
    expect(summary.outstandingPrincipal.toFixed(2)).toBe("500000.00");
    expect(summary.amountWrittenOff.toFixed(2)).toBe("100000.00");
    expect(summary.remainingExposure.toFixed(2)).toBe("400000.00");
    expect(summary.recoveryRate!.toFixed(2)).toBe("37.50");
    expect(summary.costToRecoveryRatio!.toFixed(2)).toBe("25.83");
    expect(summary.overRecovered).toBe(false);
  });

  it("derives unsupported invoice value and bad-cheque value", () => {
    expect(summary.unsupportedInvoiceValue.toFixed(2)).toBe("40000.00"); // overpaid invoice counts as zero
    expect(summary.badChequeValue.toFixed(2)).toBe("30000.00");
  });
});

describe("zero-value safety", () => {
  it("returns null ratios instead of invalid numbers when nothing is recoverable or recovered", () => {
    const s = computeCaseFinancials({ exposure: exposure("0"), expenses: [], recoveries: [], writeOffs: [], invoices: [], cheques: [] });
    expect(s.recoveryRate).toBeNull();
    expect(s.costToRecoveryRatio).toBeNull();
    expect(s.netRecovery.toFixed(2)).toBe("0.00");
    expect(s.totalCosts.toFixed(2)).toBe("0.00");
  });

  it("flags over-recovery rather than hiding a negative exposure", () => {
    const s = computeCaseFinancials({ exposure: exposure("100"), expenses: [], recoveries: [recovery("150")], writeOffs: [], invoices: [], cheques: [] });
    expect(s.remainingExposure.toFixed(2)).toBe("-50.00");
    expect(s.overRecovered).toBe(true);
  });

  it("handles recoveries with costs but no expenses", () => {
    expect(costsByPathway([], [recovery("100", "10")]).RECOVERY.toFixed(2)).toBe("10.00");
  });
});

describe("budget vs actual", () => {
  it("computes variance and utilisation per pathway and in total", () => {
    const r = budgetVsActual(
      [
        { pathway: "INVESTIGATION", status: "APPROVED", approvedAmount: "50000" },
        { pathway: "CIVIL", status: "APPROVED", approvedAmount: "30000" },
        { pathway: "CRIMINAL", status: "PROPOSED", approvedAmount: "99999" }, // not approved → ignored
      ],
      [expense("INVESTIGATION", "20000"), expense("CIVIL", "45000")],
    );
    const inv = r.lines.find((l) => l.pathway === "INVESTIGATION")!;
    expect(inv.variance.toFixed(2)).toBe("30000.00");
    expect(inv.utilisation!.toFixed(2)).toBe("40.00");
    const civil = r.lines.find((l) => l.pathway === "CIVIL")!;
    expect(civil.overBudget).toBe(true);
    expect(civil.variance.toFixed(2)).toBe("-15000.00");
    const criminal = r.lines.find((l) => l.pathway === "CRIMINAL")!;
    expect(criminal.utilisation).toBeNull();
    expect(r.total.utilisation!.toFixed(2)).toBe("81.25");
  });
});

describe("advances", () => {
  it("computes unused balance, additional amount due and outstanding balance", () => {
    const p = advancePosition({ amountIssued: "20000", amountReturned: "3000", actualExpenditure: "15000" });
    expect(p.unusedBalance.toFixed(2)).toBe("5000.00");
    expect(p.additionalAmountDue.toFixed(2)).toBe("0.00");
    expect(p.outstandingBalance.toFixed(2)).toBe("2000.00");
    const over = advancePosition({ amountIssued: "10000", amountReturned: "0", actualExpenditure: "12500" });
    expect(over.additionalAmountDue.toFixed(2)).toBe("2500.00");
    expect(over.outstandingBalance.toFixed(2)).toBe("0.00");
  });

  it("flags unaccounted advances only after the deadline", () => {
    const p = advancePosition({ amountIssued: "1000", amountReturned: "0", actualExpenditure: "0" });
    const now = new Date("2026-06-10T00:00:00Z");
    expect(isAdvanceUnaccounted({ status: "ISSUED", accountingDeadline: "2026-06-01" }, p, now)).toBe(true);
    expect(isAdvanceUnaccounted({ status: "ISSUED", accountingDeadline: "2026-07-01" }, p, now)).toBe(false);
    expect(isAdvanceUnaccounted({ status: "ACCOUNTED", accountingDeadline: "2026-06-01" }, p, now)).toBe(false);
  });
});

describe("expense approval", () => {
  it("derives totals and approval status", () => {
    expect(expenseTotals({ amountBeforeTax: "1000", tax: "160" }).totalAmount.toFixed(2)).toBe("1160.00");
    expect(approvalSplit("1000", "1000").status).toBe("APPROVED");
    expect(approvalSplit("1000", "600")).toMatchObject({ status: "PARTIALLY_APPROVED" });
    expect(approvalSplit("1000", "600").rejectedAmount.toFixed(2)).toBe("400.00");
    expect(approvalSplit("1000", "0").status).toBe("REJECTED");
    expect(() => approvalSplit("1000", "1200")).toThrow(/exceed/);
    expect(() => expenseTotals({ amountBeforeTax: "-1", tax: "0" })).toThrow();
  });

  it("values unsupported invoices by outstanding balance only", () => {
    expect(unsupportedInvoiceValue([{ classification: "DUPLICATE", invoiceAmount: "100", amountPaid: "25" }]).toFixed(2)).toBe("75.00");
  });
});

describe("docs/FINANCIAL-CALCULATIONS.md worked example", () => {
  it("matches the documented figures", () => {
    const f = computeCaseFinancials({
      exposure: { grossAmount: "1200000", amountDemanded: "0", amountDisputed: "0", amountAcknowledged: "0", amountConfirmedRecoverable: "1000000" },
      expenses: [
        { pathway: "INVESTIGATION", status: "APPROVED", approvedAmount: "40000" },
        { pathway: "CRIMINAL", status: "PAID", approvedAmount: "10000" },
        { pathway: "CIVIL", status: "ACCOUNTED_FOR", approvedAmount: "25000" },
        { pathway: "CIVIL", status: "SUBMITTED", approvedAmount: "99999" },
      ],
      recoveries: [
        { status: "VERIFIED", grossAmount: "300000", recoveryCosts: "5000" },
        { status: "RECORDED", grossAmount: "50000", recoveryCosts: "0" },
      ],
      writeOffs: [{ status: "APPROVED", amount: "100000" }],
      invoices: [],
      cheques: [],
    });
    expect(f.totalCosts.toFixed(2)).toBe("80000.00");
    expect(f.netRecovery.toFixed(2)).toBe("220000.00");
    expect(f.outstandingPrincipal.toFixed(2)).toBe("700000.00");
    expect(f.remainingExposure.toFixed(2)).toBe("600000.00");
    expect(f.recoveryRate?.toFixed(2)).toBe("30.00");
    expect(f.costToRecoveryRatio?.toFixed(2)).toBe("26.67");
  });
});
