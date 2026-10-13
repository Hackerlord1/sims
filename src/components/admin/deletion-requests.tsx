"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ShieldAlert, Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { reauthenticate } from "@/components/admin/reauth";
import { useResourceList } from "@/components/resources/hooks";
import { useCan, useSession } from "@/components/session-context";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, DateText, PageHeader, Ref } from "@/components/ui/display";
import { Modal } from "@/components/ui/dialog";
import { Field, FormAlert, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState, LoadingRows } from "@/components/ui/states";
import { apiGet, apiPost, errorMessage } from "@/lib/api-client";
import { RESOURCES, getResource } from "@/lib/resources/registry";
import { rowLabelClient } from "@/components/admin/row-label";

interface Req {
  id: string;
  reference: string;
  entityType: string;
  entityIds: string[];
  reason: string;
  status: string;
  checks: { id: string; ok: boolean; problems: string[] }[];
  requestedAt: string;
  requestedBy: string;
  requestedById: string;
  approver: string | null;
  decisionComment: string | null;
  resourceLabel: string;
}

const PURGEABLE = RESOURCES.filter((r) => r.softDelete !== false && r.key !== "evidence" && r.key !== "financial-statements");

export function DeletionRequests() {
  const can = useCan();
  const me = useSession();
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["deletion-requests", page], queryFn: ({ signal }) => apiGet<Req[]>("/deletion-requests", { page, pageSize: 20 }, signal), placeholderData: keepPreviousData });
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<{ req: Req; approve: boolean } | null>(null);

  return (
    <>
      <PageHeader
        title="Permanent deletion"
        description="Permanent deletion is separate from the Recycle Bin. It needs a reason, passes retention, dependency, legal-hold and protection checks, requires both people to confirm their passwords, and must be approved by a different user. The audit record of the deletion is kept permanently. Original evidence, original statements, signed statements, verified receipts, court orders and judgments can never be permanently deleted."
        actions={
          can("DATA_ADMIN", "REQUEST_PERMANENT_DELETION") ? (
            <Button variant="danger" onClick={() => setCreating(true)}>
              <Trash className="h-4 w-4" aria-hidden /> Request permanent deletion
            </Button>
          ) : null
        }
      />
      <Card title="Requests">
        {!list.data ? (
          <LoadingRows />
        ) : list.data.data.length === 0 ? (
          <EmptyState title="No permanent-deletion requests" />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.data.map((r) => (
              <li key={r.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Ref>{r.reference}</Ref> <StatusBadge value={r.status} /> {r.entityIds.length} {r.resourceLabel.toLowerCase()}
                  </span>
                  <span className="flex gap-2">
                    {r.status === "PENDING" && can("DATA_ADMIN", "APPROVE_PERMANENT_DELETION") && r.requestedById !== me.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => setDeciding({ req: r, approve: true })}>
                          Approve and delete
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setDeciding({ req: r, approve: false })}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {["PENDING", "BLOCKED"].includes(r.status) && r.requestedById === me.id ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          try {
                            await apiPost(`/deletion-requests/${r.id}/cancel`);
                            toast.success("Request cancelled.");
                            await list.refetch();
                          } catch (e) {
                            toast.error(errorMessage(e));
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </span>
                </div>
                <p className="text-muted">
                  Requested by {r.requestedBy} on <DateText value={r.requestedAt} withTime />. Reason: {r.reason}
                </p>
                {r.status === "PENDING" && r.requestedById === me.id ? <p className="text-xs text-muted">Another authorised user must approve this request.</p> : null}
                {r.approver ? (
                  <p className="text-xs text-muted">
                    Decided by {r.approver}: {r.decisionComment}
                  </p>
                ) : null}
                {r.checks.some((c) => !c.ok) ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-danger">Checks failed for {r.checks.filter((c) => !c.ok).length} record(s)</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {r.checks
                        .filter((c) => !c.ok)
                        .map((c) => (
                          <li key={c.id}>
                            <Ref>{c.id.slice(0, 10)}…</Ref> {c.problems.join(" ")}
                          </li>
                        ))}
                    </ul>
                  </details>
                ) : (
                  <p className="text-xs text-success">All checks passed.</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {list.data?.meta && list.data.meta.totalPages > 1 ? (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= list.data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </Card>
      {creating ? <NewRequest onClose={() => setCreating(false)} onDone={() => list.refetch()} /> : null}
      {deciding ? <Decision {...deciding} onClose={() => setDeciding(null)} onDone={() => list.refetch()} /> : null}
    </>
  );
}

function NewRequest({ onClose, onDone }: { onClose: () => void; onDone: () => unknown }) {
  const [resource, setResource] = useState(PURGEABLE[0]!.key);
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const deleted = useResourceList(resource, { deleted: "only", pageSize: 100 });
  const r = getResource(resource)!;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Request permanent deletion"
      description="Choose records that are already in the Recycle Bin."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setError(null);
              if (!selected.length) return setError("Select at least one record.");
              if (reason.trim().length < 10) return setError("Give a reason of at least 10 characters.");
              setBusy(true);
              try {
                await reauthenticate(password);
                const res = await apiPost<{ reference: string; status: string }>("/deletion-requests", { entityType: resource, entityIds: selected, reason });
                toast[res.data.status === "BLOCKED" ? "warning" : "success"](
                  res.data.status === "BLOCKED" ? `Request ${res.data.reference} recorded but blocked by the checks.` : `Request ${res.data.reference} awaits a second approver.`,
                );
                await onDone();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit request
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="pd-resource" label="Record type">
          <Select
            id="pd-resource"
            value={resource}
            onChange={(e) => {
              setResource(e.target.value);
              setSelected([]);
            }}
          >
            {PURGEABLE.map((x) => (
              <option key={x.key} value={x.key}>
                {x.plural}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="max-h-64 overflow-y-auto rounded-md border border-border p-2">
          <legend className="px-1 text-sm font-medium">Records in the Recycle Bin</legend>
          {deleted.isLoading ? (
            <LoadingRows rows={3} />
          ) : !deleted.data?.data.length ? (
            <p className="p-2 text-sm text-muted">No deleted {r.plural.toLowerCase()}.</p>
          ) : (
            deleted.data.data.map((row) => (
              <label key={row.id} className="flex items-start gap-2 py-1 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--accent)]"
                  checked={selected.includes(row.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((x) => x !== row.id))}
                />
                <span>
                  {rowLabelClient(r, row)}{" "}
                  <span className="block text-xs text-muted">
                    Deleted <DateText value={String(row.deletedAt)} /> — {String(row.deletionReason ?? "")}
                  </span>
                </span>
              </label>
            ))
          )}
        </fieldset>
        <Field id="pd-reason" label="Reason" required>
          <Textarea id="pd-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field id="pd-password" label="Confirm your password" required hint="Permanent deletion requires re-authentication.">
          <Input id="pd-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function Decision({ req, approve, onClose, onDone }: { req: Req; approve: boolean; onClose: () => void; onDone: () => unknown }) {
  const [comment, setComment] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={approve ? `Approve and permanently delete (${req.reference})?` : `Reject ${req.reference}?`}
      description={approve ? "The records are removed now and cannot be recovered. The checks are run again before deletion." : undefined}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={approve ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setError(null);
              if (comment.trim().length < 3) return setError("Enter a comment.");
              setBusy(true);
              try {
                await reauthenticate(password);
                await apiPost(`/deletion-requests/${req.id}/decision`, { approve, comment });
                toast.success(approve ? "Records permanently deleted." : "Request rejected.");
                await onDone();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {approve ? (
              <>
                <ShieldAlert className="h-4 w-4" aria-hidden /> Delete permanently
              </>
            ) : (
              "Reject"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id="dd-comment" label="Comment" required>
          <Textarea id="dd-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Field id="dd-password" label="Confirm your password" required>
          <Input id="dd-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
