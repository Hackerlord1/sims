import { describe, expect, it } from "vitest";
import { autoMap, CASE_REFERENCE, duplicateKey, IGNORE, templateColumns } from "./imports";
import { getResource } from "./resources/registry";
import { sanitizeForLog, REDACTED } from "./sanitize";

const invoices = getResource("invoices")!;

describe("import templates and mapping", () => {
  it("builds templates with the case reference and required markers", () => {
    const cols = templateColumns(invoices);
    expect(cols[0]).toMatchObject({ key: CASE_REFERENCE, required: true });
    expect(cols.find((c) => c.key === "invoiceNumber")).toMatchObject({ header: "Invoice number", required: true });
    expect(cols.some((c) => c.key === "amountOutstanding")).toBe(false); // computed fields are never imported
    expect(templateColumns(getResource("financial-statements")!)[0]!.key).toBe("file");
  });

  it("maps headers by label, name and alias, ignoring unknown columns", () => {
    const map = autoMap(invoices, ["Case", "Invoice No", "invoiceDate", "CUSTOMER", "Amount", "Some random column"]);
    expect(map).toEqual({
      Case: CASE_REFERENCE,
      "Invoice No": "invoiceNumber",
      invoiceDate: "invoiceDate",
      CUSTOMER: "customerName",
      Amount: "invoiceAmount",
      "Some random column": IGNORE,
    });
  });

  it("never maps two headers to the same field", () => {
    const map = autoMap(invoices, ["Invoice number", "Invoice No"]);
    expect(Object.values(map).filter((v) => v === "invoiceNumber")).toHaveLength(1);
  });

  it("normalises duplicate keys", () => {
    expect(duplicateKey({ invoiceNumber: " INV-1 " }, ["invoiceNumber"])).toBe(duplicateKey({ invoiceNumber: "inv-1" }, ["invoiceNumber"]));
    expect(duplicateKey({ a: "x", b: new Date("2026-01-01T15:00:00Z") }, ["a", "b"])).toBe("x|2026-01-01");
    expect(duplicateKey({ a: "" }, ["a"])).toBeNull();
  });
});

describe("log sanitisation", () => {
  it("redacts secrets at any depth and truncates large values", () => {
    const out = sanitizeForLog({ user: "a", password: "p", nested: { apiKey: "k", token: "t", ok: 1 }, long: "x".repeat(3000) }) as Record<string, unknown>;
    expect(out.password).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).apiKey).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).token).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect(String(out.long).length).toBeLessThan(2100);
  });
});
