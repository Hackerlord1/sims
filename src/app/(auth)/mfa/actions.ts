"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { beginEnrolment, confirmEnrolment, disableOwnMfa, verifySession } from "@/server/auth/mfa";

export interface MfaState {
  error?: string;
  done?: boolean;
}

export interface EnrolmentState {
  error?: string;
  secret?: string;
  qrDataUrl?: string;
}

const code = z.string().trim().min(6, "Enter the 6-digit code.").max(12);

export async function verifyMfaAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requireUser({ allowPendingMfa: true });
  const parsed = code.safeParse(formData.get("code"));
  if (!parsed.success) return { error: "Enter the 6-digit code from your authenticator app." };
  const result = await verifySession(user, parsed.data);
  if (!result.ok) return { error: result.error };
  redirect("/dashboard");
}

export async function beginEnrolmentAction(): Promise<EnrolmentState> {
  const user = await requireUser({ allowPendingMfa: true });
  if (user.mfaEnabled) return { error: "Two-step verification is already switched on." };
  const { secret, qrSvg } = await beginEnrolment(user);
  return { secret, qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}` };
}

export async function confirmEnrolmentAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requireUser({ allowPendingMfa: true });
  if (user.mfaEnabled) return { error: "Two-step verification is already switched on." };
  const parsed = code.safeParse(formData.get("code"));
  if (!parsed.success) return { error: "Enter the 6-digit code from your authenticator app." };
  const result = await confirmEnrolment(user, parsed.data);
  if (!result.ok) return { error: result.error };
  redirect("/dashboard");
}

export async function disableMfaAction(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const parsed = code.safeParse(formData.get("code"));
  if (!password || !parsed.success) return { error: "Enter your password and a current code." };
  const result = await disableOwnMfa(user, { password, code: parsed.data });
  if (!result.ok) return { error: result.error };
  return { done: true };
}
