import type { Metadata } from "next";
import { requireUser } from "@/server/auth/current-user";
import { signOutAction } from "@/app/actions/auth";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPendingMfa: true });
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-[1.85rem] leading-tight">Change password</h1>
<p className="text-sm text-muted">Other signed-in sessions will be signed out.</p>
      </div>
      <ChangePasswordForm />
      <form action={signOutAction}>
        <button type="submit" className="w-full text-center text-sm text-muted underline-offset-4 hover:text-text hover:underline">
          Sign out instead
        </button>
      </form>
    </div>
  );
}
