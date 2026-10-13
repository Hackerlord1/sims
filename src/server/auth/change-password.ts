import "server-only";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import type { CurrentUser } from "@/server/auth/principal";
import { checkPasswordStrength } from "@/lib/password-policy";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function changePassword(user: CurrentUser, input: { currentPassword: string; newPassword: string }): Promise<ChangePasswordResult> {
  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

  if (!(await verifyPassword(record.passwordHash, input.currentPassword))) {
    await audit({ action: "auth.password.change_failed", actorId: user.id, actorLabel: user.username, outcome: "FAILURE", details: { reason: "bad_current_password" } });
    return { ok: false, error: "Your current password is incorrect.", fieldErrors: { currentPassword: ["Incorrect password."] } };
  }

  const strength = checkPasswordStrength(input.newPassword, { username: record.username, fullName: record.fullName });
  if (!strength.ok) {
    return { ok: false, error: "Choose a stronger password.", fieldErrors: { newPassword: strength.problems } };
  }
  if (await verifyPassword(record.passwordHash, input.newPassword)) {
    return { ok: false, error: "The new password must differ from the current one.", fieldErrors: { newPassword: ["Must differ from the current password."] } };
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: record.id, version: record.version },
      data: { passwordHash, passwordChangedAt: new Date(), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("The account changed while updating the password. Please try again.");
    await audit({ action: "auth.password.changed", actorId: user.id, actorLabel: user.username, entityType: "User", entityId: user.id }, tx);
  });
  // Every other session is signed out; the current one stays.
  await revokeAllSessions(user.id, user.sessionId);
  return { ok: true };
}
