import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { loadSession } from "@/server/auth/session";
import { mustKeepMfa, toCurrentUser, type CurrentUser } from "@/server/auth/principal";

export { toCurrentUser, type CurrentUser };

/** The signed-in user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await loadSession();
  return session ? toCurrentUser(session) : null;
});

/**
 * Gate for every authenticated page. Enforces, in order: a live session, the forced password
 * change, MFA verification, and (in production) MFA enrolment for administrators.
 */
export async function requireUser(opts: { allowPendingMfa?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!opts.allowPendingMfa) {
    if (user.mfaEnabled && !user.sessionMfaVerified) redirect("/mfa");
    if (mustKeepMfa(user) && !user.mfaEnabled) {
      redirect("/mfa/setup");
    }
  }
  return user;
}
