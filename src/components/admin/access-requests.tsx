"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { AccessRequestRow } from "@/components/admin/users-admin";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText, Ref, ScrollRegion } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { enumOptions } from "@/lib/enums";
import { ROLE_LABELS } from "@/lib/permissions";

/** Requests made from the sign-in screen. Approving opens the account form pre-filled from the request. */
export function AccessRequests({ manage, onReview, refreshKey }: { manage: boolean; onReview: (r: AccessRequestRow) => void; refreshKey: number }) {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<AccessRequestRow | null>(null);
  const list = useQuery({
    queryKey: ["access-requests", status, page, refreshKey],
    queryFn: ({ signal }) => apiGet<AccessRequestRow[]>("/access-requests", { status: status || undefined, page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted">
          People without an account ask for access from the sign-in screen. Nobody can sign in until an administrator approves the request and sets their role, units and restrictions.
        </p>
        <Select
          aria-label="Show requests"
          className="h-9 w-44"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All requests</option>
          {enumOptions("AccessRequestStatus").map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {list.isError ? (
        <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <LoadingRows />
      ) : list.data.data.length === 0 ? (
        <EmptyState title={status === "PENDING" ? "No requests waiting" : "No requests"} description="New requests appear here and administrators are notified." />
      ) : (
        <ScrollRegion className="overflow-x-auto" label="Access requests">
          <ul className="divide-y divide-border">
            {list.data.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.fullName}</span>
                    <StatusBadge value={r.status} />
                    <Ref className="text-xs text-muted">{r.reference}</Ref>
                  </p>
                  <p className="text-xs text-muted">
                    {[
                      r.username ? `Username ${r.username}` : null,
                      r.email,
                      r.jobTitle,
                      r.unit,
                      r.employeeNumber ? `Emp. ${r.employeeNumber}` : null,
                      r.requestedRole ? `asked for ${ROLE_LABELS[r.requestedRole]}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.justification ? <p className="mt-1.5 max-w-3xl text-sm whitespace-pre-wrap">{r.justification}</p> : null}
                  <p className="mt-1 text-xs text-muted">
                    Received <DateText value={r.createdAt} withTime />
                    {r.decidedAt ? (
                      <>
                        {" "}
                        · decided <DateText value={r.decidedAt} withTime />
                        {r.decisionComment ? ` — ${r.decisionComment}` : ""}
                      </>
                    ) : null}
                  </p>
                </div>
                {manage && r.status === "PENDING" ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>
                      <X className="h-4 w-4" aria-hidden /> Reject
                    </Button>
                    <Button size="sm" onClick={() => onReview(r)}>
                      <Check className="h-4 w-4" aria-hidden /> Review and approve
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {list.data.meta && list.data.meta.totalPages > 1 ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= list.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </ScrollRegion>
      )}

      <ConfirmDialog
        open={Boolean(rejecting)}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject the request from ${rejecting?.fullName}?`}
        description="No account is created. The reason is kept with the request and in the audit log."
        confirmLabel="Reject request"
        tone="danger"
        requireReason
        reasonLabel="Reason"
        onConfirm={async (reason) => {
          try {
            await apiPost(`/access-requests/${rejecting!.id}/reject`, { reason });
            toast.success("Request rejected.");
            await list.refetch();
          } catch (e) {
            throw new Error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
