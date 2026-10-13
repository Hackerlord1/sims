import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { requireUser } from "@/server/auth/current-user";
import { VerifyForm } from "./mfa-forms";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function MfaPage() {
  const user = await requireUser({ allowPendingMfa: true });
  if (!user.mfaEnabled) redirect("/mfa/setup");
  if (user.sessionMfaVerified) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-[1.85rem] leading-tight">Two-step verification</h1>
        <p className="text-sm text-muted">Enter the code from your authenticator app to finish signing in, {user.fullName}.</p>
      </div>
      <VerifyForm />
      <p className="text-xs text-muted">Lost your device? Ask a system administrator to reset two-step verification for your account.</p>
      <form action={signOutAction}>
        <button type="submit" className="w-full text-center text-sm text-muted underline-offset-4 hover:text-text hover:underline">
          Sign out instead
        </button>
      </form>
    </div>
  );
}
