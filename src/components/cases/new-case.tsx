"use client";

import { useRouter } from "next/navigation";
import { ResourceForm } from "@/components/resources/resource-form";
import { Card, PageHeader } from "@/components/ui/display";
import { getResource } from "@/lib/resources/registry";

export function NewCaseClient() {
  const router = useRouter();
  const r = getResource("cases")!;
  return (
    <>
      <PageHeader
        eyebrow="Case files"
        title="Open new case"
        description="The case number is generated automatically when the case is saved. The case starts as a draft; change its status once the preliminary review begins."
      />
      <Card className="max-w-5xl">
        <ResourceForm resource={r} submitLabel="Open case" onCancel={() => router.push("/cases")} onSaved={(row) => router.push(`/cases/${row.id}?opened=1`)} />
      </Card>
    </>
  );
}
