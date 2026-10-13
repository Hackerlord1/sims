import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { audit, requestMeta } from "@/server/audit";
import { ApiError, badRequest, notFound } from "@/server/api/errors";
import { requirePermission } from "@/server/authz";
import type { CurrentUser } from "@/server/auth/principal";
import { nextYearReference } from "@/server/references";
import { rateLimit } from "@/server/rate-limit";
import { hashPassword } from "@/server/auth/password";
import { createNotifications } from "@/server/services/notifications";
import { createUserAccount, userBody } from "@/server/services/users";
import { checkPasswordStrength } from "@/lib/password-policy";

export const accessRequestBody = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    username: userBody.shape.username,
    password: z.string().max(128),
    /** Honeypot: hidden from people, filled in by bots. */
    website: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const strength = checkPasswordStrength(v.password, { username: v.username, fullName: v.fullName });
    if (!strength.ok) ctx.addIssue({ code: "custom", path: ["password"], message: strength.problems.join(" ") });
  });

export const RECEIVED_MESSAGE = "Thank you. An administrator will review your request. You can sign in with the username and password you chose once it has been approved.";

/** Every column except the requester's password hash, which never leaves the server. */
const requestColumns = {
  id: true,
  reference: true,
  fullName: true,
  username: true,
  email: true,
  telephone: true,
  employeeNumber: true,
  jobTitle: true,
  unit: true,
  requestedRole: true,
  justification: true,
  status: true,
  ipAddress: true,
  createdAt: true,
  decidedById: true,
  decidedAt: true,
  decisionComment: true,
  createdUserId: true,
} satisfies Prisma.AccessRequestSelect;

/**
 * Records a request from the sign-in screen. The reply is identical whether or not a request was
 * stored (duplicate, existing account, honeypot), so the form cannot be used to discover accounts.
 */
export async function submitAccessRequest(input: z.output<typeof accessRequestBody>) {
  const { ipAddress } = await requestMeta();
  if (!rateLimit(`access-request:ip:${ipAddress ?? "unknown"}`, 5, 60 * 60 * 1000).ok || !rateLimit("access-request:all", 200, 60 * 60 * 1000).ok) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests from this network. Please try again later.");
  }
  if (input.website) return { message: RECEIVED_MESSAGE };

  // Hashed before the duplicate check so the reply takes as long whether or not the username is taken.
  const passwordHash = await hashPassword(input.password);
  const [existingUser, pending] = await Promise.all([
    prisma.user.findUnique({ where: { username: input.username }, select: { id: true } }),
    prisma.accessRequest.findFirst({ where: { username: input.username, status: "PENDING" }, select: { id: true } }),
  ]);
  if (existingUser || pending) {
    await audit({ action: "access_requests.duplicate", outcome: "DENIED", entityType: "accessRequest", details: { reason: existingUser ? "existing account" : "pending request" } });
    return { message: RECEIVED_MESSAGE };
  }

  const created = await prisma.$transaction(async (tx) => {
    const reference = await nextYearReference(tx, "accessRequest");
    const r = await tx.accessRequest.create({
      data: {
        reference,
        fullName: input.fullName,
        username: input.username,
        passwordHash,
        ipAddress,
      },
    });
    await audit({ action: "access_requests.submit", entityType: "accessRequest", entityId: r.id, details: { reference } }, tx);
    return r;
  });

  const admins = await prisma.user.findMany({ where: { role: "SYSTEM_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (admins.length) {
    await createNotifications(
      prisma,
      admins.map((a) => ({
        userId: a.id,
        kind: "APPROVAL",
        title: "New access request",
        body: `${created.fullName} asked for access (${created.reference}).`,
        link: "/admin/users?tab=requests",
        dedupeKey: `access-request:${created.id}`,
      })),
    );
  }
  return { message: RECEIVED_MESSAGE };
}

export async function listAccessRequests(user: CurrentUser, status: "PENDING" | "APPROVED" | "REJECTED" | undefined, page: number, pageSize: number) {
  await requirePermission(user, "USERS", "VIEW");
  const where: Prisma.AccessRequestWhereInput = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.accessRequest.count({ where }),
    prisma.accessRequest.findMany({ where, select: requestColumns, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { total, rows };
}

export const approveBody = userBody.extend({ comment: z.string().trim().max(1000).optional() });

/**
 * Creates the account with the role, units, clearance and restrictions the administrator chose. The
 * account keeps the password the requester chose; older requests without one get a temporary password.
 */
export async function approveAccessRequest(user: CurrentUser, id: string, body: z.output<typeof approveBody>) {
  await requirePermission(user, "USERS", "MANAGE_USERS");
  const req = await prisma.accessRequest.findUnique({ where: { id } });
  if (!req) throw notFound("Access request");
  if (req.status !== "PENDING") throw new ApiError(409, "INVALID_TRANSITION", "This request has already been decided.");
  const { comment, ...account } = body;
  // The requester signs in with the username they chose, so it cannot be changed here.
  if (req.username && account.username !== req.username) throw badRequest("The username must be the one the requester chose.");
  return prisma.$transaction(async (tx) => {
    // Conditional claim so two administrators cannot approve the same request twice.
    const claimed = await tx.accessRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date(), decisionComment: comment || null, passwordHash: null },
    });
    if (!claimed.count) throw new ApiError(409, "INVALID_TRANSITION", "This request has already been decided.");
    const result = await createUserAccount(user, account, { tx, source: `access request ${req.reference}`, passwordHash: req.passwordHash ?? undefined });
    await tx.accessRequest.update({ where: { id }, data: { createdUserId: result.user.id } });
    await audit(
      {
        action: "access_requests.approve",
        actorId: user.id,
        actorLabel: user.username,
        entityType: "accessRequest",
        entityId: id,
        details: { reference: req.reference, userId: result.user.id, role: account.role, scopes: account.scopes.length, restrictions: account.permissionDenials.length },
      },
      tx,
    );
    return result;
  });
}

export async function rejectAccessRequest(user: CurrentUser, id: string, reason: string) {
  await requirePermission(user, "USERS", "MANAGE_USERS");
  const req = await prisma.accessRequest.findUnique({ where: { id }, select: { reference: true } });
  if (!req) throw notFound("Access request");
  return prisma.$transaction(async (tx) => {
    const res = await tx.accessRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date(), decisionComment: reason, passwordHash: null },
    });
    if (!res.count) throw new ApiError(409, "INVALID_TRANSITION", "This request has already been decided.");
    await audit({ action: "access_requests.reject", actorId: user.id, actorLabel: user.username, entityType: "accessRequest", entityId: id, reason, details: { reference: req.reference } }, tx);
    return { status: "REJECTED" };
  });
}
