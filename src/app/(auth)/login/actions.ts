"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/server/auth/sign-in";

export interface LoginState {
  error?: string;
}

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your username or work email.").max(254),
  password: z.string().min(1, "Enter your password.").max(256),
  next: z.string().max(500).optional(),
});

/** Only same-site relative paths are honoured, so the login form cannot be used as an open redirect. */
function safeNext(next: string | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/login") || next.startsWith("/api")) return null;
  return next;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const result = await signIn(parsed.data.identifier, parsed.data.password);
  if (!result.ok) return { error: result.error };
  const next = result.next === "/dashboard" ? (safeNext(parsed.data.next) ?? "/dashboard") : result.next;
  redirect(next);
}
