"use client";

import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ResourceTable } from "@/components/resources/resource-table";
import { useCan } from "@/components/session-context";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";

export function CaseListClient() {
  const router = useRouter();
  const can = useCan();
  return (
    <>
      <PageHeader
        title="Case files"
        description="Main investigation case files. Open a case to work on its sub-files, parties, invoices, cheques, evidence, legal pathways, costs and recoveries."
        actions={
          can("CASES", "CREATE") ? (
            <Button asChild>
              <Link href="/cases/new">
                <FolderPlus className="h-4 w-4" aria-hidden /> Open new case
              </Link>
            </Button>
          ) : null
        }
      />
      <ResourceTable resource="cases" allowCreate={false} onOpen={(row) => router.push(`/cases/${row.id}`)} />
    </>
  );
}
