"use client";

import { Download, Eye, Paperclip, Upload } from "lucide-react";
import { useState } from "react";
import { UploadEvidenceDialog } from "@/components/evidence/upload-evidence";
import { useResourceList } from "@/components/resources/hooks";
import { useCan } from "@/components/session-context";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateText, Ref } from "@/components/ui/display";
import { API_BASE } from "@/lib/api-client";

/** Documents linked to a record (receipts, cheque images, bank memos, supporting documents, attachments). */
export function LinkedEvidence({
  caseId,
  linkType,
  linkId,
  title = "Supporting documents",
  defaultCategory = "DOCUMENT",
  uploadLabel = "Attach document",
  readOnly,
}: {
  caseId: string;
  linkType: string;
  linkId: string;
  title?: string;
  defaultCategory?: string;
  uploadLabel?: string;
  readOnly?: boolean;
}) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useResourceList("evidence", { caseId, linkType, linkId, pageSize: 50, sort: "createdAt", order: "desc" });
  const rows = data?.data ?? [];
  return (
    <section aria-label={title} className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Paperclip className="h-4 w-4" aria-hidden /> {title}
        </h3>
        {!readOnly && can("EVIDENCE", "CREATE") ? (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden /> {uploadLabel}
          </Button>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length ? (
        <ul className="divide-y divide-border text-sm">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <Ref className="text-xs text-muted">{String(e.reference)}</Ref> <span className="font-medium">{String(e.title)}</span> <StatusBadge value={String(e.category)} />{" "}
                <span className="text-xs text-muted">
                  <DateText value={String(e.createdAt)} />
                </span>
              </span>
              <span className="flex gap-1">
                <Button asChild size="sm" variant="ghost">
                  <a href={`${API_BASE}/evidence/${e.id}/file?which=original&inline=1`} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${String(e.title)}`}>
                    <Eye className="h-4 w-4" aria-hidden />
                  </a>
                </Button>
                <Button asChild size="sm" variant="ghost">
                  <a href={`${API_BASE}/evidence/${e.id}/file?which=original`} aria-label={`Download ${String(e.title)}`}>
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None attached yet.</p>
      )}
      {open ? <UploadEvidenceDialog open={open} onOpenChange={setOpen} caseId={caseId} linkType={linkType} linkId={linkId} defaultCategory={defaultCategory} title={uploadLabel} /> : null}
    </section>
  );
}
