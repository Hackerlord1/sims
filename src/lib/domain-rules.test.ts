import { describe, expect, it } from "vitest";
import { $Enums } from "@prisma/client";
import { allowedNextStatuses, assertTransition, canTransition, closureBlocked, closureChecklist, InvalidTransitionError } from "./case-status";
import { chequeWarnings, type ChequeFacts } from "./cheque-warnings";
import { daysUntil, deadlineState, effectiveTaskStatus, isCaseInactive } from "./reminders";
import { maskAccount, maskId, maskPhone, normalisePhone } from "./masking";
import { ENUMS, enumLabel } from "./enums";

describe("case status transitions", () => {
  it("only reaches CLOSED through the closure workflow", () => {
    expect(canTransition("UNDER_INTERNAL_INVESTIGATION", "CLOSED")).toBe(false);
    expect(canTransition("UNDER_INTERNAL_INVESTIGATION", "CLOSED", "closure")).toBe(true);
    expect(canTransition("DRAFT", "CLOSED", "closure")).toBe(false);
  });

  it("only leaves CLOSED by reopening", () => {
    expect(canTransition("CLOSED", "UNDER_INTERNAL_INVESTIGATION")).toBe(false);
    expect(canTransition("CLOSED", "REOPENED", "reopen")).toBe(true);
    expect(canTransition("RECOVERY_MONITORING", "REOPENED", "reopen")).toBe(false);
    expect(allowedNextStatuses("CLOSED")).toEqual([]);
  });

  it("supports parallel criminal and civil pathways", () => {
    expect(canTransition("AWAITING_MANAGEMENT_DECISION", "CRIMINAL_AND_CIVIL_ACTION")).toBe(true);
    expect(canTransition("REOPENED", "REFERRED_FOR_CIVIL_ACTION")).toBe(true);
  });

  it("never returns to draft and limits where draft can go", () => {
    expect(canTransition("PRELIMINARY_REVIEW", "DRAFT")).toBe(false);
    expect(allowedNextStatuses("DRAFT").sort()).toEqual(["PRELIMINARY_REVIEW", "UNDER_INTERNAL_INVESTIGATION"]);
    expect(() => assertTransition("DRAFT", "RECOVERY_MONITORING")).toThrow(InvalidTransitionError);
  });

  it("blocks closure while work is outstanding but only warns about external proceedings", () => {
    const base = {
      status: "RECOVERY_MONITORING" as const,
      openTasks: 0,
      openSubFiles: 0,
      undecidedFindings: 0,
      decidedFindings: 1,
      pendingExpenses: 0,
      unverifiedRecoveries: 0,
      outstandingAdvances: 0,
      activeCriminalMatters: 1,
      activeCivilMatters: 0,
      pendingWriteOffs: 0,
    };
    expect(closureBlocked(closureChecklist(base))).toBe(false);
    expect(closureChecklist(base).find((c) => c.key === "external")!.ok).toBe(false);
    expect(closureBlocked(closureChecklist({ ...base, openTasks: 2 }))).toBe(true);
    expect(closureBlocked(closureChecklist({ ...base, unverifiedRecoveries: 1 }))).toBe(true);
    expect(closureBlocked(closureChecklist({ ...base, status: "DRAFT" }))).toBe(true);
  });
});

describe("bad-cheque warnings", () => {
  const base: ChequeFacts = {
    status: "DISHONOURED",
    amount: "50000",
    dateDishonoured: "2026-03-01",
    demandDeadline: "2026-04-01",
    linkedInvoices: [{ invoiceAmount: "50000", amountPaid: "0" }],
    followUpTasks: 1,
    replacement: null,
  };
  const now = new Date("2026-03-15T00:00:00Z");
  const codes = (f: Partial<ChequeFacts>, at = now) => chequeWarnings({ ...base, ...f }, at).map((w) => w.code);

  it("raises no warning for a fully followed-up cheque", () => {
    expect(codes({})).toEqual([]);
  });
  it("warns when no invoice is linked", () => {
    expect(codes({ linkedInvoices: [] })).toContain("NO_LINKED_INVOICE");
  });
  it("warns when a dishonoured cheque has no follow-up task", () => {
    expect(codes({ followUpTasks: 0 })).toContain("NO_FOLLOW_UP_TASK");
    expect(codes({ followUpTasks: 0, status: "RECOVERED" })).not.toContain("NO_FOLLOW_UP_TASK");
  });
  it("warns when the demand deadline has passed", () => {
    expect(codes({}, new Date("2026-04-02T00:00:00Z"))).toContain("DEMAND_DEADLINE_PASSED");
  });
  it("warns when the replacement cheque is also dishonoured", () => {
    expect(codes({ replacement: { status: "DISHONOURED", dateDishonoured: null } })).toContain("REPLACEMENT_DISHONOURED");
    expect(codes({ replacement: { status: "CLEARED", dateDishonoured: null } })).not.toContain("REPLACEMENT_DISHONOURED");
  });
  it("warns when the amount differs from linked invoice balances", () => {
    expect(codes({ linkedInvoices: [{ invoiceAmount: "60000", amountPaid: "5000" }] })).toContain("AMOUNT_MISMATCH");
  });
});

describe("reminders", () => {
  const now = new Date("2026-09-30T09:00:00+03:00");
  it("classifies deadlines in Nairobi calendar days", () => {
    expect(daysUntil(new Date("2026-10-01T08:00:00+03:00"), now)).toBe(1);
    expect(deadlineState({ status: "IN_PROGRESS", dueDate: "2026-09-29T12:00:00+03:00" }, now)).toBe("OVERDUE");
    expect(deadlineState({ status: "IN_PROGRESS", dueDate: "2026-09-30T23:00:00+03:00" }, now)).toBe("DUE_TODAY");
    expect(deadlineState({ status: "NOT_STARTED", dueDate: "2026-10-02T00:00:00+03:00" }, now)).toBe("DUE_SOON");
    expect(deadlineState({ status: "NOT_STARTED", dueDate: "2026-10-20T00:00:00+03:00" }, now)).toBe("ON_TRACK");
    expect(deadlineState({ status: "COMPLETED", dueDate: "2026-09-01T00:00:00+03:00" }, now)).toBe("DONE");
    expect(deadlineState({ status: "NOT_STARTED", dueDate: null }, now)).toBe("NO_DUE_DATE");
  });
  it("shows open overdue tasks as overdue", () => {
    expect(effectiveTaskStatus({ status: "IN_PROGRESS", dueDate: "2026-09-01" }, now)).toBe("OVERDUE");
    expect(effectiveTaskStatus({ status: "CANCELLED", dueDate: "2026-09-01" }, now)).toBe("CANCELLED");
  });
  it("detects inactive open cases only", () => {
    expect(isCaseInactive({ status: "UNDER_INTERNAL_INVESTIGATION", lastActivityAt: "2026-09-01" }, now)).toBe(true);
    expect(isCaseInactive({ status: "CLOSED", lastActivityAt: "2026-01-01" }, now)).toBe(false);
    expect(isCaseInactive({ status: "UNDER_INTERNAL_INVESTIGATION", lastActivityAt: "2026-09-25" }, now)).toBe(false);
  });
});

describe("masking", () => {
  it("masks financial identifiers and personal data", () => {
    expect(maskAccount("0123456789")).toBe("••••••6789");
    expect(maskPhone("0712345678")).toBe("0712•••678");
    expect(maskId("12345678")).toBe("•••••678");
    expect(maskAccount(null)).toBeNull();
  });
  it("normalises Kenyan phone numbers", () => {
    expect(normalisePhone("0712 345 678")).toBe("254712345678");
    expect(normalisePhone("+254712345678")).toBe("254712345678");
    expect(normalisePhone("712345678")).toBe("254712345678");
    expect(normalisePhone("12")).toBeNull();
  });
});

describe("enums", () => {
  it("mirror the Prisma schema exactly", () => {
    for (const [name, values] of Object.entries(ENUMS)) {
      const prismaEnum = ($Enums as unknown as Record<string, Record<string, string>>)[name];
      expect(prismaEnum, `Prisma enum ${name}`).toBeDefined();
      expect([...values]).toEqual(Object.values(prismaEnum!));
    }
  });
  it("labels values readably", () => {
    expect(enumLabel("UNDER_INTERNAL_INVESTIGATION")).toBe("Under internal investigation");
    expect(enumLabel("MPESA_PAID_TO_PERSONAL_NUMBER")).toBe("M-Pesa paid to personal number");
    expect(enumLabel("DPP_DIRECTIONS_RECEIVED")).toBe("DPP directions received");
  });
});
