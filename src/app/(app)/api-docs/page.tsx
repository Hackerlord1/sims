import type { Metadata } from "next";
import { ApiDocs } from "@/components/admin/api-docs";
import { requirePagePermission } from "@/server/auth/page-guard";
import { PageHeader } from "@/components/ui/display";

export const metadata: Metadata = { title: "API documentation" };

export default async function Page() {
  await requirePagePermission("SETTINGS", "VIEW");
  return (
    <>
      <PageHeader title="API documentation" description="OpenAPI 3.1 description of the SIMS REST API. Requests run with your session and permissions." />
      <ApiDocs />
    </>
  );
}
