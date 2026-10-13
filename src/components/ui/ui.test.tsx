import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusBadge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Money } from "@/components/ui/display";
import { EmptyState, ErrorState, LeadNotice } from "@/components/ui/states";

describe("StatusBadge", () => {
  it("shows the status as text with an icon, not colour alone", () => {
    const { container } = render(<StatusBadge value="AWAITING_MANAGEMENT_DECISION" />);
    expect(screen.getByText("Awaiting management decision")).toBeInTheDocument();
    expect(container.querySelector("svg[aria-hidden]")).not.toBeNull();
  });

  it("renders a dash for empty values", () => {
    render(<StatusBadge value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("Money", () => {
  it("formats exactly, with a visible minus sign for negatives", () => {
    render(
      <>
        <Money value="1234567.891" />
        <Money value="-500" currency="USD" />
      </>,
    );
    expect(screen.getByText("KES 1,234,567.89")).toBeInTheDocument();
    expect(screen.getByText("USD -500.00")).toBeInTheDocument();
  });
});

describe("states", () => {
  it("announces empty, error and lead notices accessibly", () => {
    const retry = vi.fn();
    render(
      <>
        <EmptyState title="Nothing here" />
        <ErrorState message="Server unavailable" onRetry={retry} />
        <LeadNotice />
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Nothing here");
    expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("note")).toHaveTextContent(/not proof/i);
  });
});

describe("ConfirmDialog", () => {
  it("requires a reason before confirming", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={() => undefined} title="Delete record?" requireReason confirmLabel="Delete" onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/at least 3 characters/)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Created in error" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Created in error"));
  });
});
