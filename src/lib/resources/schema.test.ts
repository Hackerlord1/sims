import { describe, expect, it } from "vitest";
import { createSchema, issuesByField, parseDateInput, updateSchema } from "./schema";
import { getResource, RESOURCES } from "./registry";

const invoices = getResource("invoices")!;

describe("resource schemas", () => {
  it("validates and normalises an invoice", () => {
    const r = createSchema(invoices).parse({
      caseId: "c1",
      invoiceNumber: " INV-001 ",
      invoiceDate: "15/03/2026",
      customerName: "Fictional Traders",
      invoiceAmount: "12,500.5",
      classification: "no proof of delivery",
      extraneous: "ignored",
    });
    expect(r.invoiceNumber).toBe("INV-001");
    expect(r.invoiceAmount).toBe("12500.50");
    expect((r.invoiceDate as Date).toISOString()).toBe("2026-03-15T00:00:00.000Z");
    expect(r.classification).toBe("NO_PROOF_OF_DELIVERY");
    expect(r).not.toHaveProperty("extraneous");
  });

  it("reports readable errors per field", () => {
    const res = createSchema(invoices).safeParse({ caseId: "c1", invoiceNumber: "", invoiceDate: "31/02/2026", customerName: "X", invoiceAmount: "-5" });
    expect(res.success).toBe(false);
    const fields = issuesByField(res.error!);
    expect(fields.invoiceNumber).toBe("Invoice number is required.");
    expect(fields.invoiceDate).toMatch(/not a valid date/);
    expect(fields.invoiceAmount).toMatch(/cannot be negative/);
  });

  it("rejects money with more than two decimals and bad enums", () => {
    const res = createSchema(invoices).safeParse({ caseId: "c1", invoiceNumber: "A", invoiceDate: "2026-01-01", customerName: "X", invoiceAmount: "1.005", classification: "MADE_UP" });
    const fields = issuesByField(res.error!);
    expect(fields.invoiceAmount).toMatch(/two decimal places/);
    expect(fields.classification).toMatch(/listed options/);
  });

  it("never accepts server-managed or workflow fields", () => {
    const expenses = getResource("expenses")!;
    const r = updateSchema(expenses).parse({ approvedAmount: "999", status: "APPROVED", reference: "X", description: "Taxi" });
    expect(r).toEqual({ description: "Taxi" });
  });

  it("allows omitting but not clearing required fields on update", () => {
    expect(updateSchema(invoices).safeParse({ observations: "ok" }).success).toBe(true);
    const cleared = updateSchema(invoices).safeParse({ customerName: "" });
    expect(cleared.success).toBe(false);
    expect(issuesByField(cleared.error!).customerName).toBe("Customer is required.");
  });

  it("parses the supported date formats", () => {
    expect(parseDateInput("2026-02-29")).toBeNull();
    expect(parseDateInput("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(parseDateInput(46023)?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(parseDateInput("2026-09-30T14:05", true)?.toISOString()).toBe("2026-09-30T11:05:00.000Z");
  });

  it("gives every resource a valid definition", () => {
    const keys = new Set<string>();
    for (const r of RESOURCES) {
      expect(keys.has(r.key)).toBe(false);
      keys.add(r.key);
      expect(r.fields.some((f) => f.name === r.titleField) || r.titleField === "reference").toBe(true);
      for (const f of r.fields) {
        if (f.type === "enum") expect(f.enum, `${r.key}.${f.name}`).toBeDefined();
        if (f.type === "relation") expect(getResource(f.relation!), `${r.key}.${f.name}`).toBeDefined();
      }
    }
  });
});
