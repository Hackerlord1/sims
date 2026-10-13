"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Check, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Cell } from "@/components/resources/cells";
import type { Row as RecordRow } from "@/components/resources/hooks";
import { useSession } from "@/components/session-context";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader, Ref, ScrollRegion } from "@/components/ui/display";
import { Drawer } from "@/components/ui/dialog";
import { Field, FormAlert, Textarea } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { enumLabel } from "@/lib/enums";
import { RESOURCE_MAP } from "@/lib/resources/registry";
import type { FieldDef } from "@/lib/resources/types";

type Row = Record<string, unknown>;

interface ChangeRow {
  id: string;
  reference: string;
  resourceKey: string;
  operation: "CREATE" | "UPDATE" | "IMPORT";
  recordId: string | null;
  caseId: string | null;
  summary: string;
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewComment: string | null;
  appliedRecordId: string | null;
  failureReason: string | null;
  requestedById: string;
  requestedBy: { fullName: string; username: string };
  reviewer: { fullName: string } | null;
  case: { reference: string; title: string } | null;
  canDecide?: boolean;
}
interface ChangeDetail extends ChangeRow {
  canDecide: boolean;
  canWithdraw: boolean;
  proposed: Row | null;
  current: Row | null;
  changedFields: string[] | null;
  stale: boolean;
  importBatchId: string | null;
}

const OPERATION_LABEL = { CREATE: "New record", UPDATE: "Edit", IMPORT: "Bulk import" } as const;

/** Where the applied record lives, so reviewers and submitters can jump to it. */
function recordHref(c: ChangeRow): string | null {
  const id = c.appliedRecordId ?? c.recordId;
  if (c.operation === "IMPORT") return `/admin/data?batch=${c.recordId}`;
  if (c.resourceKey === "cases" && id) return `/cases/${id}`;
  if (c.caseId) return `/cases/${c.caseId}`;
  return null;
}

export function ChangeApprovals() {
  const s = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get("mine") === "1" || !s.dataApprover ? "mine" : "pending");
  const [page, setPage] = useState(1);
  const openId = params.get("id");

  const query = tab === "pending" ? { status: "PENDING", mine: "false" } : tab === "mine" ? { mine: "true" } : { mine: "false" };
  const list = useQuery({
    queryKey: ["change-requests", tab, page],
    queryFn: ({ signal }) => apiGet<ChangeRow[]>("/change-requests", { ...query, page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
  });
  const open = (id: string | null) => router.replace(id ? `/admin/approvals?id=${id}${tab === "mine" ? "&mine=1" : ""}` : `/admin/approvals${tab === "mine" ? "?mine=1" : ""}`, { scroll: false });

  const rows = (list.data?.data ?? []).filter((r) => tab !== "pending" || r.requestedById !== s.id);

  return (
    <>
      <PageHeader
        eyebrow="Maker-checker"
        title={s.dataApprover ? "Data-change approvals" : "My submitted changes"}
        description="New records, edits and imports of the record types chosen in System settings wait here until another approver accepts them. Nothing changes in the system before approval, and nobody approves their own change."
      />
      <Tabs.Root
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          setPage(1);
        }}
      >
        <Tabs.List aria-label="Changes" className="mb-4 flex gap-1 border-b border-border">
          {s.dataApprover ? (
            <Tabs.Trigger value="pending" className="tab-trigger px-3 py-2 text-sm text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text">
              Awaiting decision
            </Tabs.Trigger>
          ) : null}
          <Tabs.Trigger value="mine" className="tab-trigger px-3 py-2 text-sm text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text">
            My submissions
          </Tabs.Trigger>
          {s.dataApprover ? (
            <Tabs.Trigger value="all" className="tab-trigger px-3 py-2 text-sm text-muted hover:text-text data-[state=active]:font-semibold data-[state=active]:text-text">
              All changes
            </Tabs.Trigger>
          ) : null}
        </Tabs.List>
      </Tabs.Root>

      <Card>
        {list.isError ? (
          <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        ) : !list.data ? (
          <LoadingRows />
        ) : rows.length === 0 ? (
          <EmptyState
            title={tab === "pending" ? "Nothing awaiting your decision" : "No changes"}
            description={tab === "mine" ? "Changes you submit for approval appear here with their outcome." : "Submitted changes appear here and approvers are notified."}
          />
        ) : (
          <ScrollRegion className="overflow-x-auto" label="Data changes">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Data changes</caption>
              <thead>
                <tr className="border-b border-border-strong text-left text-muted">
                  <th scope="col" className="py-2 pr-3">
                    Change
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Submitted by
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Status
                  </th>
                  <th scope="col" className="py-2">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="metric-row">
                    <td className="py-2.5 pr-3 align-top">
                      <span className="flex flex-wrap items-center gap-2">
                        <Ref className="text-xs text-muted">{c.reference}</Ref>
                        <Badge tone={c.operation === "IMPORT" ? "info" : c.operation === "CREATE" ? "accent" : "neutral"}>{OPERATION_LABEL[c.operation]}</Badge>
                        {c.case ? <Ref className="text-xs text-muted">{c.case.reference}</Ref> : null}
                      </span>
                      <span className="mt-0.5 block font-medium">{c.summary}</span>
                    </td>
                    <td className="py-2.5 pr-3 align-top text-xs">
                      {c.requestedBy.fullName}
                      <span className="block text-muted">
                        <DateText value={c.requestedAt} withTime />
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <StatusBadge value={c.status} />
                      {c.reviewer ? <span className="mt-0.5 block text-xs text-muted">by {c.reviewer.fullName}</span> : null}
                    </td>
                    <td className="py-2.5 text-right align-top">
                      <Button size="sm" variant={c.canDecide ? "primary" : "outline"} onClick={() => open(c.id)}>
                        {c.canDecide ? "Review" : "Open"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.data.meta && list.data.meta.totalPages > 1 ? (
              <div className="mt-3 flex gap-2">
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
      </Card>

      <ChangeDrawer id={openId} onClose={() => open(null)} />
    </>
  );
}

function ChangeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  return (
    <Drawer open={Boolean(id)} onOpenChange={(o) => !o && onClose()} width="xl" title="Change for approval">
      {id ? <ChangeBody key={id} id={id} onClose={onClose} /> : null}
    </Drawer>
  );
}

function ChangeBody({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["change-request", id], queryFn: ({ signal }) => apiGet<ChangeDetail>(`/change-requests/${id}`, undefined, signal) });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data) return <LoadingRows rows={8} />;
  const c = q.data.data;
  const r = RESOURCE_MAP[c.resourceKey];
  const href = recordHref(c);

  const act = async (kind: "approve" | "reject" | "withdraw") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "withdraw") await apiPost(`/change-requests/${id}/withdraw`);
      else await apiPost(`/change-requests/${id}/decision`, { approve: kind === "approve", comment: comment || undefined });
      toast.success(kind === "approve" ? "Change approved and applied." : kind === "reject" ? "Change rejected." : "Change withdrawn.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["change-requests"] }),
        qc.invalidateQueries({ queryKey: ["change-request", id] }),
        qc.invalidateQueries({ queryKey: ["list", c.resourceKey] }),
      ]);
      if (kind !== "reject") onClose();
    } catch (e) {
      setError(errorMessage(e));
      await q.refetch();
    } finally {
      setBusy(null);
    }
  };

  const fields: FieldDef[] = r
    ? r.fields.filter((f) =>
        c.operation === "UPDATE" ? c.changedFields?.includes(f.name) : c.proposed && c.proposed[f.name] !== null && c.proposed[f.name] !== undefined && c.proposed[f.name] !== "",
      )
    : [];

  return (
    <div className="space-y-5">
      <div className="space-y-2 border-b border-dashed border-border pb-4">
        <p className="flex flex-wrap items-center gap-2">
          <Ref className="text-sm">{c.reference}</Ref>
          <StatusBadge value={c.status} />
          <Badge>{OPERATION_LABEL[c.operation]}</Badge>
          {r ? <Badge tone="neutral">{r.label}</Badge> : null}
        </p>
        <p className="font-display text-xl">{c.summary}</p>
        <p className="text-xs text-muted">
          Submitted by {c.requestedBy.fullName} (<Ref>{c.requestedBy.username}</Ref>) on <DateText value={c.requestedAt} withTime />
          {c.case ? (
            <>
              {" "}
              · case <Ref>{c.case.reference}</Ref> {c.case.title}
            </>
          ) : null}
        </p>
        {c.reviewer ? (
          <p className="text-xs text-muted">
            {enumLabel(c.status)} by {c.reviewer.fullName} on <DateText value={c.reviewedAt} withTime />
            {c.reviewComment ? ` — “${c.reviewComment}”` : ""}
          </p>
        ) : null}
        {c.failureReason ? <FormAlert>{c.failureReason}</FormAlert> : null}
      </div>

      {c.stale && c.status === "PENDING" ? (
        <FormAlert tone="warning">
          <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden />
          The record has changed since this edit was submitted. Approving will fail; reject it and ask the submitter to make the change again.
        </FormAlert>
      ) : null}

      {c.operation === "IMPORT" ? (
        <div className="space-y-2 text-sm">
          <p>Approving starts the bulk import. Every valid row is written as the submitter, with the import checks run again at that moment.</p>
          {c.importBatchId ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/admin/data?batch=${c.importBatchId}`}>
                Inspect the rows in Data administration <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : fields.length ? (
        <ScrollRegion label="Proposed values" className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{c.operation === "UPDATE" ? "Current and proposed values" : "Proposed values"}</caption>
            <thead>
              <tr className="border-b border-border-strong text-left text-muted">
                <th scope="col" className="w-1/4 py-2 pr-3">
                  Field
                </th>
                {c.operation === "UPDATE" ? (
                  <th scope="col" className="py-2 pr-3">
                    Now
                  </th>
                ) : null}
                <th scope="col" className="py-2">
                  {c.operation === "UPDATE" ? "Proposed" : "Value"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fields.map((f) => (
                <tr key={f.name}>
                  <th scope="row" className="py-2 pr-3 text-left align-top font-normal text-muted">
                    {f.label}
                  </th>
                  {c.operation === "UPDATE" ? (
                    <td className="py-2 pr-3 align-top text-muted line-through decoration-danger/50">{c.current ? <Cell field={f} row={c.current as RecordRow} full /> : "—"}</td>
                  ) : null}
                  <td className="py-2 align-top">
                    <span className={c.operation === "UPDATE" ? "marked" : undefined}>{c.proposed ? <Cell field={f} row={c.proposed as RecordRow} full /> : "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      ) : (
        <p className="text-sm text-muted">No field values to show.</p>
      )}

      {error ? <FormAlert>{error}</FormAlert> : null}

      {c.canDecide ? (
        <div className="space-y-3 border-t border-border pt-4">
          <Field id="decision-comment" label="Comment" hint="Required when rejecting. Kept with the change and in the audit log.">
            <Textarea id="decision-comment" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" loading={busy === "reject"} disabled={Boolean(busy) || !comment.trim()} onClick={() => act("reject")}>
              <X className="h-4 w-4" aria-hidden /> Reject
            </Button>
            <Button loading={busy === "approve"} disabled={Boolean(busy)} onClick={() => act("approve")}>
              <Check className="h-4 w-4" aria-hidden /> Approve and apply
            </Button>
          </div>
        </div>
      ) : c.canWithdraw ? (
        <div className="flex justify-end border-t border-border pt-4">
          <Button variant="outline" loading={busy === "withdraw"} onClick={() => act("withdraw")}>
            <Undo2 className="h-4 w-4" aria-hidden /> Withdraw my change
          </Button>
        </div>
      ) : null}

      {href && c.status === "APPLIED" ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={href}>
            Open the record <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
