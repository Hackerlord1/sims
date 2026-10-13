import "server-only";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { audit, raiseAlert } from "@/server/audit";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { markSessionMfaVerified, revokeAllSessions } from "@/server/auth/session";
import { mustKeepMfa, type CurrentUser } from "@/server/auth/principal";
import { rateLimit } from "@/server/rate-limit";

/**
 * Time-based one-time passwords (RFC 6238): 6 digits, 30-second steps, SHA-1 — the parameters every
 * mainstream authenticator app supports. Secrets are stored encrypted (AES-256-GCM), a code is
 * accepted one step either side of now to allow for clock drift, and each step can be used once.
 */
const PERIOD = 30;
const WINDOW = 1;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

export type MfaResult = { ok: true } | { ok: false; error: string };

function totp(secretBase32: string, label: string) {
  return new TOTP({ issuer: "SIMS", label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: Secret.fromBase32(secretBase32) });
}

const CODE = /^\d{6}$/;

/**
 * Checks a code against a secret and returns the matched time step, or null. Steps at or before
 * `lastUsedStep` are rejected so an observed code cannot be replayed.
 */
function matchStep(secretBase32: string, label: string, code: string, lastUsedStep: number | null, now = Date.now()): number | null {
  const token = code.replace(/\s+/g, "");
  if (!CODE.test(token)) return null;
  const delta = totp(secretBase32, label).validate({ token, timestamp: now, window: WINDOW });
  if (delta === null) return null;
  const step = Math.floor(now / 1000 / PERIOD) + delta;
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

function throttle(userId: string): MfaResult | null {
  const limit = rateLimit(`mfa:${userId}`, MAX_ATTEMPTS, ATTEMPT_WINDOW_MS);
  return limit.ok ? null : { ok: false, error: `Too many attempts. Try again in ${Math.ceil(limit.retryAfterMs / 60000)} minute(s).` };
}

async function recordFailure(user: CurrentUser, action: string) {
  await audit({ action, actorId: user.id, actorLabel: user.username, entityType: "user", entityId: user.id, outcome: "FAILURE" });
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const recent = await prisma.auditLog.count({ where: { action, actorId: user.id, outcome: "FAILURE", at: { gte: since } } });
  const alreadyRaised = await prisma.securityAlert.count({ where: { subjectUserId: user.id, type: "REPEATED_FAILED_LOGINS", createdAt: { gte: since } } });
  if (recent >= MAX_ATTEMPTS && alreadyRaised === 0) {
    await raiseAlert({ type: "REPEATED_FAILED_LOGINS", severity: "HIGH", message: `${MAX_ATTEMPTS} failed verification codes for ${user.username} within five minutes.`, subjectUserId: user.id });
  }
}

/** Starts (or restarts) enrolment: a new secret is held as pending until a code from it is confirmed. */
export async function beginEnrolment(user: CurrentUser): Promise<{ secret: string; uri: string; qrSvg: string }> {
  const secret = new Secret({ size: 20 }).base32;
  await prisma.user.update({ where: { id: user.id }, data: { mfaPendingSecret: encryptSecret(secret) } });
  await audit({ action: "auth.mfa.enrolment_started", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: user.id });
  const uri = totp(secret, user.username).toString();
  const qrSvg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  return { secret, uri, qrSvg };
}

/** Confirms enrolment with a code from the pending secret; the current session counts as verified. */
export async function confirmEnrolment(user: CurrentUser, code: string): Promise<MfaResult> {
  const throttled = throttle(user.id);
  if (throttled) {
    await recordFailure(user, "auth.mfa.enrolment_failed");
    return throttled;
  }
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mfaPendingSecret: true } });
  if (!record.mfaPendingSecret) return { ok: false, error: "Start the set-up again: no enrolment is in progress." };
  const step = matchStep(decryptSecret(record.mfaPendingSecret), user.username, code, null);
  if (step === null) {
    await recordFailure(user, "auth.mfa.enrolment_failed");
    return { ok: false, error: "That code did not match. Check the time on your device and try the newest code." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { mfaSecret: record.mfaPendingSecret, mfaPendingSecret: null, mfaEnabled: true, mfaLastUsedStep: step, version: { increment: 1 } },
    });
    await audit({ action: "auth.mfa.enabled", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: user.id }, tx);
  });
  await markSessionMfaVerified(user.sessionId);
  // Sessions opened before MFA was switched on were never verified; sign them out.
  await revokeAllSessions(user.id, user.sessionId);
  return { ok: true };
}

/** Verifies the second factor for the current session after a password sign-in. */
export async function verifySession(user: CurrentUser, code: string): Promise<MfaResult> {
  const throttled = throttle(user.id);
  if (throttled) {
    await recordFailure(user, "auth.mfa.failed");
    return throttled;
  }
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mfaSecret: true, mfaEnabled: true, mfaLastUsedStep: true } });
  if (!record.mfaEnabled || !record.mfaSecret) return { ok: false, error: "Two-step verification is not set up for this account." };
  const step = matchStep(decryptSecret(record.mfaSecret), user.username, code, record.mfaLastUsedStep);
  if (step === null) {
    await recordFailure(user, "auth.mfa.failed");
    return { ok: false, error: "That code is incorrect or has already been used." };
  }
  // Guarded update: if two requests race with the same code, only one advances the step.
  const updated = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
    data: { mfaLastUsedStep: step },
  });
  if (updated.count !== 1) return { ok: false, error: "That code is incorrect or has already been used." };
  await markSessionMfaVerified(user.sessionId);
  await audit({ action: "auth.mfa.verified", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: user.id });
  return { ok: true };
}

/** Turns MFA off for the signed-in user; needs the password and a current code. */
export async function disableOwnMfa(user: CurrentUser, input: { password: string; code: string }): Promise<MfaResult> {
  if (mustKeepMfa(user)) return { ok: false, error: "Administrators must keep two-step verification switched on." };
  const throttled = throttle(user.id);
  if (throttled) {
    await recordFailure(user, "auth.mfa.disable_failed");
    return throttled;
  }
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, mfaSecret: true, mfaEnabled: true, mfaLastUsedStep: true } });
  if (!record.mfaEnabled || !record.mfaSecret) return { ok: false, error: "Two-step verification is not switched on." };
  const passwordOk = await verifyPassword(record.passwordHash, input.password);
  const step = passwordOk ? matchStep(decryptSecret(record.mfaSecret), user.username, input.code, record.mfaLastUsedStep) : null;
  if (!passwordOk || step === null) {
    await recordFailure(user, "auth.mfa.disable_failed");
    return { ok: false, error: "The password or code is incorrect." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaLastUsedStep: null, version: { increment: 1 } } });
    await audit({ action: "auth.mfa.disabled", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: user.id }, tx);
  });
  return { ok: true };
}

/** An administrator clears another user's MFA (lost device). The user is signed out everywhere. */
export async function resetUserMfa(actor: CurrentUser, targetId: string, reason: string): Promise<void> {
  const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { id: true, username: true, mfaEnabled: true } });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaLastUsedStep: null, version: { increment: 1 } } });
    await audit(
      {
        action: "users.mfa_reset",
        actorId: actor.id,
        actorLabel: actor.username,
        entityType: "user",
        entityId: target.id,
        reason,
        before: { mfaEnabled: target.mfaEnabled },
        after: { mfaEnabled: false },
      },
      tx,
    );
  });
  await revokeAllSessions(target.id);
}

/** Exposed for tests: the step matcher with an injectable clock. */
export const __test = { matchStep, PERIOD };
