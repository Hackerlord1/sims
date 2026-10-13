import { describe, expect, it } from "vitest";
import * as reference from "../../../tests/fixtures/analysis-reference";
import { detectFlags, limitWeakNameMatches, suggestLinks, type ChequeRef, type InvoiceRef, type KnownEntity, type Txn } from "@/lib/statements/analysis";

// The optimised detectors must give exactly the same flags and suggestions as the original
// straightforward implementation, on many random fictional datasets dense enough to trigger every rule.

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dataset(seed: number) {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
  const names = ["Achieng Otieno", "Baraka Mutua", "Chebet Kiprono", "Daudi Wafula", "Esther Njoroge", "Faraji Akinyi", "Achieng Otieno Ltd", "Unknown Trader"];
  const phones = ["0711000111", "+254711000222", "0711000333", "0711000444", null];
  const entities: KnownEntity[] = [
    { id: "p1", kind: "PARTY", name: "Achieng Otieno", phones: ["0711000111"], accounts: ["ACC-1"], ofInterest: true },
    { id: "p2", kind: "PARTY", name: "Baraka Mutua", phones: ["254711000222"], accounts: [], ofInterest: false },
    { id: "o1", kind: "STATEMENT_OWNER", name: "Chebet Kiprono", phones: ["0711000333"], accounts: ["ACC-3"], ofInterest: true },
    { id: "o2", kind: "STATEMENT_OWNER", name: "Daudi Wafula", phones: ["0711000444"], accounts: [], ofInterest: false },
    { id: "k1", kind: "KNOWN_ACCOUNT", name: "Esther Njoroge", phones: [], accounts: ["ACC-5"], ofInterest: false },
  ];
  const start = Date.UTC(2026, 0, 1);
  const txns: Txn[] = Array.from({ length: int(40, 160) }, (_, i) => {
    const out = r() < 0.55;
    const amount = r() < 0.3 ? `${int(1, 60) * 1000}.00` : (int(100, 9_000_000) / 100).toFixed(2);
    const phone = pick(phones);
    return {
      id: `t${i}`,
      statementId: pick(["s1", "s2"]),
      // Dense in time (0–40 days, often the same day) so the window rules fire.
      txnDate: new Date(start + int(0, 40) * 86_400_000 + (r() < 0.3 ? int(0, 20) * 3_600_000 : 0)),
      reference: r() < 0.1 ? "INV-1001" : r() < 0.1 ? "CHQ 004512" : `R${i}`,
      description: r() < 0.1 ? "Payment DN-7788 goods" : `Transfer ${i}`,
      debit: out ? amount : "0",
      credit: out ? "0" : amount,
      counterpartyName: r() < 0.85 ? pick(names) : null,
      counterpartyPhone: phone,
      counterpartyAccount: r() < 0.15 ? pick(["ACC-1", "ACC-3", "ACC-5", "ACC-9"]) : null,
    };
  });
  const invoices: InvoiceRef[] = [
    {
      id: "i1",
      invoiceNumber: "INV-1001",
      invoiceDate: new Date(start + 3 * 86_400_000),
      invoiceAmount: "5000.00",
      outstanding: "2500.00",
      customerName: "Fictional A",
      deliveryNoteNumber: "DN-7788",
    },
    { id: "i2", invoiceNumber: "INV-2002", invoiceDate: new Date(start + 10 * 86_400_000), invoiceAmount: "12000.00", outstanding: "12000.00", customerName: "Fictional B", deliveryNoteNumber: null },
  ];
  const cheques: ChequeRef[] = [{ id: "c1", chequeNumber: "004512", amount: "3000.00", issuer: "Fictional C" }];
  return { txns, ctx: { entities, invoices, cheques, statementOwner: { s1: "o1", s2: "o2" } } };
}

const asSorted = (m: Map<string, Set<string>>) => Object.fromEntries([...m].map(([k, v]) => [k, [...v].sort()]));

describe("optimised statement analysis matches the reference implementation", () => {
  it("gives identical flags on 300 random datasets", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { txns, ctx } = dataset(seed);
      expect(asSorted(detectFlags(txns, ctx)), `seed ${seed}`).toEqual(asSorted(reference.detectFlags(txns, ctx)));
    }
  });

  it("gives identical link suggestions (after the weak-match limit) on 300 random datasets", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { txns, ctx } = dataset(seed);
      expect(suggestLinks(txns, ctx), `seed ${seed}`).toEqual(limitWeakNameMatches(reference.suggestLinks(txns, ctx)));
    }
  });

  it("every rule fires somewhere in the random datasets", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const { txns, ctx } = dataset(seed);
      for (const f of detectFlags(txns, ctx).values()) f.forEach((x) => seen.add(x));
    }
    expect([...seen].sort()).toEqual([
      "CIRCULAR_MOVEMENT",
      "DIRECT_TRANSFER",
      "INVOICE_DATE_MATCH",
      "RAPID_WITHDRAWAL",
      "REPEATED_TRANSFER",
      "ROUND_FIGURE",
      "SPLIT_TRANSACTION",
      "UNKNOWN_COUNTERPARTY",
    ]);
  });

  it("analyses 100,000 transactions in seconds, not minutes", () => {
    const { ctx } = dataset(1);
    const big: Txn[] = [];
    for (let s = 0; big.length < 100_000; s++) for (const t of dataset(s + 1).txns) big.push({ ...t, id: `${s}-${t.id}`, txnDate: new Date(t.txnDate.getTime() + s * 3_600_000) });
    const started = performance.now();
    detectFlags(big.slice(0, 100_000), ctx);
    suggestLinks(big.slice(0, 100_000), ctx);
    expect(performance.now() - started).toBeLessThan(30_000);
  }, 60_000);

  it("keeps a weak name overlap only when nothing stronger matches, and only the best one", () => {
    const base = { targetLabel: "x", rationale: "x" };
    const kept = limitWeakNameMatches([
      { ...base, transactionId: "a", targetType: "PARTY", targetId: "p1", linkClass: "UNRESOLVED_POSSIBLE_MATCH", score: 30 },
      { ...base, transactionId: "a", targetType: "PARTY", targetId: "p2", linkClass: "UNRESOLVED_POSSIBLE_MATCH", score: 38 },
      { ...base, transactionId: "a", targetType: "INVOICE", targetId: "i1", linkClass: "UNRESOLVED_POSSIBLE_MATCH", score: 40 },
      { ...base, transactionId: "b", targetType: "PARTY", targetId: "p1", linkClass: "TELEPHONE_NUMBER_MATCH", score: 85 },
      { ...base, transactionId: "b", targetType: "STATEMENT_OWNER", targetId: "o1", linkClass: "UNRESOLVED_POSSIBLE_MATCH", score: 38 },
    ]);
    expect(kept.map((k) => `${k.transactionId}:${k.targetId}`)).toEqual(["a:p2", "a:i1", "b:p1"]);
  });
});
