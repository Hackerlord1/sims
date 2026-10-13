"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { changePassword } from "@/server/auth/change-password";

export interface ChangePasswordState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password.").max(256),
    newPassword: z.string().min(1, "Enter a new password.").max(128),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

export async function changePasswordAction(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const user = await requireUser({ allowPendingMfa: true });
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Please correct the highlighted fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const result = await changePassword(user, parsed.data);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  redirect(user.mfaEnabled && !user.sessionMfaVerified ? "/mfa" : "/dashboard");
}
