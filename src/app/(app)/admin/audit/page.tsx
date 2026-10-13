import type { Metadata } from "next";
import { AuditAdmin } from "@/components/admin/audit-admin";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Audit logs" };

export default async function Page() {
  await requirePagePermission("AUDIT", "VIEW_AUDIT_LOGS");
  return <AuditAdmin />;
}
