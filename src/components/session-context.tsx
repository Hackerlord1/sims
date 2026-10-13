"use client";

import { createContext, useContext } from "react";
import type { Action, Module, Role } from "@/lib/permissions";
import type { UserPreferences } from "@/lib/preferences";

export interface ClientSession {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  roleLabel: string;
  /** Module → permitted actions. UI hints only: every action is re-checked by the server. */
  permissions: Partial<Record<Module, Action[]>>;
  preferences: UserPreferences;
  demoMode: boolean;
  /** May approve other people's pending data changes (UI hint; the server re-checks). */
  dataApprover: boolean;
}

const Ctx = createContext<ClientSession | null>(null);

export function SessionProvider({ value, children }: { value: ClientSession; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): ClientSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside SessionProvider");
  return v;
}

export function useCan() {
  const s = useSession();
  return (module: Module, action: Action) => Boolean(s.permissions[module]?.includes(action));
}
