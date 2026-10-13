import type { Metadata } from "next";
import { DataAdmin } from "@/components/admin/data-admin";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Data administration" };

export default async function Page({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  await requirePagePermission("DATA_ADMIN", "BULK_UPLOAD");
  const { batch } = await searchParams;
  return <DataAdmin initialBatch={typeof batch === "string" ? batch : undefined} />;
}
