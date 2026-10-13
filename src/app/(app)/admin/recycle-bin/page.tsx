import type { Metadata } from "next";
import { BulkAdmin } from "@/components/admin/bulk-admin";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Recycle Bin" };

export default async function Page() {
  await requirePagePermission("CASES", "RESTORE");
  return <BulkAdmin recycleBin />;
}
