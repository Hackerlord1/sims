"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Cell } from "@/components/resources/cells";
import { DETAIL_EXTENSIONS } from "@/components/resources/detail-extensions";
import { useResourceRow, type Row } from "@/components/resources/hooks";
import { ResourceForm } from "@/components/resources/resource-form";
import { useCan } from "@/components/session-context";
import { DemoBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Drawer } from "@/components/ui/dialog";
import { DescriptionList, Ref } from "@/components/ui/display";
import { ErrorState, LoadingRows } from "@/components/ui/states";
import { apiPost, errorMessage } from "@/lib/api-client";
import { getResource } from "@/lib/resources/registry";
import type { FieldDef } from "@/lib/resources/types";

export function RecordDetails({ resourceKey, row }: { resourceKey: string; row: Row }) {
  const r = getResource(resourceKey)!;
  const sections = useMemo(() => {
    const out = new Map<string, FieldDef[]>();
    for (const f of r.fields) {
      if (f.hidden) continue;
      const s = f.section ?? "Details";
      out.set(s, [...(out.get(s) ?? []), f]);
    }
    return [...out.entries()];
  }, [r]);
  return (
    <div className="space-y-5">
      {sections.map(([section, fields]) => (
        <section key={section} aria-label={section}>
          {sections.length > 1 ? <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{section}</h3> : null}
          <DescriptionList items={fields.map((f) => ({ label: f.label, value: <Cell field={f} row={row} full />, wide: f.type === "textarea" }))} />
        </section>
      ))}
    </div>
  );
}

export function ResourceDrawer({ resource: key, id, onClose, caseId }: { resource: string; id: string | null; onClose: () => void; caseId?: string }) {
  const r = getResource(key)!;
  const can = useCan();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "unarchive" | "delete" | "restore" | null>(null);
  const { data, isLoading, isError, error, refetch } = useResourceRow(key, id);
  const row = data?.data;
  const Extension = DETAIL_EXTENSIONS[key];

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["row", key, id] });
    await qc.invalidateQueries({ queryKey: ["list"] });
    await qc.invalidateQueries({ queryKey: ["case-summary"] });
  };

  const lifecycle = async (action: "archive" | "unarchive" | "delete" | "restore", reason: string) => {
    try {
      await apiPost(`/${key}/${id}/${action}`, { reason: reason || undefined });
    } catch (e) {
      throw new Error(errorMessage(e));
    }
    toast.success(
      action === "delete"
        ? `${r.label} moved to the Recycle Bin.`
        : action === "restore"
          ? `${r.label} restored.`
          : action === "archive"
            ? `${r.label} archived.`
            : `${r.label} returned to active lists.`,
    );
    await qc.invalidateQueries({ queryKey: ["list"] });
    if (action === "delete") onClose();
    else await refresh();
  };

  const title = row ? String(row[r.titleField] ?? r.label) : r.label;
  return (
    <Drawer
      open={Boolean(id)}
      onOpenChange={(o) => {
        if (!o) {
          setEditing(false);
          onClose();
        }
      }}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {r.referenceField && row?.[r.referenceField] && r.referenceField !== r.titleField ? <Ref className="text-muted">{String(row[r.referenceField])}</Ref> : null}
          <span className="font-display">{r.fields.find((f) => f.name === r.titleField)?.type === "enum" ? r.label : title.length > 80 ? title.slice(0, 77) + "…" : title}</span>
          {row?.isDemo ? <DemoBadge /> : null}
        </span>
      }
      description={row?.isDeleted ? "This record is in the Recycle Bin." : row?.archivedAt ? "This record is archived." : r.label}
      width="xl"
      footer={
        row && !editing ? (
          <>
            {!row.isDeleted && !row.archivedAt && can(r.module, "ARCHIVE") ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirm("archive")}>
                <Archive className="h-4 w-4" aria-hidden /> Archive
              </Button>
            ) : null}
            {row.archivedAt && !row.isDeleted && can(r.module, "ARCHIVE") ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirm("unarchive")}>
                <ArchiveRestore className="h-4 w-4" aria-hidden /> Unarchive
              </Button>
            ) : null}
            {!row.isDeleted && can(r.module, "SOFT_DELETE") ? (
              <Button variant="ghost" size="sm" onClick={() => setConfirm("delete")}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </Button>
            ) : null}
            {row.isDeleted && can(r.module, "RESTORE") ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm("restore")}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Restore
              </Button>
            ) : null}
            {!row.isDeleted && can(r.module, "EDIT") ? (
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading || !row ? (
        <LoadingRows rows={8} />
      ) : editing ? (
        <ResourceForm
          resource={r}
          row={row}
          caseId={caseId ?? (row.caseId as string | undefined)}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* Remount on every saved change so workflow dialogs default to the current values. */}
          {Extension ? <Extension key={`${row.id}:${String(row.version ?? row.updatedAt ?? "")}`} row={row} refresh={refresh} /> : null}
          <RecordDetails resourceKey={key} row={row} />
          {row.isDeleted ? (
            <p className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted">
              Deleted {row.deletedAt ? new Date(String(row.deletedAt)).toLocaleString("en-KE") : ""}. Reason: {String(row.deletionReason ?? "—")}
            </p>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={confirm === "archive" || confirm === "unarchive"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "archive" ? `Archive this ${r.label.toLowerCase()}?` : `Return this ${r.label.toLowerCase()} to active lists?`}
        confirmLabel={confirm === "archive" ? "Archive" : "Unarchive"}
        onConfirm={(reason) => lifecycle(confirm!, reason)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Move this ${r.label.toLowerCase()} to the Recycle Bin?`}
        description="It can be restored from the Recycle Bin. Protected records cannot be deleted."
        confirmLabel="Move to Recycle Bin"
        tone="danger"
        requireReason
        reasonLabel="Reason for deletion"
        onConfirm={(reason) => lifecycle("delete", reason)}
      />
      <ConfirmDialog
        open={confirm === "restore"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Restore this ${r.label.toLowerCase()}?`}
        confirmLabel="Restore"
        requireReason
        reasonLabel="Reason for restoration"
        onConfirm={(reason) => lifecycle("restore", reason)}
      />
    </Drawer>
  );
}
