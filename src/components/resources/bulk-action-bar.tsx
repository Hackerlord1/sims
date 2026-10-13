"use client";

import { Archive, ArchiveRestore, Download, RotateCcw, Trash2, UserCheck, X, Replace } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AsyncSelect } from "@/components/resources/async-select";
import type { Mode } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Field, FormAlert, Select, Textarea } from "@/components/ui/field";
import { apiPost, downloadFromApi, errorMessage } from "@/lib/api-client";
import { enumOptions } from "@/lib/enums";
import type { ResourceDef } from "@/lib/resources/types";

export interface BulkFilter {
  caseId?: string;
  matterId?: string;
  q?: string;
  filters?: Record<string, string>;
  deleted?: "only";
  archived?: "only";
}

export interface BulkResult {
  reference: string;
  affected: number;
  skipped: { id: string; reason: string }[];
}

type Pending = "ARCHIVE" | "UNARCHIVE" | "SOFT_DELETE" | "RESTORE" | "REASSIGN" | "CHANGE_STATUS" | null;

export function BulkActionBar({
  resource: r,
  mode,
  count,
  ids,
  filter,
  onDone,
  onClear,
}: {
  resource: ResourceDef;
  mode: Mode;
  count: number;
  ids?: string[];
  filter?: BulkFilter;
  /** Receives the batch result; the caller shows it because the bar unmounts once the selection is cleared. */
  onDone: (result: BulkResult) => void;
  onClear: () => void;
}) {
  const can = useCan();
  const [pending, setPending] = useState<Pending>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statusField = r.statusField ? r.fields.find((f) => f.name === r.statusField && !f.workflow) : undefined;
  const assigneeField = r.assigneeField ? r.fields.find((f) => f.name === r.assigneeField) : undefined;

  const run = async (action: Exclude<Pending, null>, extra: Record<string, unknown> = {}) => {
    const res = await apiPost<BulkResult>(`/bulk/${r.key}`, { action, ids, filter, ...extra });
    toast.success(`${res.data.affected} record(s) updated · batch ${res.data.reference}`);
    onDone(res.data);
  };

  const exportSelection = async (format: "csv" | "xlsx") => {
    try {
      await downloadFromApi(`/export/${r.key}`, { method: "POST", body: { format, ids, filter }, fallbackName: `${r.key}.${format}` });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-3 py-2" role="region" aria-label="Bulk actions">
      <p className="text-sm font-semibold" aria-live="polite">
        {count} selected
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {mode === "active" && can(r.module, "ARCHIVE") ? (
          <Button size="sm" variant="secondary" onClick={() => setPending("ARCHIVE")}>
            <Archive className="h-4 w-4" aria-hidden /> Archive
          </Button>
        ) : null}
        {mode === "archived" && can(r.module, "ARCHIVE") ? (
          <Button size="sm" variant="secondary" onClick={() => setPending("UNARCHIVE")}>
            <ArchiveRestore className="h-4 w-4" aria-hidden /> Unarchive
          </Button>
        ) : null}
        {mode !== "deleted" && can(r.module, "SOFT_DELETE") ? (
          <Button size="sm" variant="secondary" onClick={() => setPending("SOFT_DELETE")}>
            <Trash2 className="h-4 w-4" aria-hidden /> Move to Recycle Bin
          </Button>
        ) : null}
        {mode === "deleted" && can(r.module, "RESTORE") ? (
          <Button size="sm" variant="secondary" onClick={() => setPending("RESTORE")}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Restore
          </Button>
        ) : null}
        {mode === "active" && assigneeField && can(r.module, "EDIT") ? (
          <Button size="sm" variant="secondary" onClick={() => setPending("REASSIGN")}>
            <UserCheck className="h-4 w-4" aria-hidden /> Reassign
          </Button>
        ) : null}
        {mode === "active" && statusField && can(r.module, "EDIT") ? (
          <Button size="sm" variant="secondary" onClick={() => setPending("CHANGE_STATUS")}>
            <Replace className="h-4 w-4" aria-hidden /> Change {statusField.label.toLowerCase()}
          </Button>
        ) : null}
        {can(r.module, "EXPORT") ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => exportSelection("xlsx")}>
              <Download className="h-4 w-4" aria-hidden /> Export .xlsx
            </Button>
            <Button size="sm" variant="ghost" onClick={() => exportSelection("csv")}>
              CSV
            </Button>
          </>
        ) : null}
      </div>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X className="h-4 w-4" aria-hidden /> Clear selection
      </Button>

      <ConfirmDialog
        open={pending === "ARCHIVE" || pending === "UNARCHIVE"}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending === "ARCHIVE" ? `Archive ${count} record(s)?` : `Return ${count} record(s) to active lists?`}
        description="Archived records leave active lists but remain searchable, reportable and restorable."
        confirmLabel={pending === "ARCHIVE" ? "Archive" : "Unarchive"}
        onConfirm={(why) => run(pending!, { reason: why || undefined })}
      />
      <ConfirmDialog
        open={pending === "SOFT_DELETE"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Move ${count} record(s) to the Recycle Bin?`}
        description="Protected records (evidence, signed statements, verified receipts, court orders, records under legal hold) are skipped. Everything moved can be restored from the Recycle Bin."
        confirmLabel="Move to Recycle Bin"
        tone="danger"
        requireReason
        reasonLabel="Reason for deletion"
        onConfirm={(why) => run("SOFT_DELETE", { reason: why })}
      />
      <ConfirmDialog
        open={pending === "RESTORE"}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Restore ${count} record(s)?`}
        confirmLabel="Restore"
        requireReason
        reasonLabel="Reason for restoration"
        onConfirm={(why) => run("RESTORE", { reason: why })}
      />
      <Modal
        open={pending === "REASSIGN" || pending === "CHANGE_STATUS"}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setError(null);
          }
        }}
        title={pending === "REASSIGN" ? `Reassign ${count} record(s)` : `Change ${statusField?.label.toLowerCase()} for ${count} record(s)`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setError(null);
                if (pending === "REASSIGN" && !assignee) return setError("Choose a user.");
                if (pending === "CHANGE_STATUS" && !status) return setError("Choose a value.");
                setBusy(true);
                try {
                  await run(pending!, pending === "REASSIGN" ? { assigneeId: assignee, reason: reason || undefined } : { status, reason: reason || undefined });
                  setPending(null);
                  setReason("");
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {pending === "REASSIGN" && assigneeField ? (
            <Field id="bulk-assignee" label={assigneeField.label} required>
              <AsyncSelect id="bulk-assignee" path="/options/users" value={assignee} onChange={setAssignee} />
            </Field>
          ) : null}
          {pending === "CHANGE_STATUS" && statusField ? (
            <Field id="bulk-status" label={statusField.label} required>
              <Select id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Select…</option>
                {enumOptions(statusField.enum!).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field id="bulk-reason" label="Reason (optional)">
            <Textarea id="bulk-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

export function BulkResultDialog({ result, onClose }: { result: BulkResult | null; onClose: () => void }) {
  return (
    <Modal open={Boolean(result)} onOpenChange={(o) => !o && onClose()} title={`Batch ${result?.reference ?? ""}`} size="md">
      {result ? (
        <div className="space-y-3 text-sm">
          <p>
            <strong>{result.affected}</strong> record(s) updated. <strong>{result.skipped.length}</strong> skipped.
          </p>
          {result.skipped.length ? (
            <ul className="max-h-64 list-disc space-y-1 overflow-y-auto pl-5">
              {result.skipped.slice(0, 200).map((s) => (
                <li key={s.id}>
                  <span className="ref text-xs">{s.id.slice(0, 10)}…</span> — {s.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
