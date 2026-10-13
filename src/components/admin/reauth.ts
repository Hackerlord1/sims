"use client";

import { apiPost } from "@/lib/api-client";

/** Confirms the user's password with the server before a sensitive action. */
export async function reauthenticate(password: string): Promise<void> {
  if (!password) throw new Error("Enter your password to confirm.");
  await apiPost("/auth/reauthenticate", { password });
}
