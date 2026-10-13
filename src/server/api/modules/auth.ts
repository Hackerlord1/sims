import "server-only";
import { z } from "zod";
import type { Router } from "@/server/api/router";
import { ApiError } from "@/server/api/errors";
import { authenticateCredentials } from "@/server/auth/sign-in";
import { issueSession, markSessionReauthenticated, revokeSessionByToken, SESSION_COOKIE, tokenFromCookieHeader } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { changePassword } from "@/server/auth/change-password";
import { beginEnrolment, confirmEnrolment, disableOwnMfa, verifySession } from "@/server/auth/mfa";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/rate-limit";
import { permissionMatrix, roleModules, ACTIONS, can } from "@/lib/permissions";

function cookieHeader(name: string, value: string, opts: { expires?: Date; maxAge?: number; secure: boolean }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (opts.secure) parts.push("Secure");
  if (opts.expires) parts.push(`Expires=${opts.expires.toUTCString()}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export function registerAuth(router: Router) {
  router.add({
    method: "POST",
    path: "/auth/login",
    auth: "public",
    summary: "Sign in with username or email and password",
    tags: ["Authentication"],
    body: z.object({ identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(256) }),
    async handler({ body, requestId }) {
      const result = await authenticateCredentials(body.identifier, body.password);
      if (!result.ok) throw new ApiError(401, "UNAUTHENTICATED", result.error);
      const cookie = await issueSession(result.user.id, { mfaVerified: !result.user.mfaEnabled });
      const res = Response.json({ data: { next: result.next }, requestId }, { status: 200 });
      res.headers.append("set-cookie", cookieHeader(cookie.name, cookie.value, { expires: cookie.options.expires, secure: cookie.options.secure }));
      return res;
    },
  });

  const code = z.object({ code: z.string().trim().min(6).max(12) });

  router.add({
    method: "POST",
    path: "/auth/mfa/verify",
    summary: "Complete sign-in with a code from the authenticator app",
    tags: ["Authentication"],
    allowPendingMfa: true,
    body: code,
    rateLimitPerMinute: 10,
    async handler({ user, body }) {
      const result = await verifySession(user, body.code);
      if (!result.ok) throw new ApiError(400, "MFA_FAILED", result.error);
      return { verified: true };
    },
  });

  router.add({
    method: "POST",
    path: "/me/mfa/enrol",
    summary: "Start two-step verification set-up: returns the secret, otpauth URI and a QR code (SVG)",
    tags: ["Authentication"],
    allowPendingMfa: true,
    rateLimitPerMinute: 10,
    async handler({ user }) {
      if (user.mfaEnabled) throw new ApiError(409, "CONFLICT", "Two-step verification is already switched on.");
      return beginEnrolment(user);
    },
  });

  router.add({
    method: "POST",
    path: "/me/mfa/confirm",
    summary: "Finish set-up with a code generated from the new secret",
    tags: ["Authentication"],
    allowPendingMfa: true,
    body: code,
    rateLimitPerMinute: 10,
    async handler({ user, body }) {
      if (user.mfaEnabled) throw new ApiError(409, "CONFLICT", "Two-step verification is already switched on.");
      const result = await confirmEnrolment(user, body.code);
      if (!result.ok) throw new ApiError(400, "MFA_FAILED", result.error);
      return { enabled: true };
    },
  });

  router.add({
    method: "POST",
    path: "/me/mfa/disable",
    summary: "Switch two-step verification off (password and a current code required)",
    tags: ["Authentication"],
    body: z.object({ password: z.string().min(1).max(256), code: z.string().trim().min(6).max(12) }),
    rateLimitPerMinute: 10,
    async handler({ user, body }) {
      const result = await disableOwnMfa(user, body);
      if (!result.ok) throw new ApiError(400, "MFA_FAILED", result.error);
      return { enabled: false };
    },
  });

  router.add({
    method: "POST",
    path: "/auth/logout",
    summary: "Sign out and revoke the current session",
    tags: ["Authentication"],
    allowPendingMfa: true,
    async handler({ req, user, requestId }) {
      await revokeSessionByToken(tokenFromCookieHeader(req.headers.get("cookie")));
      await audit({ action: "auth.logout", actorId: user.id, actorLabel: user.username });
      const res = Response.json({ data: { signedOut: true }, requestId });
      res.headers.append("set-cookie", cookieHeader(SESSION_COOKIE, "", { maxAge: 0, secure: process.env.NODE_ENV === "production" }));
      return res;
    },
  });

  router.add({
    method: "GET",
    path: "/auth/me",
    summary: "Current user, role, permissions and preferences",
    tags: ["Authentication"],
    allowPendingMfa: true,
    async handler({ user }) {
      const modules = roleModules(user.role);
      return {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        clearance: user.clearance,
        isDemoAdmin: user.isDemoAdmin,
        preferences: user.preferences,
        permissions: Object.fromEntries(modules.map((m) => [m, ACTIONS.filter((a) => can(user, m, a))])),
      };
    },
  });

  router.add({
    method: "POST",
    path: "/auth/reauthenticate",
    summary: "Confirm the password again before a sensitive action",
    tags: ["Authentication"],
    body: z.object({ password: z.string().min(1).max(256) }),
    rateLimitPerMinute: 10,
    async handler({ body, user }) {
      if (!rateLimit(`reauth:${user.id}`, 5, 15 * 60 * 1000).ok) {
        throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Try again later.");
      }
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
      if (!(await verifyPassword(row.passwordHash, body.password))) {
        await audit({ action: "auth.reauth.failed", actorId: user.id, actorLabel: user.username, outcome: "FAILURE" });
        throw new ApiError(401, "UNAUTHENTICATED", "The password is incorrect.");
      }
      const at = await markSessionReauthenticated(user.sessionId);
      await audit({ action: "auth.reauth.success", actorId: user.id, actorLabel: user.username });
      return { reauthenticatedAt: at.toISOString() };
    },
  });

  router.add({
    method: "POST",
    path: "/auth/change-password",
    summary: "Change the current user's password",
    tags: ["Authentication"],
    allowPendingMfa: true,
    body: z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(1).max(256) }),
    rateLimitPerMinute: 10,
    async handler({ body, user }) {
      const result = await changePassword(user, body);
      if (!result.ok) {
        const fields = Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k, v.join(" ")]));
        throw new ApiError(422, "VALIDATION_FAILED", result.error, { fields });
      }
      return { changed: true };
    },
  });

  router.add({
    method: "GET",
    path: "/permissions/matrix",
    summary: "Role and permission matrix",
    tags: ["Administration"],
    async handler() {
      return permissionMatrix();
    },
  });
}
