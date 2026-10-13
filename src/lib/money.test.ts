import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent, isMoneyText, money, percentage, sum, toCents, toDbString } from "./money";

describe("money", () => {
  it("never uses binary floating point", () => {
    expect(sum([0.1, 0.2]).toString()).toBe("0.3");
    expect(sum(["1000000000000.10", "0.20"]).toFixed(2)).toBe("1000000000000.30");
  });

  it("parses formatted amounts", () => {
    expect(money("1,234,567.89").toFixed(2)).toBe("1234567.89");
    expect(money(null).isZero()).toBe(true);
    expect(() => money("12abc")).toThrow();
    expect(() => money(Number.NaN)).toThrow();
  });

  it("rounds to cents with banker's rounding", () => {
    expect(toCents("2.345").toFixed(2)).toBe("2.34");
    expect(toCents("2.355").toFixed(2)).toBe("2.36");
    expect(toDbString("7")).toBe("7.00");
  });

  it("validates money text", () => {
    expect(isMoneyText("1,000.50")).toBe(true);
    expect(isMoneyText("1000.505")).toBe(false);
    expect(isMoneyText("abc")).toBe(false);
  });

  it("formats large amounts exactly", () => {
    expect(formatMoney("9999999999999999.99")).toBe("KES 9,999,999,999,999,999.99");
    expect(formatMoney("-1500", "USD")).toBe("USD -1,500.00");
    expect(formatMoney(0)).toBe("KES 0.00");
  });
});

describe("percentage", () => {
  it("returns null (not NaN or Infinity) for zero denominators", () => {
    expect(percentage(100, 0)).toBeNull();
    expect(percentage(0, 0)).toBeNull();
    expect(formatPercent(percentage(5, 0))).toBe("Not applicable");
  });

  it("computes exact percentages", () => {
    expect(percentage(1, 3)!.toFixed(2)).toBe("33.33");
    expect(percentage("250000", "1000000")!.toFixed(2)).toBe("25.00");
    expect(formatPercent(percentage(0, 50))).toBe("0.00%");
  });
});
