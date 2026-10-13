import "server-only";
import { cookies } from "next/headers";
import { prisma } from "@/server/db";
import { hashToken, randomToken } from "@/server/crypto";
import { requestMeta } from "@/server/audit";

const secure = process.env.NODE_ENV === "production";
// __Host- prefix pins the cookie to this origin over HTTPS with Path=/ (only valid when Secure).
export const SESSION_COOKIE = secure ? "__Host-sims_session" : "sims_session";

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
/** A password re-entry stays valid for sensitive actions for this long. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export interface SessionCookie {
  name: string;
  value: string;
  options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; expires: Date };
}

/** Creates a session row and returns the cookie to set. Callers decide how to set it. */
export async function issueSession(userId: string, opts: { mfaVerified: boolean }): Promise<SessionCookie> {
  const token = randomToken();
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + ABSOLUTE_TIMEOUT_MS);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      mfaVerified: opts.mfaVerified,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    },
  });
  return { name: SESSION_COOKIE, value: token, options: { httpOnly: true, secure, sameSite: "lax", path: "/", expires: expiresAt } };
}

/** Server Action / page flow: creates the session and sets the cookie through next/headers. */
export async function createSession(userId: string, opts: { mfaVerified: boolean }): Promise<void> {
  const cookie = await issueSession(userId, opts);
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Reads the session token from a raw Cookie header (API requests). */
export function tokenFromCookieHeader(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Returns the live session for a token, or null if missing, expired, idle, revoked or inactive. */
export async function loadSessionByToken(token: string | undefined) {
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { scopes: true } } },
  });
  if (!session || session.revokedAt) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
}

export type LoadedSession = NonNullable<Awaited<ReturnType<typeof loadSessionByToken>>>;

export async function loadSession() {
  return loadSessionByToken(await readSessionToken());
}

export async function markSessionMfaVerified(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { mfaVerified: true } });
}

export async function markSessionReauthenticated(sessionId: string): Promise<Date> {
  const at = new Date();
  await prisma.session.update({ where: { id: sessionId }, data: { reauthAt: at } });
  return at;
}

export async function revokeSessionByToken(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes the current session and clears the cookie. Must run in a Server Action or Route Handler. */
export async function destroyCurrentSession(): Promise<void> {
  await revokeSessionByToken(await readSessionToken());
  (await cookies()).delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
