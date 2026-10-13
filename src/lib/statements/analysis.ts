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

/** Precomputed lookups over the known entities; building one per analysis run keeps matching linear. */
class EntityIndex {
  private readonly byPhone = new Map<string, number>();
  private readonly byAccount = new Map<string, number>();
  private readonly tokens: Set<string>[];
  private readonly similarityMemo = new Map<string, number[]>();

  constructor(readonly entities: KnownEntity[]) {
    entities.forEach((e, i) => {
      for (const p of e.phones) {
        const n = normalisePhone(p);
        if (n && !this.byPhone.has(n)) this.byPhone.set(n, i);
      }
      for (const a of e.accounts) if (!this.byAccount.has(a)) this.byAccount.set(a, i);
    });
    this.tokens = entities.map((e) => new Set(nameTokens(e.name)));
  }

  /** Name similarity of `name` against every entity, memoised because counterparty names repeat. */
  similarities(name: string): number[] {
    let s = this.similarityMemo.get(name);
    if (!s) {
      const ta = new Set(nameTokens(name));
      s = this.tokens.map((tb) => {
        if (!ta.size || !tb.size) return 0;
        let inter = 0;
        for (const t of ta) if (tb.has(t)) inter++;
        return inter / (ta.size + tb.size - inter);
      });
      this.similarityMemo.set(name, s);
    }
    return s;
  }

  /** Same rules as before: the first entity (in list order) with a matching phone or account, else the best name match ≥ 0.6. */
  resolve(t: Txn): KnownEntity | null {
    const phone = t.counterpartyPhone ? normalisePhone(t.counterpartyPhone) : null;
    const byPhone = phone ? this.byPhone.get(phone) : undefined;
    const byAccount = t.counterpartyAccount ? this.byAccount.get(t.counterpartyAccount) : undefined;
    const first = byPhone === undefined ? byAccount : byAccount === undefined ? byPhone : Math.min(byPhone, byAccount);
    if (first !== undefined) return this.entities[first]!;
    if (t.counterpartyName) {
      const s = this.similarities(t.counterpartyName);
      let best = -1;
      let score = 0;
      s.forEach((v, i) => {
        if (v > score) {
          score = v;
          best = i;
        }
      });
      if (best >= 0 && score >= 0.6) return this.entities[best]!;
    }
    return null;
  }
}

export function resolveEntity(t: Txn, entities: KnownEntity[]): KnownEntity | null {
  return new EntityIndex(entities).resolve(t);
}

/** A resolver to reuse across many transactions (builds the lookups once). */
export function entityResolver(entities: KnownEntity[]): (t: Txn) => KnownEntity | null {
  const index = new EntityIndex(entities);
  return (t) => index.resolve(t);
}

// ───────────────────── Pattern flags ─────────────────────

export interface AnalysisContext {
  entities: KnownEntity[];
  invoices: InvoiceRef[];
  /** Owner entity id of each statement (for circular movement across statements). */
  statementOwner: Record<string, string | undefined>;
}

/** Index of the first element whose time is ≥ `time` (times ascending). */
function lowerBound(times: number[], time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid]! < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index of the first element whose time is > `time` (times ascending). */
function upperBound(times: number[], time: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid]! <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function groupBy<T>(items: Iterable<T>, key: (t: T) => string | null): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Marks every index covered by at least one [from, to] range; a difference array makes each range O(1). */
class RangeMarker {
  private readonly diff: Int32Array;
  constructor(size: number) {
    this.diff = new Int32Array(size + 1);
  }
  mark(from: number, to: number) {
    this.diff[from]!++;
    this.diff[to + 1]!--;
  }
  forEachMarked(fn: (index: number) => void) {
    let running = 0;
    for (let i = 0; i < this.diff.length - 1; i++) {
      running += this.diff[i]!;
      if (running > 0) fn(i);
    }
  }
}

interface Row {
  t: Txn;
  time: number;
  debit: Decimal;
  credit: Decimal;
  isDebit: boolean;
}

/**
 * Pattern detection over a case's transactions. Transactions are sorted by time once; each detector
 * then uses grouping, binary search and prefix sums, so the cost grows roughly as n·log n.
 */
export function detectFlags(txns: Txn[], ctx: AnalysisContext): Map<string, Set<Flag>> {
  const flags = new Map<string, Set<Flag>>(txns.map((t) => [t.id, new Set<Flag>()]));
  const add = (id: string, f: Flag) => flags.get(id)!.add(f);
  const sorted: Row[] = [...txns]
    .sort((a, b) => a.txnDate.getTime() - b.txnDate.getTime())
    .map((t) => {
      const debit = money(t.debit);
      return { t, time: t.txnDate.getTime(), debit, credit: money(t.credit), isDebit: debit.greaterThan(0) };
    });
  const index = new EntityIndex(ctx.entities);
  const resolved = new Map(sorted.map((r) => [r.t.id, index.resolve(r.t)]));
  const invoicesByDay = groupBy(ctx.invoices, (inv) => dayKey(inv.invoiceDate));

  for (const r of sorted) {
    const t = r.t;
    const amount = r.isDebit ? r.debit : r.credit;
    const entity = resolved.get(t.id);
    if (entity?.ofInterest) add(t.id, "DIRECT_TRANSFER");
    if (!entity && (t.counterpartyName || t.counterpartyPhone || t.counterpartyAccount)) add(t.id, "UNKNOWN_COUNTERPARTY");
    if (amount.greaterThanOrEqualTo(1000) && amount.mod(1000).isZero()) add(t.id, "ROUND_FIGURE");
    for (const inv of invoicesByDay.get(dayKey(t.txnDate)) ?? []) {
      const target = [money(inv.invoiceAmount), money(inv.outstanding)];
      if (target.some((x) => x.greaterThan(0) && amount.minus(x).abs().lessThanOrEqualTo(x.times(0.01)))) {
        add(t.id, "INVOICE_DATE_MATCH");
        break;
      }
    }
  }

  // Group by counterparty for repeated, split and circular patterns (per statement).
  const byParty = groupBy(sorted, (r) => {
    const k = counterpartyKey(r.t);
    return k ? `${r.t.statementId}|${k}` : null;
  });
  for (const list of byParty.values()) {
    const debits = list.filter((r) => r.isDebit);
    const debitTimes = debits.map((r) => r.time);
    // Repeated: 3+ debits to the same counterparty within 30 days of one of them.
    const repeated = new RangeMarker(debits.length);
    for (let i = 0; i < debits.length; i++) {
      const lo = lowerBound(debitTimes, debitTimes[i]!);
      const hi = upperBound(debitTimes, debitTimes[i]! + 30 * DAY) - 1;
      if (hi - lo + 1 >= 3) repeated.mark(lo, hi);
    }
    repeated.forEachMarked((i) => add(debits[i]!.t.id, "REPEATED_TRANSFER"));
    // Split: 2+ debits to the same counterparty on the same day, each well below the day's total.
    for (const day of groupBy(debits, (r) => dayKey(r.t.txnDate)).values()) {
      if (day.length < 2) continue;
      const total = sum(day.map((x) => x.debit));
      if (day.every((x) => x.debit.lessThan(total.times(0.7)))) day.forEach((x) => add(x.t.id, "SPLIT_TRANSACTION"));
    }
    // Circular (within one statement): money out to X and back from X of a similar amount within 14 days.
    const others = list.filter((r) => !r.isDebit);
    const otherTimes = others.map((r) => r.time);
    for (const out of debits) {
      const end = out.time + 14 * DAY;
      const tolerance = out.debit.times(0.1);
      for (let j = lowerBound(otherTimes, out.time); j < others.length && otherTimes[j]! <= end; j++) {
        const back = others[j]!;
        if (back.credit.minus(out.debit).abs().lessThanOrEqualTo(tolerance)) {
          add(out.t.id, "CIRCULAR_MOVEMENT");
          add(back.t.id, "CIRCULAR_MOVEMENT");
          break;
        }
      }
    }
  }

  // Circular across statements: owner A pays B, and B's statement shows money going back to A.
  const ownerOf = ctx.statementOwner;
  const reverseIndex = groupBy(
    sorted.filter((r) => r.isDebit),
    (r) => {
      const owner = ownerOf[r.t.statementId];
      const to = resolved.get(r.t.id);
      return owner && to ? `${owner}|${to.id}` : null;
    },
  );
  const reverseTimes = new Map([...reverseIndex].map(([k, rows]) => [k, rows.map((r) => r.time)]));
  for (const r of sorted) {
    if (!r.isDebit) continue;
    const to = resolved.get(r.t.id);
    const from = ownerOf[r.t.statementId];
    if (!to || !from || to.kind !== "STATEMENT_OWNER") continue;
    const key = `${to.id}|${from}`;
    const candidates = reverseIndex.get(key);
    if (!candidates) continue;
    const reverse = candidates[lowerBound(reverseTimes.get(key)!, r.time)];
    if (reverse && reverse.time - r.time <= 30 * DAY) {
      add(r.t.id, "CIRCULAR_MOVEMENT");
      add(reverse.t.id, "CIRCULAR_MOVEMENT");
    }
  }

  // Rapid withdrawal: a credit followed within 24 hours by debits totalling at least 80% of it.
  for (const list of groupBy(sorted, (r) => r.t.statementId).values()) {
    const debits = list.filter((r) => r.isDebit);
    const times = debits.map((r) => r.time);
    const prefix: Decimal[] = [money(0)];
    for (const d of debits) prefix.push(prefix.at(-1)!.plus(d.debit));
    const rapid = new RangeMarker(debits.length);
    for (const c of list) {
      if (c.isDebit || c.credit.lessThan(1000)) continue;
      const lo = lowerBound(times, c.time);
      const hi = upperBound(times, c.time + DAY);
      if (hi > lo && prefix[hi]!.minus(prefix[lo]!).greaterThanOrEqualTo(c.credit.times(0.8))) {
        add(c.t.id, "RAPID_WITHDRAWAL");
        rapid.mark(lo, hi - 1);
      }
    }
    rapid.forEachMarked((i) => add(debits[i]!.t.id, "RAPID_WITHDRAWAL"));
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

/**
 * Keeps the review queue usable: a weak partial-name overlap (UNRESOLVED_POSSIBLE_MATCH against a party,
 * owner or account) is kept only when the transaction has no stronger entity match, and then only the
 * single best one. Invoice and cheque suggestions are unaffected.
 */
export function limitWeakNameMatches(suggestions: LinkSuggestion[]): LinkSuggestion[] {
  const isEntity = (s: LinkSuggestion) => s.targetType === "PARTY" || s.targetType === "STATEMENT_OWNER" || s.targetType === "KNOWN_ACCOUNT";
  const isWeak = (s: LinkSuggestion) => isEntity(s) && s.linkClass === "UNRESOLVED_POSSIBLE_MATCH";
  const strong = new Set<string>();
  const bestWeak = new Map<string, LinkSuggestion>();
  for (const s of suggestions) {
    if (isEntity(s) && !isWeak(s)) strong.add(s.transactionId);
    else if (isWeak(s)) {
      const current = bestWeak.get(s.transactionId);
      if (!current || s.score > current.score) bestWeak.set(s.transactionId, s);
    }
  }
  return suggestions.filter((s) => !isWeak(s) || (!strong.has(s.transactionId) && bestWeak.get(s.transactionId) === s));
}

export function suggestLinks(txns: Txn[], ctx: AnalysisContext & { cheques: ChequeRef[] }): LinkSuggestion[] {
  return limitWeakNameMatches(allLinkCandidates(txns, ctx));
}

function allLinkCandidates(txns: Txn[], ctx: AnalysisContext & { cheques: ChequeRef[] }): LinkSuggestion[] {
  const out: LinkSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: LinkSuggestion) => {
    const key = `${s.transactionId}|${s.targetType}|${s.targetId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };
  const index = new EntityIndex(ctx.entities);
  const entityPhones = ctx.entities.map((e) => new Set(e.phones.map(normalisePhone)));
  // Patterns are compiled once per analysis, not once per transaction.
  const invoices = ctx.invoices.map((inv) => {
    const ref = inv.invoiceNumber.toUpperCase();
    return {
      inv,
      pattern: ref.length >= 4 ? new RegExp(`(^|[^A-Z0-9])${escapeRegex(ref)}([^A-Z0-9]|$)`) : null,
      deliveryNote: inv.deliveryNoteNumber && inv.deliveryNoteNumber.length >= 4 ? inv.deliveryNoteNumber.toUpperCase() : null,
      day: dayKey(inv.invoiceDate),
      amount: money(inv.invoiceAmount),
    };
  });
  const cheques = ctx.cheques.filter((ch) => ch.chequeNumber.length >= 4).map((ch) => ({ ch, pattern: new RegExp(`(^|[^0-9])${escapeRegex(ch.chequeNumber)}([^0-9]|$)`) }));

  for (const t of txns) {
    const phone = t.counterpartyPhone ? normalisePhone(t.counterpartyPhone) : null;
    const text = `${t.reference ?? ""} ${t.description}`.toUpperCase();
    const similarities = t.counterpartyName ? index.similarities(t.counterpartyName) : null;
    ctx.entities.forEach((e, i) => {
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
      } else if (phone && entityPhones[i]!.has(phone)) {
        push({ transactionId: t.id, targetType: e.kind, targetId: e.id, targetLabel: e.name, linkClass: "TELEPHONE_NUMBER_MATCH", score: 85, rationale: `Telephone number matches ${e.name}.` });
      } else if (t.counterpartyName && similarities) {
        const s = similarities[i]!;
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
    });
    const txnDay = dayKey(t.txnDate);
    const txnAmount = amountOf(t);
    for (const { inv, pattern, deliveryNote, day, amount } of invoices) {
      if (pattern?.test(text)) {
        push({
          transactionId: t.id,
          targetType: "INVOICE",
          targetId: inv.id,
          targetLabel: `Invoice ${inv.invoiceNumber}`,
          linkClass: "EXACT_REFERENCE_MATCH",
          score: 90,
          rationale: `Reference or narrative contains invoice number ${inv.invoiceNumber}.`,
        });
      } else if (deliveryNote && text.includes(deliveryNote)) {
        push({
          transactionId: t.id,
          targetType: "INVOICE",
          targetId: inv.id,
          targetLabel: `Invoice ${inv.invoiceNumber}`,
          linkClass: "EXACT_REFERENCE_MATCH",
          score: 85,
          rationale: `Narrative contains delivery note ${inv.deliveryNoteNumber}.`,
        });
      } else if (day === txnDay && txnAmount.minus(amount).abs().lessThanOrEqualTo(amount.times(0.01)) && amount.greaterThan(0)) {
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
    for (const { ch, pattern } of cheques) {
      if (pattern.test(text)) {
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

/**
 * Aggregates transactions into directed flows between the statement owner and counterparties.
 * An item may stand for several transactions already summed together (`count`, default 1).
 */
export function aggregateFlows<T extends Txn & { ownerKey: string; ownerLabel: string; count?: number }>(txns: T[], labelFor: (t: T) => { key: string; label: string }) {
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
    e.count += t.count ?? 1;
    edges.set(key, e);
  }
  return {
    nodes: [...nodes.values()].map((n) => ({ ...n, inflow: n.inflow.toFixed(2), outflow: n.outflow.toFixed(2) })),
    edges: [...edges.values()].map((e) => ({ ...e, total: e.total.toFixed(2) })),
  };
}
