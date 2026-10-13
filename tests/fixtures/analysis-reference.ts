// Reference implementation: the original, straightforward O(n²) statement analysis, kept only as a
// test oracle for src/lib/statements/analysis.ts (see analysis-equivalence.test.ts). Not used by the app.
// Automated statement analysis. Everything here produces INVESTIGATIVE LEADS that require human
// verification — never findings or proof. Pure functions over plain data.
import { money, sum, type Decimal } from "@/lib/money";
import { normalisePhone } from "@/lib/masking";

export const FLAGS = ["DIRECT_TRANSFER", "REPEATED_TRANSFER", "SPLIT_TRANSACTION", "CIRCULAR_MOVEMENT", "ROUND_FIGURE", "RAPID_WITHDRAWAL", "INVOICE_DATE_MATCH", "UNKNOWN_COUNTERPARTY"] as const;
export type Flag = (typeof FLAGS)[number];

export const FLAG_LABELS: Record<Flag, string> = {
  DIRECT_TRANSFER: "Direct transfer with a person of interest",
  REPEATED_TRANSFER: "Repeated transfers to the same counterparty",
  SPLIT_TRANSACTION: "Possible split transaction",
  CIRCULAR_MOVEMENT: "Possible circular money movement",
  ROUND_FIGURE: "Round-figure payment",
  RAPID_WITHDRAWAL: "Rapid withdrawal after a credit",
  INVOICE_DATE_MATCH: "Matches an invoice date and amount",
  UNKNOWN_COUNTERPARTY: "Unknown counterparty",
};

export interface Txn {
  id: string;
  statementId: string;
  txnDate: Date;
  reference: string | null;
  description: string;
  debit: string;
  credit: string;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  counterpartyAccount: string | null;
}

export interface KnownEntity {
  id: string;
  kind: "PARTY" | "STATEMENT_OWNER" | "KNOWN_ACCOUNT";
  name: string;
  phones: string[];
  accounts: string[];
  /** Parties of interest (suspects, persons of interest, employees under review). */
  ofInterest: boolean;
}

export interface InvoiceRef {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceAmount: string;
  outstanding: string;
  customerName: string;
  deliveryNoteNumber: string | null;
}

export interface ChequeRef {
  id: string;
  chequeNumber: string;
  amount: string;
  issuer: string;
}

const DAY = 86_400_000;
const amountOf = (t: Txn): Decimal => (money(t.debit).greaterThan(0) ? money(t.debit) : money(t.credit));
const isDebit = (t: Txn) => money(t.debit).greaterThan(0);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function counterpartyKey(t: Pick<Txn, "counterpartyPhone" | "counterpartyAccount" | "counterpartyName">): string | null {
  if (t.counterpartyPhone) return `tel:${normalisePhone(t.counterpartyPhone)}`;
  if (t.counterpartyAccount) return `acc:${t.counterpartyAccount}`;
  if (t.counterpartyName) return `name:${nameTokens(t.counterpartyName).join(" ")}`;
  return null;
}

// ───────────────────── Name similarity ─────────────────────

const STOP = new Set(["ltd", "limited", "co", "company", "and", "the", "enterprises", "ent", "mr", "mrs", "ms", "dr"]);
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .sort();
}

/** Jaccard similarity of name tokens (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// ───────────────────── Entity resolution ─────────────────────

export function resolveEntity(t: Txn, entities: KnownEntity[]): KnownEntity | null {
  const phone = t.counterpartyPhone ? normalisePhone(t.counterpartyPhone) : null;
  for (const e of entities) {
    if (phone && e.phones.some((p) => normalisePhone(p) === phone)) return e;
    if (t.counterpartyAccount && e.accounts.includes(t.counterpartyAccount)) return e;
  }
  if (t.counterpartyName) {
    let best: KnownEntity | null = null;
    let score = 0;
    for (const e of entities) {
      const s = nameSimilarity(t.counterpartyName, e.name);
      if (s > score) {
        score = s;
        best = e;
      }
    }
    if (best && score >= 0.6) return best;
  }
  return null;
}

// ───────────────────── Pattern flags ─────────────────────

export interface AnalysisContext {
  entities: KnownEntity[];
  invoices: InvoiceRef[];
  /** Owner entity id of each statement (for circular movement across statements). */
  statementOwner: Record<string, string | undefined>;
}

export function detectFlags(txns: Txn[], ctx: AnalysisContext): Map<string, Set<Flag>> {
  const flags = new Map<string, Set<Flag>>(txns.map((t) => [t.id, new Set<Flag>()]));
  const add = (id: string, f: Flag) => flags.get(id)!.add(f);
  const sorted = [...txns].sort((a, b) => a.txnDate.getTime() - b.txnDate.getTime());
  const resolved = new Map(sorted.map((t) => [t.id, resolveEntity(t, ctx.entities)]));

  for (const t of sorted) {
    const amount = amountOf(t);
    const entity = resolved.get(t.id);
    if (entity?.ofInterest) add(t.id, "DIRECT_TRANSFER");
    if (!entity && (t.counterpartyName || t.counterpartyPhone || t.counterpartyAccount)) add(t.id, "UNKNOWN_COUNTERPARTY");
    if (amount.greaterThanOrEqualTo(1000) && amount.mod(1000).isZero()) add(t.id, "ROUND_FIGURE");
    for (const inv of ctx.invoices) {
      if (dayKey(inv.invoiceDate) !== dayKey(t.txnDate)) continue;
      const target = [money(inv.invoiceAmount), money(inv.outstanding)];
      if (target.some((x) => x.greaterThan(0) && amount.minus(x).abs().lessThanOrEqualTo(x.times(0.01)))) {
        add(t.id, "INVOICE_DATE_MATCH");
        break;
      }
    }
  }

  // Group by counterparty for repeated, split and circular patterns (per statement).
  const byParty = new Map<string, Txn[]>();
  for (const t of sorted) {
    const k = counterpartyKey(t);
    if (!k) continue;
    const key = `${t.statementId}|${k}`;
    byParty.set(key, [...(byParty.get(key) ?? []), t]);
  }
  for (const list of byParty.values()) {
    const debits = list.filter(isDebit);
    // Repeated: 3+ debits to the same counterparty within 30 days.
    for (let i = 0; i < debits.length; i++) {
      const window = debits.filter((x) => x.txnDate.getTime() >= debits[i]!.txnDate.getTime() && x.txnDate.getTime() - debits[i]!.txnDate.getTime() <= 30 * DAY);
      if (window.length >= 3) window.forEach((x) => add(x.id, "REPEATED_TRANSFER"));
    }
    // Split: 2+ debits to the same counterparty on the same day, each well below the day's total.
    const byDay = new Map<string, Txn[]>();
    for (const d of debits) byDay.set(dayKey(d.txnDate), [...(byDay.get(dayKey(d.txnDate)) ?? []), d]);
    for (const day of byDay.values()) {
      if (day.length < 2) continue;
      const total = sum(day.map((x) => x.debit));
      if (day.every((x) => money(x.debit).lessThan(total.times(0.7)))) day.forEach((x) => add(x.id, "SPLIT_TRANSACTION"));
    }
    // Circular (within one statement): money out to X and back from X of a similar amount within 14 days.
    for (const out of debits) {
      const back = list.find(
        (x) =>
          !isDebit(x) &&
          x.txnDate.getTime() >= out.txnDate.getTime() &&
          x.txnDate.getTime() - out.txnDate.getTime() <= 14 * DAY &&
          money(x.credit).minus(out.debit).abs().lessThanOrEqualTo(money(out.debit).times(0.1)),
      );
      if (back) {
        add(out.id, "CIRCULAR_MOVEMENT");
        add(back.id, "CIRCULAR_MOVEMENT");
      }
    }
  }

  // Circular across statements: owner A pays B, and B's statement shows money going back to A.
  const ownerOf = ctx.statementOwner;
  for (const t of sorted.filter(isDebit)) {
    const to = resolved.get(t.id);
    const from = ownerOf[t.statementId];
    if (!to || !from || to.kind !== "STATEMENT_OWNER") continue;
    const reverse = sorted.find(
      (x) => isDebit(x) && ownerOf[x.statementId] === to.id && resolved.get(x.id)?.id === from && x.txnDate.getTime() >= t.txnDate.getTime() && x.txnDate.getTime() - t.txnDate.getTime() <= 30 * DAY,
    );
    if (reverse) {
      add(t.id, "CIRCULAR_MOVEMENT");
      add(reverse.id, "CIRCULAR_MOVEMENT");
    }
  }

  // Rapid withdrawal: a credit followed within 24 hours by debits totalling at least 80% of it.
  const byStatement = new Map<string, Txn[]>();
  for (const t of sorted) byStatement.set(t.statementId, [...(byStatement.get(t.statementId) ?? []), t]);
  for (const list of byStatement.values()) {
    for (const c of list.filter((x) => !isDebit(x) && money(x.credit).greaterThanOrEqualTo(1000))) {
      const after = list.filter((x) => isDebit(x) && x.txnDate.getTime() >= c.txnDate.getTime() && x.txnDate.getTime() - c.txnDate.getTime() <= DAY);
      if (after.length && sum(after.map((x) => x.debit)).greaterThanOrEqualTo(money(c.credit).times(0.8))) {
        add(c.id, "RAPID_WITHDRAWAL");
        after.forEach((x) => add(x.id, "RAPID_WITHDRAWAL"));
      }
    }
  }
  return flags;
}

// ───────────────────── Link suggestions ─────────────────────

export type LinkClass = "VERIFIED_DIRECT_MATCH" | "EXACT_REFERENCE_MATCH" | "PROBABLE_NAME_MATCH" | "TELEPHONE_NUMBER_MATCH" | "USER_CONFIRMED_MATCH" | "UNRESOLVED_POSSIBLE_MATCH";

export interface LinkSuggestion {
  transactionId: string;
  targetType: "PARTY" | "STATEMENT_OWNER" | "INVOICE" | "CHEQUE" | "KNOWN_ACCOUNT";
  targetId: string;
  targetLabel: string;
  linkClass: LinkClass;
  score: number;
  rationale: string;
}

export function suggestLinks(txns: Txn[], ctx: AnalysisContext & { cheques: ChequeRef[] }): LinkSuggestion[] {
  const out: LinkSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: LinkSuggestion) => {
    const key = `${s.transactionId}|${s.targetType}|${s.targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  for (const t of txns) {
    const phone = t.counterpartyPhone ? normalisePhone(t.counterpartyPhone) : null;
    const text = `${t.reference ?? ""} ${t.description}`.toUpperCase();
    for (const e of ctx.entities) {
      if (t.counterpartyAccount && e.accounts.includes(t.counterpartyAccount)) {
        push({
          transactionId: t.id,
          targetType: e.kind,
          targetId: e.id,
          targetLabel: e.name,
          linkClass: "VERIFIED_DIRECT_MATCH",
          score: 95,
          rationale: `Account ${t.counterpartyAccount} matches an account recorded for ${e.name}.`,
        });
      } else if (phone && e.phones.some((p) => normalisePhone(p) === phone)) {
        push({ transactionId: t.id, targetType: e.kind, targetId: e.id, targetLabel: e.name, linkClass: "TELEPHONE_NUMBER_MATCH", score: 85, rationale: `Telephone number matches ${e.name}.` });
      } else if (t.counterpartyName) {
        const s = nameSimilarity(t.counterpartyName, e.name);
        if (s >= 0.6)
          push({
            transactionId: t.id,
            targetType: e.kind,
            targetId: e.id,
            targetLabel: e.name,
            linkClass: "PROBABLE_NAME_MATCH",
            score: Math.round(50 + s * 30),
            rationale: `Counterparty name "${t.counterpartyName}" resembles ${e.name} (${Math.round(s * 100)}% token overlap).`,
          });
        else if (s >= 0.34)
          push({
            transactionId: t.id,
            targetType: e.kind,
            targetId: e.id,
            targetLabel: e.name,
            linkClass: "UNRESOLVED_POSSIBLE_MATCH",
            score: Math.round(20 + s * 40),
            rationale: `Partial name overlap between "${t.counterpartyName}" and ${e.name}.`,
          });
      }
    }
    for (const inv of ctx.invoices) {
      const ref = inv.invoiceNumber.toUpperCase();
      if (ref.length >= 4 && new RegExp(`(^|[^A-Z0-9])${escapeRegex(ref)}([^A-Z0-9]|$)`).test(text)) {
        push({
          transactionId: t.id,
          targetType: "INVOICE",
          targetId: inv.id,
          targetLabel: `Invoice ${inv.invoiceNumber}`,
          linkClass: "EXACT_REFERENCE_MATCH",
          score: 90,
          rationale: `Reference or narrative contains invoice number ${inv.invoiceNumber}.`,
        });
      } else if (inv.deliveryNoteNumber && inv.deliveryNoteNumber.length >= 4 && text.includes(inv.deliveryNoteNumber.toUpperCase())) {
        push({
          transactionId: t.id,
          targetType: "INVOICE",
          targetId: inv.id,
          targetLabel: `Invoice ${inv.invoiceNumber}`,
          linkClass: "EXACT_REFERENCE_MATCH",
          score: 85,
          rationale: `Narrative contains delivery note ${inv.deliveryNoteNumber}.`,
        });
      } else if (
        dayKey(inv.invoiceDate) === dayKey(t.txnDate) &&
        amountOf(t).minus(inv.invoiceAmount).abs().lessThanOrEqualTo(money(inv.invoiceAmount).times(0.01)) &&
        money(inv.invoiceAmount).greaterThan(0)
      ) {
        push({
          transactionId: t.id,
          targetType: "INVOICE",
          targetId: inv.id,
          targetLabel: `Invoice ${inv.invoiceNumber}`,
          linkClass: "UNRESOLVED_POSSIBLE_MATCH",
          score: 40,
          rationale: `Same date and amount as invoice ${inv.invoiceNumber} (${inv.customerName}).`,
        });
      }
    }
    for (const ch of ctx.cheques) {
      if (ch.chequeNumber.length >= 4 && new RegExp(`(^|[^0-9])${escapeRegex(ch.chequeNumber)}([^0-9]|$)`).test(text)) {
        push({
          transactionId: t.id,
          targetType: "CHEQUE",
          targetId: ch.id,
          targetLabel: `Cheque ${ch.chequeNumber}`,
          linkClass: "EXACT_REFERENCE_MATCH",
          score: 90,
          rationale: `Narrative contains cheque number ${ch.chequeNumber}.`,
        });
      }
    }
  }
  return out;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ───────────────────── Money-movement aggregation ─────────────────────

export interface FlowEdge {
  from: string;
  to: string;
  total: string;
  count: number;
}

/** Aggregates transactions into directed flows between the statement owner and counterparties. */
export function aggregateFlows(txns: (Txn & { ownerKey: string; ownerLabel: string })[], labelFor: (t: Txn) => { key: string; label: string }) {
  const nodes = new Map<string, { id: string; label: string; kind: "OWNER" | "COUNTERPARTY"; inflow: Decimal; outflow: Decimal }>();
  const edges = new Map<string, { from: string; to: string; total: Decimal; count: number }>();
  const node = (id: string, label: string, kind: "OWNER" | "COUNTERPARTY") => {
    const existing = nodes.get(id);
    if (existing) {
      if (kind === "OWNER") existing.kind = "OWNER";
      return existing;
    }
    const n = { id, label, kind, inflow: money(0), outflow: money(0) };
    nodes.set(id, n);
    return n;
  };
  for (const t of txns) {
    const owner = node(t.ownerKey, t.ownerLabel, "OWNER");
    const cp = labelFor(t);
    const other = node(cp.key, cp.label, "COUNTERPARTY");
    const debit = money(t.debit);
    const [from, to, amount] = debit.greaterThan(0) ? [owner, other, debit] : [other, owner, money(t.credit)];
    from.outflow = from.outflow.plus(amount);
    to.inflow = to.inflow.plus(amount);
    const key = `${from.id}→${to.id}`;
    const e = edges.get(key) ?? { from: from.id, to: to.id, total: money(0), count: 0 };
    e.total = e.total.plus(amount);
    e.count++;
    edges.set(key, e);
  }
  return {
    nodes: [...nodes.values()].map((n) => ({ ...n, inflow: n.inflow.toFixed(2), outflow: n.outflow.toFixed(2) })),
    edges: [...edges.values()].map((e) => ({ ...e, total: e.total.toFixed(2) })),
  };
}
