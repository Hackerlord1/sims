import type { Metadata } from "next";
import { BulkAdmin } from "@/components/admin/bulk-admin";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Bulk actions" };

export default async function Page() {
  await requirePagePermission("DATA_ADMIN", "SOFT_DELETE");
  return <BulkAdmin />;
}
