import type { Metadata } from "next";
import { SettingsAdmin } from "@/components/admin/settings-admin";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "System settings" };

export default async function Page() {
  await requirePagePermission("SETTINGS", "VIEW");
  return <SettingsAdmin />;
}
