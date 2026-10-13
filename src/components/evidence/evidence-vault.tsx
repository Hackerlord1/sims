"use client";

import { ShieldCheck, Upload } from "lucide-react";
import { useState } from "react";
import { UploadEvidenceDialog } from "@/components/evidence/upload-evidence";
import { ResourceTable } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";

export function EvidenceVault({ caseId }: { caseId: string }) {
  const can = useCan();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="depth vault-banner flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="icon-chip h-10 w-10" aria-hidden>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Evidence vault</h2>
            <p className="text-xs text-muted">
              Originals are stored read-only with a SHA-256 hash and are never altered or deleted. Review and annotate working copies instead. Every view and download is recorded.
            </p>
          </div>
        </div>
        {can("EVIDENCE", "CREATE") ? (
          <Button onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" aria-hidden /> Upload evidence
          </Button>
        ) : null}
      </div>
      <ResourceTable resource="evidence" caseId={caseId} />
      {open ? <UploadEvidenceDialog open={open} onOpenChange={setOpen} caseId={caseId} /> : null}
    </div>
  );
}
