import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit, raiseAlert, requestMeta } from "@/server/audit";
import { burnPasswordCheck, verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { isDemoMode } from "@/server/demo-guard";
import { rateLimit } from "@/server/rate-limit";

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

type Next = "/mfa" | "/dashboard";

export type CredentialResult = { ok: true; user: User; next: Next } | { ok: false; error: string };
export type SignInResult = { ok: true; next: Next } | { ok: false; error: string };

const GENERIC_ERROR = "The username or password is incorrect.";

/**
 * Verifies credentials with lockout, rate limiting and full audit. Does not create a session:
 * the page flow and the REST API each issue their own cookie.
 */
export async function authenticateCredentials(identifierRaw: string, password: string): Promise<CredentialResult> {
  const demoMode = isDemoMode(process.env); // throws in production with DEMO_MODE=true
  const identifier = identifierRaw.trim().toLowerCase();
  const { ipAddress } = await requestMeta();

  if (!rateLimit(`login:ip:${ipAddress ?? "unknown"}`, 30, 15 * 60 * 1000).ok) {
    await audit({ action: "auth.login.rate_limited", actorLabel: identifier.slice(0, 80), outcome: "DENIED" });
    return { ok: false, error: "Too many sign-in attempts. Please wait a few minutes and try again." };
  }

  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } });

  if (!user) {
    await burnPasswordCheck(password);
    await audit({ action: "auth.login.failed", actorLabel: identifier.slice(0, 80), outcome: "FAILURE", details: { reason: "unknown_user" } });
    return { ok: false, error: GENERIC_ERROR };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await burnPasswordCheck(password);
    await audit({ action: "auth.login.locked", actorId: user.id, actorLabel: user.username, outcome: "DENIED" });
    return { ok: false, error: "This account is temporarily locked after repeated failed attempts. Try again later." };
  }

  // The development administrator and the fictional demo accounts work only in demo mode.
  if ((user.isDemoAdmin || user.isDemo) && !demoMode) {
    await burnPasswordCheck(password);
    await audit({
      action: "auth.login.denied",
      actorId: user.id,
      actorLabel: user.username,
      outcome: "DENIED",
      details: { reason: "demo_admin_outside_demo_mode" },
    });
    return { ok: false, error: GENERIC_ERROR };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MS) : null },
    });
    await audit({
      action: "auth.login.failed",
      actorId: user.id,
      actorLabel: user.username,
      outcome: "FAILURE",
      details: { reason: "bad_password", consecutiveFailures: failed, locked: lock },
    });
    if (lock) {
      await raiseAlert({
        type: "REPEATED_FAILED_LOGINS",
        severity: user.role === "SYSTEM_ADMIN" ? "HIGH" : "WARNING",
        message: `Account ${user.username} locked after ${MAX_FAILED_LOGINS} failed sign-in attempts.`,
        subjectUserId: user.id,
        details: { ipAddress },
      });
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  if (user.status !== "ACTIVE") {
    await audit({
      action: "auth.login.denied",
      actorId: user.id,
      actorLabel: user.username,
      outcome: "DENIED",
      details: { reason: `status_${user.status.toLowerCase()}` },
    });
    return { ok: false, error: "This account is not active. Contact the system administrator." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ action: "auth.login.success", actorId: user.id, actorLabel: user.username });

  const next: Next = user.mfaEnabled ? "/mfa" : "/dashboard";
  return { ok: true, user, next };
}

/** Page (Server Action) sign-in: verifies credentials and sets the session cookie. */
export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  const result = await authenticateCredentials(identifier, password);
  if (!result.ok) return result;
  await createSession(result.user.id, { mfaVerified: !result.user.mfaEnabled });
  return { ok: true, next: result.next };
}
