import "server-only";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { can, type Action, type Module } from "@/lib/permissions";

/** Page-level check for administrative screens. Returns 404 rather than revealing the page exists. */
export async function requirePagePermission(module: Module, action: Action) {
  const user = await requireUser();
  if (!can(user, module, action)) notFound();
  return user;
}
