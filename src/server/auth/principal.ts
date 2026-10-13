import "server-only";
import type { LoadedSession } from "@/server/auth/session";
import { normaliseDenials, type Confidentiality, type PrincipalLike, type Role, type ScopeLike } from "@/lib/permissions";
import { parsePreferences, type UserPreferences } from "@/lib/preferences";
import { stringArray } from "@/lib/string-array";

// Framework-free principal type, shared by pages, the API router, the worker and the seed.
export interface CurrentUser extends PrincipalLike {
  username: string;
  fullName: string;
  email: string;
  scopes: ScopeLike[];
  mfaEnabled: boolean;
  isDemoAdmin: boolean;
  sessionId: string;
  sessionMfaVerified: boolean;
  reauthAt: Date | null;
  preferences: UserPreferences;
  denials: string[];
  dataApprover: boolean;
}

export function toCurrentUser(session: LoadedSession): CurrentUser {
  const u = session.user;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role as Role,
    clearance: u.clearance as Confidentiality,
    scopes: u.scopes.map((s) => ({ companyId: s.companyId, branchId: s.branchId })),
    mfaEnabled: u.mfaEnabled,
    isDemoAdmin: u.isDemoAdmin,
    sessionId: session.id,
    sessionMfaVerified: session.mfaVerified,
    reauthAt: session.reauthAt,
    preferences: parsePreferences(u.preferences),
    denials: normaliseDenials(u.role as Role, stringArray(u.permissionDenials, "permissionDenials")),
    dataApprover: u.dataApprover,
  };
}

/** Production administrators must use two-step verification; they cannot switch it off. */
export function mustKeepMfa(user: Pick<CurrentUser, "role">): boolean {
  return process.env.NODE_ENV === "production" && user.role === "SYSTEM_ADMIN";
}
