"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { useDebounced } from "@/components/resources/hooks";
import { useCan } from "@/components/session-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText, Ref, ScrollRegion } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, downloadFromApi, errorMessage } from "@/lib/api-client";

interface AuditRow {
  id: string;
  at: string;
  actorLabel: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  caseId: string | null;
  outcome: string;
  reason: string | null;
  requestId: string | null;
  ipAddress: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  details: Record<string, unknown> | null;
}

export function AuditTrail({ caseId, entityId }: { caseId?: string; entityId?: string }) {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q, 300);
  const params = { page, pageSize: 50, caseId, entityId, q: dq || undefined, outcome: outcome || undefined, from: from || undefined, to: to || undefined };
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["audit", params],
    queryFn: ({ signal }) => apiGet<AuditRow[]>("/audit-logs", params, signal),
    placeholderData: keepPreviousData,
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <section className="rounded-lg border border-border bg-surface shadow-card" aria-label="Audit trail">
      <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
        <label className="text-xs font-medium">
          Search
          <Input
            className="mt-1 h-9 w-56"
            type="search"
            placeholder="Actor, action or reason"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs font-medium">
          Outcome
          <Select
            className="mt-1 h-9 w-36"
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Any</option>
            <option value="SUCCESS">Success</option>
            <option value="DENIED">Denied</option>
            <option value="FAILURE">Failure</option>
          </Select>
        </label>
        <label className="text-xs font-medium">
          From
          <Input
            className="mt-1 h-9"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-xs font-medium">
          To
          <Input
            className="mt-1 h-9"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {can("AUDIT", "EXPORT") ? (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            onClick={async () => {
              try {
                await downloadFromApi("/audit-logs/export", { method: "POST", body: { ...params, page: undefined, pageSize: undefined, format: "xlsx" }, fallbackName: "audit-log.xlsx" });
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Download className="h-4 w-4" aria-hidden /> Export
          </Button>
        ) : null}
      </div>
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState title="No audit entries match" />
      ) : (
        <ScrollRegion className="overflow-x-auto" label="Audit log entries, newest first">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Audit log entries, newest first</caption>
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">
                  When
                </th>
                <th scope="col" className="px-3 py-2">
                  Actor
                </th>
                <th scope="col" className="px-3 py-2">
                  Action
                </th>
                <th scope="col" className="px-3 py-2">
                  Outcome
                </th>
                <th scope="col" className="px-3 py-2">
                  Entity
                </th>
                <th scope="col" className="px-3 py-2">
                  Reason
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <Fragment key={r.id}>
                  <tr>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <DateText value={r.at} withTime />
                    </td>
                    <td className="px-3 py-2">{r.actorLabel ?? "system"}</td>
                    <td className="px-3 py-2">
                      <Ref className="text-xs">{r.action}</Ref>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.outcome === "SUCCESS" ? "success" : r.outcome === "DENIED" ? "danger" : "warning"}>{r.outcome.toLowerCase()}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{r.entityType ? `${r.entityType} · ${r.entityId?.slice(0, 10) ?? ""}` : "—"}</td>
                    <td className="max-w-64 truncate px-3 py-2 text-xs" title={r.reason ?? undefined}>
                      {r.reason ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.before || r.after || r.details ? (
                        <button type="button" className="text-xs text-accent underline" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                          {open === r.id ? "Hide" : "Changes"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {open === r.id ? (
                    <tr className="bg-surface-2">
                      <td colSpan={7} className="px-3 py-2">
                        <div className="grid gap-3 text-xs md:grid-cols-3">
                          <div>
                            <p className="font-semibold">Previous value</p>
                            <pre className="ref mt-1 break-all whitespace-pre-wrap">{r.before ? JSON.stringify(r.before, null, 2) : "—"}</pre>
                          </div>
                          <div>
                            <p className="font-semibold">New value</p>
                            <pre className="ref mt-1 break-all whitespace-pre-wrap">{r.after ? JSON.stringify(r.after, null, 2) : "—"}</pre>
                          </div>
                          <div>
                            <p className="font-semibold">Context</p>
                            <pre className="ref mt-1 break-all whitespace-pre-wrap">{JSON.stringify({ requestId: r.requestId, ip: r.ipAddress, caseId: r.caseId, ...(r.details ?? {}) }, null, 2)}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      {meta && meta.total > 0 ? (
        <nav className="flex items-center justify-between border-t border-border px-3 py-2 text-sm" aria-label="Audit pagination">
          <span className="text-muted">
            {meta.total} entries · page {meta.page} of {meta.totalPages}
          </span>
          <span className="flex gap-2">
            <Button size="icon" variant="secondary" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Next page" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </span>
        </nav>
      ) : null}
    </section>
  );
}
