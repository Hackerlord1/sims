"use server";

import { redirect } from "next/navigation";
import { audit } from "@/server/audit";
import { getCurrentUser } from "@/server/auth/current-user";
import { destroyCurrentSession } from "@/server/auth/session";

export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser();
  await destroyCurrentSession();
  if (user) await audit({ action: "auth.logout", actorId: user.id, actorLabel: user.username });
  redirect("/login");
}
