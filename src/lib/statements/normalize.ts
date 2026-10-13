// Statement normalisation: turns raw rows from any parser (CSV, XLSX, PDF text, pandas) into one
// transaction shape. Pure and deterministic so it can be unit-tested and shared by both parsers.
import { money, toDbString } from "@/lib/money";
import { normalisePhone } from "@/lib/masking";
import { parseDateInput } from "@/lib/resources/schema";

export interface NormalizedTransaction {
  rowNumber: number;
  txnDate: Date;
  txnTime: string | null;
  reference: string | null;
  description: string;
  debit: string; // exact decimal strings
  credit: string;
  balance: string | null;
  counterpartyName: string | null;
  counterpartyPhone: string | null;
  counterpartyAccount: string | null;
}

export type RawRow = Record<string, unknown>;

const SYNONYMS: Record<keyof Omit<NormalizedTransaction, "rowNumber" | "counterpartyName" | "counterpartyPhone" | "counterpartyAccount"> | "amount" | "datetime", string[]> = {
  txnDate: ["date", "transaction date", "trans date", "txn date", "value date", "posting date", "booking date", "tran date"],
  datetime: ["completion time", "completed", "date time", "datetime", "transaction time", "initiation time"],
  txnTime: ["time"],
  reference: ["reference", "ref", "ref no", "reference number", "receipt no", "receipt no.", "receipt", "transaction id", "cheque no", "chq no", "transaction reference"],
  description: ["details", "description", "narrative", "narration", "particulars", "transaction details", "remarks", "memo"],
  debit: ["debit", "withdrawn", "withdrawal", "withdrawals", "paid out", "money out", "dr", "debit amount", "out"],
  credit: ["credit", "paid in", "deposit", "deposits", "money in", "cr", "credit amount", "in"],
  balance: ["balance", "running balance", "closing balance", "ledger balance", "book balance"],
  amount: ["amount", "transaction amount", "amt"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Maps source headers to canonical fields by synonym. Returns canonical → source header. */
export function detectColumns(headers: string[]): Partial<Record<keyof typeof SYNONYMS, string>> {
  const out: Partial<Record<keyof typeof SYNONYMS, string>> = {};
  const normalised = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const [field, words] of Object.entries(SYNONYMS) as [keyof typeof SYNONYMS, string[]][]) {
    const exact = normalised.find((h) => words.includes(h.n) && !Object.values(out).includes(h.raw));
    if (exact) {
      out[field] = exact.raw;
      continue;
    }
    const partial = normalised.find((h) => words.some((w) => w.length > 3 && h.n.includes(w)) && !Object.values(out).includes(h.raw));
    if (partial) out[field] = partial.raw;
  }
  return out;
}

/** Parses "1,234.50", "(1,234.50)", "-1234.5", "1234.50 DR", "KES 1,000" into a signed decimal string. */
export function parseAmount(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? toDbString(v) : null;
  let s = String(v).trim();
  if (!s || s === "-" || s === "—") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\bdr\b\.?$/i.test(s)) {
    negative = true;
    s = s.replace(/\bdr\b\.?$/i, "");
  }
  s = s
    .replace(/\bcr\b\.?$/i, "")
    .replace(/^(kes|ksh|ksh\.|usd)\s*/i, "")
    .replace(/[,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const d = money(s);
  return toDbString(negative ? d.negated() : d);
}

const PHONE = /(?:\+?254|0)?7\d{8}|(?:\+?254|0)?1\d{8}/;
const ACCOUNT = /\b(?:a\/?c|acc(?:ount)?\.?|acct)\s*(?:no\.?|number)?\s*[:#]?\s*([0-9]{6,20})\b/i;

/** Extracts counterparty name, phone and account from M-Pesa and bank narratives. */
export function parseNarrative(description: string): { name: string | null; phone: string | null; account: string | null } {
  const d = description.replace(/\s+/g, " ").trim();
  let name: string | null = null;
  let phone: string | null = null;
  let account: string | null = null;

  // M-Pesa: "Customer Transfer to 0712345678 - JOHN DOE", "Funds received from 254712345678 - JANE DOE"
  const mpesa =
    /(?:transfer to|received from|sent to|payment from|payment to|funds received from|customer transfer to|transfer from)\s+(\+?\d[\d*]{6,14})\s*(?:-\s*)?([A-Za-z][A-Za-z .'-]{1,80})/i.exec(d);
  if (mpesa) {
    phone = normalisePhone(mpesa[1]!.replace(/\*/g, ""));
    name = mpesa[2]!.trim();
  }
  // M-Pesa pay bill / till: "Pay Bill to 123456 - FICTIONAL SUPPLIES Acc. 7788"
  const paybill = /(?:pay ?bill|buy goods|merchant payment|till)\s+(?:to|from)?\s*(\d{4,8})\s*-\s*([A-Za-z0-9][A-Za-z0-9 .&'-]{1,80}?)(?:\s+acc(?:ount)?\.?\s*(?:no\.?)?\s*([\w-]{1,30}))?$/i.exec(d);
  if (!mpesa && paybill) {
    account = paybill[1]!;
    name = paybill[2]!.trim();
  }
  // Bank: "TRF TO JOHN DOE A/C 0123456789", "RTGS FROM FICTIONAL LTD ACC 1234567"
  if (!name) {
    const bank = /(?:trf|transfer|rtgs|eft|pesalink|chq|cheque|deposit|pmt|payment)\s+(?:to|from|by)\s+([A-Za-z][A-Za-z .&'-]{1,60}?)(?=\s+(?:a\/?c|acc|acct|ref|\d)|$)/i.exec(d);
    if (bank) name = bank[1]!.trim();
  }
  if (!account) {
    const acc = ACCOUNT.exec(d);
    if (acc) account = acc[1]!;
  }
  if (!phone) {
    const p = PHONE.exec(d);
    if (p) phone = normalisePhone(p[0]);
  }
  // Drop trailing reference fragments such as "INV-DEMO-" that run into the name.
  if (name)
    name = name
      .replace(/\s+/g, " ")
      .replace(/(\s+\S*[-/#]\S*)+$/, "")
      .replace(/[.\s]+$/, "")
      .toUpperCase();
  return { name: name || null, phone, account };
}

// Column sizes of StatementTransaction (prisma/schema.prisma). Parsed text is cut to fit, as the
// description always was, so one overlong cell cannot fail the whole statement under strict sql_mode.
const MAX = { description: 1000, reference: 300, counterpartyName: 300, counterpartyPhone: 191, counterpartyAccount: 191, txnTime: 191 } as const;
const cap = (value: string | null, max: number) => (value === null ? null : value.slice(0, max));

export interface NormalizeResult {
  transactions: NormalizedTransaction[];
  warnings: string[];
}

/** Normalises raw rows. Rows without a valid date and amount are skipped with a warning. */
export function normalizeRows(rows: RawRow[], headers?: string[]): NormalizeResult {
  const warnings: string[] = [];
  const cols = detectColumns(headers ?? Object.keys(rows[0] ?? {}));
  if (!cols.txnDate && !cols.datetime) warnings.push("No date column was recognised.");
  if (!cols.debit && !cols.credit && !cols.amount) warnings.push("No amount, debit or credit column was recognised.");
  const out: NormalizedTransaction[] = [];
  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const rawDate = cols.datetime ? row[cols.datetime] : row[cols.txnDate!];
    const date = parseDateInput(rawDate, true) ?? parseDateInput(rawDate);
    if (!date) {
      if (Object.values(row).some((v) => String(v ?? "").trim())) warnings.push(`Row ${rowNumber}: unreadable date — skipped.`);
      return;
    }
    let time: string | null = cols.txnTime ? String(row[cols.txnTime] ?? "").trim() || null : null;
    if (!time && typeof rawDate === "string") {
      const t = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(rawDate);
      if (t) time = t[1]!;
    }
    let debit = cols.debit ? parseAmount(row[cols.debit]) : null;
    let credit = cols.credit ? parseAmount(row[cols.credit]) : null;
    if (!debit && !credit && cols.amount) {
      const amt = parseAmount(row[cols.amount]);
      if (amt) {
        if (amt.startsWith("-")) debit = amt.slice(1);
        else credit = amt;
      }
    }
    // Some statements show withdrawals as negative numbers in the debit column.
    if (debit?.startsWith("-")) debit = debit.slice(1);
    if (credit?.startsWith("-")) {
      debit = credit.slice(1);
      credit = null;
    }
    const d = money(debit ?? "0");
    const c = money(credit ?? "0");
    if (d.isZero() && c.isZero()) {
      warnings.push(`Row ${rowNumber}: no amount — skipped.`);
      return;
    }
    const description =
      String(cols.description ? (row[cols.description] ?? "") : "")
        .replace(/\s+/g, " ")
        .trim() || "(no description)";
    const narrative = parseNarrative(description);
    out.push({
      rowNumber,
      txnDate: date,
      txnTime: cap(time, MAX.txnTime),
      reference: cap(cols.reference ? String(row[cols.reference] ?? "").trim() || null : null, MAX.reference),
      description: description.slice(0, MAX.description),
      debit: toDbString(d.greaterThan(0) && c.greaterThan(0) ? d.minus(c).abs() : d),
      credit: toDbString(d.greaterThan(0) && c.greaterThan(0) ? "0" : c),
      balance: cols.balance ? parseAmount(row[cols.balance]) : null,
      counterpartyName: cap(narrative.name, MAX.counterpartyName),
      counterpartyPhone: cap(narrative.phone, MAX.counterpartyPhone),
      counterpartyAccount: cap(narrative.account, MAX.counterpartyAccount),
    });
  });
  return { transactions: out, warnings };
}

/**
 * Parses text extracted from a text-based PDF. Each transaction line must start with a date
 * and contain at least one amount; M-Pesa and common bank layouts are recognised.
 */
export function parsePdfText(text: string): NormalizeResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows: RawRow[] = [];
  const DATE = /^(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s+(.*)$/;
  const AMOUNT = /-?\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?|-?\d+\.\d{2}/g;
  for (const line of lines) {
    const m = DATE.exec(line);
    if (!m) continue;
    const rest = m[2]!;
    const amounts = rest.match(AMOUNT) ?? [];
    if (!amounts.length) continue;
    let firstAmountAt = rest.length;
    for (const a of amounts) firstAmountAt = Math.min(firstAmountAt, rest.indexOf(a));
    const head = rest.slice(0, firstAmountAt).trim();
    const refMatch = /^([A-Z0-9]{8,12})\s+(.*)$/.exec(head);
    const reference = refMatch ? refMatch[1]! : null;
    const description = refMatch ? refMatch[2]! : head;
    // Layouts: [paid in, withdrawn, balance] (M-Pesa) or [debit|credit, balance] (bank, signed)
    let debit: string | null = null;
    let credit: string | null = null;
    let balance: string | null = null;
    if (amounts.length >= 3) {
      credit = amounts[0]!;
      debit = amounts[1]!;
      balance = amounts[2]!;
    } else if (amounts.length === 2) {
      const first = parseAmount(amounts[0]) ?? "0";
      balance = amounts[1]!;
      if (first.startsWith("-") || /withdraw|transfer to|sent|pay bill|buy goods|payment to|debit/i.test(description)) debit = first.replace(/^-/, "");
      else credit = first;
    } else {
      const only = parseAmount(amounts[0]) ?? "0";
      if (only.startsWith("-")) debit = only.slice(1);
      else credit = only;
    }
    rows.push({ date: m[1], reference, details: description, "paid in": credit, withdrawn: debit, balance });
  }
  const res = normalizeRows(rows, ["date", "reference", "details", "paid in", "withdrawn", "balance"]);
  if (!rows.length) res.warnings.unshift("No transaction lines were found in the PDF text.");
  return res;
}
