import Decimal from "decimal.js";

// All money arithmetic goes through Decimal. Never use JS numbers for amounts.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });

export { Decimal };
export type MoneyInput = Decimal | string | number | { toString(): string } | null | undefined;

export const ZERO = new Decimal(0);
export const HUNDRED = new Decimal(100);

const MONEY_TEXT = /^-?\d+(\.\d+)?$/;

export function money(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return ZERO;
  if (Decimal.isDecimal(value)) return value as Decimal;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid money value");
    // Go through the string form to avoid binary artefacts (0.1 + 0.2 etc.).
    return new Decimal(value.toString());
  }
  const text = value.toString().replace(/[,\s]/g, "").trim();
  if (!MONEY_TEXT.test(text)) throw new Error(`Invalid money value: ${text}`);
  return new Decimal(text);
}

/** True when the text is a plain decimal amount with at most two decimal places. */
export function isMoneyText(text: string): boolean {
  const t = text.replace(/[,\s]/g, "");
  return /^-?\d{1,16}(\.\d{1,2})?$/.test(t);
}

/** Round to cents, banker's rounding, as stored in Decimal(18,2) columns. */
export function toCents(value: MoneyInput): Decimal {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

export function sum(values: Iterable<MoneyInput>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(money(v));
  return total;
}

/** String form suitable for Prisma Decimal columns and JSON transport. */
export function toDbString(value: MoneyInput): string {
  return toCents(value).toFixed(2);
}

export const DEFAULT_CURRENCY = "KES";

/** "KES 1,234,567.89" — formatting works on the decimal string, so large values never lose cents. */
export function formatMoney(value: MoneyInput, currency: string | null = DEFAULT_CURRENCY): string {
  const d = toCents(value);
  const negative = d.isNegative();
  const [whole, cents] = d.abs().toFixed(2).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const text = `${negative ? "-" : ""}${grouped}.${cents}`;
  return currency ? `${currency} ${text}` : text;
}

export function formatKES(value: MoneyInput, { symbol = true }: { symbol?: boolean } = {}): string {
  return formatMoney(value, symbol ? "KES" : null);
}

/**
 * Safe percentage: numerator / denominator × 100, rounded to 2 dp.
 * Returns null when the denominator is zero (or negative), so callers display "Not applicable"
 * instead of NaN, Infinity or a misleading 0%.
 */
export function percentage(numerator: MoneyInput, denominator: MoneyInput): Decimal | null {
  const d = money(denominator);
  if (d.lessThanOrEqualTo(0)) return null;
  return money(numerator).div(d).times(HUNDRED).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

export function formatPercent(value: Decimal | null): string {
  return value === null ? "Not applicable" : `${value.toFixed(2)}%`;
}

/** Never negative: max(value, 0). */
export function nonNegative(value: Decimal): Decimal {
  return value.isNegative() ? ZERO : value;
}
