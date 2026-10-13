import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewCaseClient } from "@/components/cases/new-case";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Open new case" };

export default async function NewCasePage() {
  const user = await requireUser();
  if (!can(user, "CASES", "CREATE")) redirect("/cases");
  return <NewCaseClient />;
}
