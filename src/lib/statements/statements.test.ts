import { describe, expect, it } from "vitest";
import { detectColumns, normalizeRows, parseAmount, parseNarrative, parsePdfText } from "./normalize";
import { aggregateFlows, detectFlags, nameSimilarity, suggestLinks, type AnalysisContext, type Txn } from "./analysis";

describe("statement normalisation", () => {
  it("recognises common bank and M-Pesa headers", () => {
    expect(detectColumns(["Receipt No.", "Completion Time", "Details", "Transaction Status", "Paid In", "Withdrawn", "Balance"])).toMatchObject({
      reference: "Receipt No.",
      datetime: "Completion Time",
      description: "Details",
      credit: "Paid In",
      debit: "Withdrawn",
      balance: "Balance",
    });
    expect(detectColumns(["Transaction Date", "Narrative", "Debit Amount", "Credit Amount", "Ledger Balance"])).toMatchObject({
      txnDate: "Transaction Date",
      debit: "Debit Amount",
      credit: "Credit Amount",
    });
  });

  it("parses amount formats exactly", () => {
    expect(parseAmount("1,234.50")).toBe("1234.50");
    expect(parseAmount("(1,000.00)")).toBe("-1000.00");
    expect(parseAmount("250.00 DR")).toBe("-250.00");
    expect(parseAmount("KES 99.9")).toBe("99.90");
    expect(parseAmount("-40000.00")).toBe("-40000.00");
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("n/a")).toBeNull();
  });

  it("extracts counterparties from M-Pesa and bank narratives", () => {
    expect(parseNarrative("Customer Transfer to 0722000222 - GRACE WANJIKU FICTIONAL")).toEqual({ name: "GRACE WANJIKU FICTIONAL", phone: "254722000222", account: null });
    expect(parseNarrative("MPESA RECEIVED FROM 254711000111 BRIAN OTIENO FICTIONAL").phone).toBe("254711000111");
    expect(parseNarrative("Pay Bill to 888111 - FICTIONAL SACCO Acc. 5521")).toMatchObject({ name: "FICTIONAL SACCO", account: "888111" });
    expect(parseNarrative("TRF TO BRIAN OTIENO FICTIONAL A/C 0100200300")).toMatchObject({ name: "BRIAN OTIENO FICTIONAL", account: "0100200300" });
    expect(parseNarrative("Funds received from 254700333444 - LAKESIDE KIOSK FICTIONAL INV-DEMO-1003").name).toBe("LAKESIDE KIOSK FICTIONAL");
  });

  it("normalises rows, splitting signed amounts and skipping unreadable rows", () => {
    const { transactions, warnings } = normalizeRows(
      [
        { Date: "02/03/2026", Details: "Salary", Amount: "5,000.00", Balance: "5000" },
        { Date: "03/03/2026", Details: "ATM", Amount: "-1,200.50", Balance: "3799.50" },
        { Date: "not a date", Details: "Header repeat", Amount: "0" },
        { Date: "04/03/2026", Details: "Zero", Amount: "0" },
      ],
      ["Date", "Details", "Amount", "Balance"],
    );
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ credit: "5000.00", debit: "0.00" });
    expect(transactions[1]).toMatchObject({ debit: "1200.50", credit: "0.00", balance: "3799.50" });
    expect(transactions[0]!.txnDate.toISOString().slice(0, 10)).toBe("2026-03-02");
    expect(warnings.some((w) => w.includes("unreadable date"))).toBe(true);
  });

  it("parses text extracted from a statement PDF", () => {
    const text = [
      "FICTIONAL M-PESA STATEMENT",
      "2026-03-02 09:14:00 SIM0000001 Funds received from 254700111222 - KISUMU FRESH MART 84,500.00 86,000.00",
      "2026-03-02 10:02:00 SIM0000002 Customer Transfer to 0722000222 - GRACE WANJIKU 40,000.00 46,000.00",
    ].join("\n");
    const { transactions } = parsePdfText(text);
    expect(transactions).toHaveLength(2);
    expect(transactions[0]).toMatchObject({ reference: "SIM0000001", credit: "84500.00" });
    expect(transactions[1]).toMatchObject({ debit: "40000.00", counterpartyPhone: "254722000222" });
  });

  it("cuts overlong parsed text to the column sizes instead of failing the statement", () => {
    const { transactions } = normalizeRows(
      [{ Date: "02/03/2026", Reference: "R".repeat(400), Time: "T".repeat(250), Details: "D".repeat(1500), Amount: "10.00" }],
      ["Date", "Reference", "Time", "Details", "Amount"],
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.reference).toHaveLength(300);
    expect(transactions[0]!.txnTime).toHaveLength(191);
    expect(transactions[0]!.description).toHaveLength(1000);
  });
});

const d = (s: string) => new Date(s);
const txn = (id: string, date: string, debit: string, credit: string, extra: Partial<Txn> = {}): Txn => ({
  id,
  statementId: "S1",
  txnDate: d(date),
  reference: null,
  description: "x",
  debit,
  credit,
  counterpartyName: null,
  counterpartyPhone: null,
  counterpartyAccount: null,
  ...extra,
});

describe("pattern detection (leads, not proof)", () => {
  const ctx: AnalysisContext = {
    entities: [{ id: "P1", kind: "PARTY", name: "Grace Wanjiku", phones: ["0722000222"], accounts: ["0100200300"], ofInterest: true }],
    invoices: [{ id: "I1", invoiceNumber: "INV-7", invoiceDate: d("2026-03-05"), invoiceAmount: "56250.00", outstanding: "56250.00", customerName: "Lakeside", deliveryNoteNumber: null }],
    statementOwner: { S1: "OWNER" },
  };
  const grace = { counterpartyPhone: "0722000222", counterpartyName: "GRACE WANJIKU" };
  const txns = [
    txn("t1", "2026-03-02T09:00:00Z", "0", "84500.00"),
    txn("t2", "2026-03-02T10:00:00Z", "40000.00", "0", grace),
    txn("t3", "2026-03-02T11:00:00Z", "30000.00", "0", grace),
    txn("t4", "2026-03-05T08:00:00Z", "0", "56250.00", { reference: "SIM5" }),
    txn("t5", "2026-03-09T08:00:00Z", "15000.00", "0", grace),
    txn("t6", "2026-03-12T08:00:00Z", "0", "39500.00", grace),
    txn("t7", "2026-03-15T08:00:00Z", "5000.00", "0", { counterpartyPhone: "0733555666", counterpartyName: "SOMEONE ELSE" }),
  ];
  const flags = detectFlags(txns, ctx);
  const has = (id: string, f: string) => flags.get(id)!.has(f as never);

  it("flags direct transfers with persons of interest", () => expect(has("t2", "DIRECT_TRANSFER")).toBe(true));
  it("flags unknown counterparties", () => expect(has("t7", "UNKNOWN_COUNTERPARTY")).toBe(true));
  it("flags round figures", () => {
    expect(has("t2", "ROUND_FIGURE")).toBe(true);
    expect(has("t4", "ROUND_FIGURE")).toBe(false);
  });
  it("flags split transfers on the same day", () => expect(has("t2", "SPLIT_TRANSACTION") && has("t3", "SPLIT_TRANSACTION")).toBe(true));
  it("flags repeated transfers within 30 days", () => expect(has("t5", "REPEATED_TRANSFER")).toBe(true));
  it("flags rapid withdrawal after a credit", () => expect(has("t1", "RAPID_WITHDRAWAL")).toBe(true));
  it("flags money going out and coming back (40,000 out, 39,500 back within 14 days)", () => {
    expect(has("t2", "CIRCULAR_MOVEMENT") && has("t6", "CIRCULAR_MOVEMENT")).toBe(true);
    expect(has("t7", "CIRCULAR_MOVEMENT")).toBe(false);
  });
  it("flags transactions matching an invoice date and amount", () => expect(has("t4", "INVOICE_DATE_MATCH")).toBe(true));

  it("suggests links with the right classes", () => {
    const links = suggestLinks([...txns, txn("t8", "2026-03-20T08:00:00Z", "100.00", "0", { description: "Payment for INV-7", counterpartyAccount: "0100200300" })], {
      ...ctx,
      cheques: [{ id: "C1", chequeNumber: "000451", amount: "1", issuer: "x" }],
    });
    expect(links.find((l) => l.transactionId === "t2")?.linkClass).toBe("TELEPHONE_NUMBER_MATCH");
    expect(
      links
        .filter((l) => l.transactionId === "t8")
        .map((l) => l.linkClass)
        .sort(),
    ).toEqual(["EXACT_REFERENCE_MATCH", "VERIFIED_DIRECT_MATCH"]);
    expect(links.find((l) => l.transactionId === "t4")?.linkClass).toBe("UNRESOLVED_POSSIBLE_MATCH");
    expect(links.every((l) => l.score >= 0 && l.score <= 100)).toBe(true);
  });

  it("compares names by token overlap", () => {
    expect(nameSimilarity("GRACE WANJIKU", "Wanjiku Grace")).toBe(1);
    expect(nameSimilarity("Fresh Mart Ltd", "Fresh Mart")).toBe(1);
    expect(nameSimilarity("John Doe", "Jane Roe")).toBe(0);
  });

  it("aggregates flows exactly", () => {
    const flows = aggregateFlows(
      txns.map((t) => ({ ...t, ownerKey: "OWNER", ownerLabel: "Owner" })),
      (t) => ({ key: t.counterpartyPhone ?? "other", label: t.counterpartyName ?? "Other" }),
    );
    const out = flows.edges.find((e) => e.from === "OWNER" && e.to === "0722000222");
    expect(out).toMatchObject({ total: "85000.00", count: 3 });
  });
});
