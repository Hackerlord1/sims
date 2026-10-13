"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FilePlus2, Fingerprint, Lock, LockOpen, Truck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DropZone, EVIDENCE_ACCEPT } from "@/components/evidence/upload-evidence";
import type { ExtensionProps } from "@/components/resources/detail-extensions";
import { ActionDialog, PanelSection } from "@/components/resources/extensions/action";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { DateText, Ref } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { API_BASE, apiGet, apiPost, errorMessage, uploadWithProgress } from "@/lib/api-client";
import { enumLabel } from "@/lib/enums";

interface Detail {
  original: { mimeType: string; sizeBytes: number; scanStatus: string } | null;
  versions: { id: string; version: number; sha256: string; note: string | null; createdAt: string; createdBy: string }[];
  access: { id: string; action: string; detail: string | null; createdAt: string; user: string }[];
  custody: { id: string; action: string; fromHolder: string | null; toHolder: string; purpose: string; occurredAt: string; recordedBy: string }[];
}

export function EvidencePanel({ row, refresh }: ExtensionProps) {
  const can = useCan();
  const { data, refetch } = useQuery({
    queryKey: ["evidence-detail", row.id],
    queryFn: ({ signal }) => apiGet<Detail>(`/evidence/${row.id}/detail`, undefined, signal),
  });
  const d = data?.data;
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [custody, setCustody] = useState({ action: "TRANSFERRED", fromHolder: "", toHolder: "", purpose: "", occurredAt: "" });
  const [holdReason, setHoldReason] = useState("");
  const after = async () => {
    await refetch();
    await refresh();
  };

  return (
    <div className="space-y-3">
      <div className="depth vault-banner rounded-xl border border-border bg-surface p-3">
        <p className="text-xs font-medium text-muted">SHA-256 of the read-only original</p>
        <Ref className="mt-1 block text-xs break-all">{String(row.sha256)}</Ref>
        <p className="mt-2 text-xs text-muted">{d?.original ? `${d.original.mimeType} · ${(d.original.sizeBytes / 1024).toFixed(0)} KB · malware scan: ${enumLabel(d.original.scanStatus)}` : null}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button asChild size="sm" variant="secondary">
            <a href={`${API_BASE}/evidence/${row.id}/file?which=original&inline=1`} target="_blank" rel="noopener noreferrer">
              <Eye className="h-4 w-4" aria-hidden /> Preview original
            </a>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href={`${API_BASE}/evidence/${row.id}/file?which=original`}>
              <Download className="h-4 w-4" aria-hidden /> Download original
            </a>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href={`${API_BASE}/evidence/${row.id}/file?which=latest`}>
              <Download className="h-4 w-4" aria-hidden /> Latest working copy
            </a>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              try {
                const r = await apiPost<{ ok: boolean }>(`/evidence/${row.id}/verify-hash`);
                if (r.data.ok) toast.success("Integrity verified: the original matches its recorded hash.");
                else toast.error("Integrity check FAILED. Administrators have been alerted.");
                await refetch();
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Fingerprint className="h-4 w-4" aria-hidden /> Verify hash
          </Button>
        </div>
      </div>

      <PanelSection
        title="Working copies"
        actions={
          can("EVIDENCE", "EDIT") ? (
            <ActionDialog
              label="New working version"
              icon={<FilePlus2 className="h-4 w-4" aria-hidden />}
              variant="secondary"
              title="Add a working-copy version"
              description="Upload an annotated or redacted copy. The original is never changed."
              submitLabel="Upload version"
              onSubmit={async () => {
                if (!file) throw new Error("Choose a file.");
                if (!note.trim()) throw new Error("Describe what changed.");
                const form = new FormData();
                form.set("file", file);
                form.set("note", note);
                await uploadWithProgress(`/evidence/${row.id}/versions`, form);
                toast.success("Working version added.");
                setFile(null);
                setNote("");
                await after();
              }}
            >
              <DropZone file={file} onFile={setFile} accept={EVIDENCE_ACCEPT} />
              <Field id="ver-note" label="What changed" required>
                <Textarea id="ver-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </Field>
            </ActionDialog>
          ) : null
        }
      >
        <ul className="divide-y divide-border text-sm">
          {d?.versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span>
                <strong>v{v.version}</strong> · {v.note} ·{" "}
                <span className="text-muted">
                  {v.createdBy}, <DateText value={v.createdAt} withTime />
                </span>
              </span>
              <a className="text-xs text-accent underline" href={`${API_BASE}/evidence/${row.id}/file?which=${v.version}`}>
                Download v{v.version}
              </a>
            </li>
          ))}
        </ul>
      </PanelSection>

      <PanelSection
        title="Chain of custody"
        actions={
          can("EVIDENCE", "EDIT") ? (
            <ActionDialog
              label="Record custody event"
              icon={<Truck className="h-4 w-4" aria-hidden />}
              variant="secondary"
              title="Record a custody event"
              submitLabel="Record"
              onSubmit={async () => {
                await apiPost(`/evidence/${row.id}/custody`, custody);
                toast.success("Custody event recorded.");
                setCustody({ action: "TRANSFERRED", fromHolder: "", toHolder: "", purpose: "", occurredAt: "" });
                await after();
              }}
            >
              <Field id="cu-action" label="Event">
                <Select id="cu-action" value={custody.action} onChange={(e) => setCustody({ ...custody, action: e.target.value })}>
                  {["TRANSFERRED", "RETURNED", "SUBMITTED_TO_AUTHORITY", "STORED", "RECEIVED"].map((a) => (
                    <option key={a} value={a}>
                      {enumLabel(a)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="cu-from" label="From">
                <Input id="cu-from" value={custody.fromHolder} onChange={(e) => setCustody({ ...custody, fromHolder: e.target.value })} />
              </Field>
              <Field id="cu-to" label="To (current holder)" required>
                <Input id="cu-to" value={custody.toHolder} onChange={(e) => setCustody({ ...custody, toHolder: e.target.value })} />
              </Field>
              <Field id="cu-purpose" label="Purpose" required>
                <Input id="cu-purpose" value={custody.purpose} onChange={(e) => setCustody({ ...custody, purpose: e.target.value })} />
              </Field>
              <Field id="cu-at" label="Date and time" required>
                <Input id="cu-at" type="datetime-local" value={custody.occurredAt} onChange={(e) => setCustody({ ...custody, occurredAt: e.target.value })} />
              </Field>
            </ActionDialog>
          ) : null
        }
      >
        <ol className="space-y-1.5 text-sm">
          {d?.custody.map((c) => (
            <li key={c.id} className="border-l-2 border-accent/40 pl-3">
              <strong>{enumLabel(c.action)}</strong> {c.fromHolder ? `from ${c.fromHolder} ` : ""}to {c.toHolder} — {c.purpose}
              <span className="block text-xs text-muted">
                <DateText value={c.occurredAt} withTime /> · recorded by {c.recordedBy}
              </span>
            </li>
          ))}
        </ol>
      </PanelSection>

      {can("CASES", "APPROVE") ? (
        <PanelSection
          title={row.legalHold ? "Legal hold is active" : "Legal hold"}
          actions={
            <ActionDialog
              label={row.legalHold ? "Release hold" : "Place hold"}
              icon={row.legalHold ? <LockOpen className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
              variant="secondary"
              title={row.legalHold ? "Release legal hold on this item?" : "Place this item under legal hold?"}
              onSubmit={async () => {
                if (holdReason.trim().length < 3) throw new Error("Enter a reason.");
                await apiPost(`/evidence/${row.id}/legal-hold`, { on: !row.legalHold, reason: holdReason });
                toast.success(row.legalHold ? "Legal hold released." : "Legal hold placed.");
                setHoldReason("");
                await after();
              }}
            >
              <Field id="hold-reason" label="Reason" required>
                <Textarea id="hold-reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
              </Field>
            </ActionDialog>
          }
        />
      ) : null}

      <details className="rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Access and download history ({d?.access.length ?? 0})</summary>
        <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto">
          {d?.access.map((a) => (
            <li key={a.id} className="py-1">
              <strong>{enumLabel(a.action)}</strong> · {a.user}
              {a.detail ? ` · ${a.detail}` : ""} ·{" "}
              <span className="text-muted">
                <DateText value={a.createdAt} withTime />
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
