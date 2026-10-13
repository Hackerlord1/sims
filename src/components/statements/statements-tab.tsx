"use client";

import { Network, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UploadStatementDialog } from "@/components/statements/upload-statement";
import { ResourceTable } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { LeadNotice } from "@/components/ui/states";

export function StatementsTab({ caseId }: { caseId: string }) {
  const can = useCan();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <LeadNotice />
      <ResourceTable
        resource="financial-statements"
        caseId={caseId}
        title="Bank and M-Pesa statements"
        onOpen={(row) => router.push(`/statements/${row.id}`)}
        toolbarExtra={
          <>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/money-movement?caseId=${caseId}`}>
                <Network className="h-4 w-4" aria-hidden /> Money movement
              </Link>
            </Button>
            {can("STATEMENTS", "CREATE") ? (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Upload className="h-4 w-4" aria-hidden /> Upload statement
              </Button>
            ) : null}
          </>
        }
      />
      <ResourceTable resource="known-accounts" caseId={caseId} title="Known accounts (used for matching)" />
      {open ? <UploadStatementDialog open={open} onOpenChange={setOpen} caseId={caseId} onUploaded={(id) => router.push(`/statements/${id}`)} /> : null}
    </div>
  );
}
