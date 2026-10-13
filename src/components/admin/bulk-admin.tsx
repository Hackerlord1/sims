"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResourceTable, type Mode } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader, Ref, ScrollRegion } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { EmptyState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { RESOURCES } from "@/lib/resources/registry";

interface Batch {
  id: string;
  reference: string;
  action: string;
  entityType: string;
  reason: string | null;
  affectedCount: number;
  recordCount: number;
  skipped: { id: string; reason: string }[] | null;
  createdAt: string;
  createdBy: string;
  restoredAt: string | null;
  restoredBy: string | null;
}

export function BatchHistory({ onlyDeletions }: { onlyDeletions?: boolean }) {
  const can = useCan();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [restore, setRestore] = useState<Batch | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ["bulk-batches", page],
    queryFn: ({ signal }) => apiGet<Batch[]>("/bulk-batches", { page, pageSize: 20 }, signal),
    placeholderData: keepPreviousData,
  });
  const rows = (data?.data ?? []).filter((b) => !onlyDeletions || b.action === "SOFT_DELETE");
  return (
    <Card title={onlyDeletions ? "Deletion batches" : "Bulk action history"}>
      {!data ? (
        <LoadingRows rows={3} />
      ) : rows.length === 0 ? (
        <EmptyState title="No batches yet" />
      ) : (
        <ScrollRegion className="overflow-x-auto" label="Bulk action batches">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Bulk action batches</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1.5 text-left">
                  Batch
                </th>
                <th scope="col" className="py-1.5 text-left">
                  Action
                </th>
                <th scope="col" className="py-1.5 text-left">
                  Records
                </th>
                <th scope="col" className="py-1.5 text-right">
                  Affected
                </th>
                <th scope="col" className="py-1.5 text-right">
                  Skipped
                </th>
                <th scope="col" className="py-1.5 text-left">
                  Reason
                </th>
                <th scope="col" className="py-1.5 text-left">
                  By
                </th>
                <th scope="col" className="py-1.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="py-1.5">
                    <Ref className="text-xs">{b.reference}</Ref>
                  </td>
                  <td className="py-1.5">
                    <StatusBadge value={b.action} />
                  </td>
                  <td className="py-1.5">{RESOURCES.find((r) => r.key === b.entityType)?.plural ?? b.entityType}</td>
                  <td className="tabular py-1.5 text-right">{b.affectedCount}</td>
                  <td className="tabular py-1.5 text-right" title={b.skipped?.map((s) => s.reason).join("\n")}>
                    {b.skipped?.length ?? 0}
                  </td>
                  <td className="max-w-56 truncate py-1.5 text-xs" title={b.reason ?? undefined}>
                    {b.reason ?? "—"}
                  </td>
                  <td className="py-1.5 text-xs">
                    {b.createdBy} · <DateText value={b.createdAt} withTime />
                  </td>
                  <td className="py-1.5 text-right">
                    {b.action === "SOFT_DELETE" && !b.restoredAt && b.affectedCount > 0 && can("DATA_ADMIN", "RESTORE") ? (
                      <Button size="sm" variant="secondary" onClick={() => setRestore(b)}>
                        <RotateCcw className="h-4 w-4" aria-hidden /> Restore batch
                      </Button>
                    ) : b.restoredAt ? (
                      <span className="text-xs text-muted">Restored by {b.restoredBy}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.meta && data.meta.totalPages > 1 ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </ScrollRegion>
      )}
      <ConfirmDialog
        open={Boolean(restore)}
        onOpenChange={(o) => !o && setRestore(null)}
        title={`Restore every record in ${restore?.reference}?`}
        description={`${restore?.affectedCount ?? 0} record(s) will return from the Recycle Bin in one transaction.`}
        confirmLabel="Restore batch"
        requireReason
        reasonLabel="Reason for restoration"
        onConfirm={async (reason) => {
          try {
            const res = await apiPost<{ affected: number }>(`/bulk-batches/${restore!.id}/restore`, { reason });
            toast.success(`${res.data.affected} record(s) restored.`);
          } catch (e) {
            throw new Error(errorMessage(e));
          }
          await refetch();
          await qc.invalidateQueries({ queryKey: ["list"] });
          await qc.invalidateQueries({ queryKey: ["recycle-summary"] });
        }}
      />
    </Card>
  );
}

export function BulkAdmin({ recycleBin }: { recycleBin?: boolean }) {
  const [resource, setResource] = useState(recycleBin ? "invoices" : "cases");
  const mode: Mode = recycleBin ? "deleted" : "active";
  const summary = useQuery({
    queryKey: ["recycle-summary"],
    queryFn: ({ signal }) => apiGet<{ resource: string; label: string; count: number }[]>("/recycle-bin/summary", undefined, signal),
    enabled: Boolean(recycleBin),
  });
  const options = RESOURCES.filter((r) => r.softDelete !== false);
  return (
    <>
      <PageHeader
        title={recycleBin ? "Recycle Bin" : "Bulk administrative actions"}
        description={
          recycleBin
            ? "Soft-deleted records across your cases. Restore records one at a time, as a selection, or a whole deletion batch. Nothing here is permanently deleted without the separate approval workflow."
            : "Select individual records, the current page, or every record matching the filters, then archive, delete, restore, reassign, change status or export. Each run is one transaction with a batch reference; protected records are skipped and reported."
        }
      />
      {recycleBin ? (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Deleted records by type">
          {summary.data?.data.map((s) => (
            <button
              key={s.resource}
              type="button"
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-accent-soft"
              aria-pressed={resource === s.resource}
              onClick={() => setResource(s.resource)}
            >
              {s.label} <strong className="tabular">{s.count}</strong>
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-4 max-w-sm">
          <Field id="bulk-resource" label="Record type">
            <Select id="bulk-resource" value={resource} onChange={(e) => setResource(e.target.value)}>
              {options.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.plural}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      <ResourceTable key={`${resource}-${mode}`} resource={resource} mode={mode} allowModeSwitch={!recycleBin} allowCreate={false} />
      <div className="mt-5">
        <BatchHistory onlyDeletions={recycleBin} />
      </div>
    </>
  );
}
