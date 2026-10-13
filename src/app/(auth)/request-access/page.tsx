import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { RequestAccessForm } from "./request-access-form";

export const metadata: Metadata = { title: "Request access" };

export default async function RequestAccessPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="eyebrow text-muted">New to SIMS</p>
        <h1 className="text-[1.85rem] leading-tight">Request access</h1>
        <p className="text-sm text-muted">An administrator reviews every request and decides what you can view and edit.</p>
      </div>
      <RequestAccessForm />
    </div>
  );
}
