import type { Metadata } from "next";
import { DeletionRequests } from "@/components/admin/deletion-requests";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Permanent deletion" };

export default async function Page() {
  await requirePagePermission("DATA_ADMIN", "VIEW");
  return <DeletionRequests />;
}
