import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { requireUser } from "@/server/auth/current-user";
import { mustKeepMfa } from "@/server/auth/principal";
import { DisableForm, EnrolForm } from "../mfa-forms";

export const metadata: Metadata = { title: "Set up two-step verification" };

export default async function MfaSetupPage() {
  const user = await requireUser({ allowPendingMfa: true });
  if (user.mfaEnabled && !user.sessionMfaVerified) redirect("/mfa");
  const required = mustKeepMfa(user);

  if (user.mfaEnabled) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-[1.85rem] leading-tight">Two-step verification is on</h1>
          <p className="text-sm text-muted">Each sign-in asks for a code from your authenticator app.</p>
        </div>
        {required ? <p className="text-sm">Administrator accounts must keep two-step verification switched on.</p> : <DisableForm />}
        <Link href="/dashboard" className="block text-center text-sm text-muted underline-offset-4 hover:text-text hover:underline">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-[1.85rem] leading-tight">Set up two-step verification</h1>
        <p className="text-sm text-muted">
          {required ? "Administrator accounts must use two-step verification before continuing." : "Protect your account with a code from your phone in addition to your password."}
        </p>
      </div>
      <EnrolForm />
      {required ? (
        <form action={signOutAction}>
          <button type="submit" className="w-full text-center text-sm text-muted underline-offset-4 hover:text-text hover:underline">
            Sign out instead
          </button>
        </form>
      ) : (
        <Link href="/dashboard" className="block text-center text-sm text-muted underline-offset-4 hover:text-text hover:underline">
          Not now
        </Link>
      )}
    </div>
  );
}
