import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderWithApp } from "../../../tests/component-utils";
import { ResourceForm } from "@/components/resources/resource-form";
import { ResourceTable } from "@/components/resources/resource-table";
import { getResource } from "@/lib/resources/registry";

afterEach(() => vi.unstubAllGlobals());

const invoiceRow = (i: number) => ({
  id: `inv${i}`,
  invoiceNumber: `INV-${i}`,
  invoiceDate: "2026-01-10T00:00:00.000Z",
  customerName: `Fictional customer ${i}`,
  invoiceAmount: "1000.00",
  amountPaid: "250.00",
  amountOutstanding: "750.00",
  classification: "DISPUTED",
  recoveryStatus: "NOT_STARTED",
  caseId: "c1",
  case: { id: "c1", reference: "SIMS/2026/0001", title: "Case", currency: "KES" },
  isDemo: true,
  _labels: {},
});

describe("ResourceTable", () => {
  it("renders rows from the server with pagination metadata", async () => {
    mockApi(() => ({ body: { data: [invoiceRow(1), invoiceRow(2)], meta: { page: 1, pageSize: 25, total: 2, totalPages: 1 }, requestId: "r" } }));
    renderWithApp(<ResourceTable resource="invoices" caseId="c1" />);
    expect(await screen.findByText("INV-1")).toBeInTheDocument();
    expect(screen.getAllByText("KES 750.00")).toHaveLength(2);
    expect(screen.getByText("1–2 of 2")).toBeInTheDocument();
    expect(screen.getAllByText("Demo data").length).toBeGreaterThan(0);
  });

  it("shows an empty state", async () => {
    mockApi(() => ({ body: { data: [], meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 }, requestId: "r" } }));
    renderWithApp(<ResourceTable resource="invoices" caseId="c1" />);
    expect(await screen.findByText("No invoices yet")).toBeInTheDocument();
  });

  it("shows server errors with the message and a retry", async () => {
    mockApi(() => ({ status: 403, body: { error: { code: "FORBIDDEN", message: "Case not found or access denied." }, requestId: "r" } }));
    renderWithApp(<ResourceTable resource="invoices" caseId="c1" />);
    expect(await screen.findByText("Case not found or access denied.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("requests server-side sorting and exposes aria-sort", async () => {
    const fetchMock = mockApi(() => ({ body: { data: [invoiceRow(1)], meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 }, requestId: "r" } }));
    renderWithApp(<ResourceTable resource="invoices" caseId="c1" />);
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByRole("button", { name: /Invoice amount/ }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("sort=invoiceAmount&order=asc"))).toBe(true));
    expect(screen.getByRole("columnheader", { name: /Invoice amount/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("offers select-all-matching when a full page is selected", async () => {
    mockApi(() => ({ body: { data: [invoiceRow(1), invoiceRow(2)], meta: { page: 1, pageSize: 2, total: 40, totalPages: 20 }, requestId: "r" } }));
    renderWithApp(<ResourceTable resource="invoices" caseId="c1" />, "SYSTEM_ADMIN");
    await screen.findByText("INV-1");
    fireEvent.click(screen.getByLabelText("Select all records on this page"));
    fireEvent.click(await screen.findByRole("button", { name: "Select all 40 matching records" }));
    expect(within(screen.getByRole("region", { name: "Bulk actions" })).getByText("40 selected")).toBeInTheDocument();
  });
});

describe("ResourceForm", () => {
  it("validates on the client before calling the API", async () => {
    const fetchMock = mockApi(() => ({ body: { data: {}, requestId: "r" } }));
    renderWithApp(<ResourceForm resource={getResource("invoices")!} caseId="c1" />);
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("Invoice number is required.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Invoice number/)).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
  });

  it("maps server field errors back onto inputs", async () => {
    mockApi((url, init) =>
      init?.method === "POST"
        ? { status: 422, body: { error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", details: { fields: { customerName: "Customer is not allowed." } } }, requestId: "r" } }
        : { body: { data: [], requestId: "r" } },
    );
    renderWithApp(<ResourceForm resource={getResource("invoices")!} caseId="c1" />);
    fireEvent.change(screen.getByLabelText(/Invoice number/), { target: { value: "INV-9" } });
    fireEvent.change(screen.getByLabelText(/Invoice date/), { target: { value: "2026-01-10" } });
    fireEvent.change(screen.getByLabelText(/^Customer\*/), { target: { value: "Fictional" } });
    fireEvent.change(screen.getByLabelText(/Invoice amount/), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByText("Customer is not allowed.")).toBeInTheDocument();
    expect(screen.getByText("Some fields are invalid.")).toBeInTheDocument();
  });
});
