import type { Metadata } from "next";
import { ChangeApprovals } from "@/components/admin/change-approvals";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Data-change approvals" };

/** Approvers review changes here; everyone else sees the changes they submitted. The API scopes both. */
export default async function Page() {
  await requireUser();
  return <ChangeApprovals />;
}
