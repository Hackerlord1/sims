"use client";

import type { ReactNode } from "react";
import { ResourceTable, type ResourceTableProps } from "@/components/resources/resource-table";
import { PageHeader } from "@/components/ui/display";
import { getResource } from "@/lib/resources/registry";

/** Cross-case register: every record of one type across the cases the user may see. */
export function RegisterPage({
  resource,
  title,
  description,
  actions,
  table,
}: {
  resource: string;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  table?: Partial<ResourceTableProps>;
}) {
  const r = getResource(resource)!;
  return (
    <>
      <PageHeader title={title ?? r.plural} description={description ?? `${r.plural} across every case you can access. Open a case to add records in context.`} actions={actions} />
      <ResourceTable resource={resource} allowCreate={false} {...table} />
    </>
  );
}
