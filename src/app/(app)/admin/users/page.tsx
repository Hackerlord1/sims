import type { Metadata } from "next";
import { UsersAdmin } from "@/components/admin/users-admin";
import { requirePagePermission } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Users and roles" };

export default async function Page() {
  await requirePagePermission("USERS", "VIEW");
  return <UsersAdmin />;
}
