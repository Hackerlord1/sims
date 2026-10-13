// Bad-cheque warnings required by the specification. Pure: the API loads the facts and the UI shows
// the result. Each warning carries a code so the UI never relies on colour alone.
import { money, sum, type MoneyInput } from "@/lib/money";
import { invoiceOutstanding } from "@/lib/finance";

export interface ChequeFacts {
  status: string;
  amount: MoneyInput;
  dateDishonoured: Date | string | null;
  demandDeadline: Date | string | null;
  linkedInvoices: { invoiceAmount: MoneyInput; amountPaid: MoneyInput }[];
  /** Follow-up tasks linked to this cheque that are not cancelled. */
  followUpTasks: number;
  replacement: { status: string; dateDishonoured: Date | string | null } | null;
}

export type ChequeWarningCode = "NO_LINKED_INVOICE" | "NO_FOLLOW_UP_TASK" | "DEMAND_DEADLINE_PASSED" | "REPLACEMENT_DISHONOURED" | "AMOUNT_MISMATCH";

export interface ChequeWarning {
  code: ChequeWarningCode;
  message: string;
}

const RESOLVED = new Set(["CLEARED", "RECOVERED", "WRITTEN_OFF"]);
const isDishonoured = (c: { status: string; dateDishonoured: Date | string | null }) => c.status === "DISHONOURED" || Boolean(c.dateDishonoured);

export function chequeWarnings(c: ChequeFacts, now: Date = new Date()): ChequeWarning[] {
  const out: ChequeWarning[] = [];
  if (c.linkedInvoices.length === 0) {
    out.push({ code: "NO_LINKED_INVOICE", message: "This cheque is not linked to any invoice." });
  }
  if (isDishonoured(c) && !RESOLVED.has(c.status) && c.followUpTasks === 0) {
    out.push({ code: "NO_FOLLOW_UP_TASK", message: "Dishonoured cheque has no follow-up task." });
  }
  if (c.demandDeadline && new Date(c.demandDeadline).getTime() < now.getTime() && !RESOLVED.has(c.status)) {
    out.push({ code: "DEMAND_DEADLINE_PASSED", message: "The demand deadline has passed without resolution." });
  }
  if (c.replacement && isDishonoured(c.replacement)) {
    out.push({ code: "REPLACEMENT_DISHONOURED", message: "The replacement cheque was also dishonoured." });
  }
  if (c.linkedInvoices.length > 0) {
    const balances = sum(c.linkedInvoices.map(invoiceOutstanding));
    if (!balances.equals(money(c.amount))) {
      out.push({
        code: "AMOUNT_MISMATCH",
        message: `Cheque amount differs from the linked invoice balances (${balances.toFixed(2)}).`,
      });
    }
  }
  return out;
}
