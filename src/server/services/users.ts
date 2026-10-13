import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import { badRequest, conflict } from "@/server/api/errors";
import { hashPassword, temporaryPassword } from "@/server/auth/password";
import type { CurrentUser } from "@/server/auth/principal";
import { ENUMS } from "@/lib/enums";
import { normaliseDenials, type Role } from "@/lib/permissions";

export const scopeSchema = z.array(z.object({ companyId: z.string().min(1).max(64), branchId: z.string().max(64).nullish() })).max(50);
/** "MODULE:ACTION" restrictions; normalised against the role before they are stored. */
export const denialsSchema = z.array(z.string().max(64)).max(400);

export const userBody = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, "Use 3–40 letters, numbers, dots, dashes or underscores."),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(ENUMS.RoleCode),
  clearance: z.enum(ENUMS.Confidentiality).default("CONFIDENTIAL"),
  telephone: z.string().trim().max(30).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  employeeNumber: z.string().trim().max(40).optional(),
  scopes: scopeSchema.default([]),
  permissionDenials: denialsSchema.default([]),
  dataApprover: z.boolean().default(false),
});
export type UserBody = z.output<typeof userBody>;

export const publicUser = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  clearance: true,
  telephone: true,
  jobTitle: true,
  employeeNumber: true,
  lockedUntil: true,
  lastLoginAt: true,
  mfaEnabled: true,
  isDemo: true,
  createdAt: true,
  version: true,
  permissionDenials: true,
  dataApprover: true,
  scopes: { select: { companyId: true, branchId: true, company: { select: { name: true } }, branch: { select: { name: true } } } },
} satisfies Prisma.UserSelect;

export async function validateScopes(scopes: { companyId: string; branchId?: string | null }[]) {
  for (const s of scopes) {
    if (!(await prisma.company.findUnique({ where: { id: s.companyId } }))) throw badRequest("Unknown company in scope.");
    if (s.branchId && !(await prisma.branch.findFirst({ where: { id: s.branchId, companyId: s.companyId } }))) throw badRequest("Branch does not belong to the company.");
  }
}

/**
 * Creates an account with a one-time temporary password that must be changed at first sign-in.
 * Used by the Users screen and by access-request approval. Pass `tx` to join a wider transaction.
 * Pass `passwordHash` to keep a password the person already chose (an access request); no
 * temporary password is issued then.
 */
export async function createUserAccount(actor: CurrentUser, body: UserBody, opts: { tx?: Tx; source?: string; passwordHash?: string } = {}) {
  await validateScopes(body.scopes);
  const clash = await prisma.user.findFirst({ where: { OR: [{ username: body.username }, { email: body.email }, ...(body.employeeNumber ? [{ employeeNumber: body.employeeNumber }] : [])] } });
  if (clash) throw conflict("A user with that username, email or employee number already exists.");
  const password = opts.passwordHash ? undefined : temporaryPassword();
  const passwordHash = opts.passwordHash ?? (await hashPassword(password!));
  const denials = normaliseDenials(body.role as Role, body.permissionDenials);
  const run = async (tx: Tx) => {
    const u = await tx.user.create({
      data: {
        username: body.username,
        email: body.email,
        fullName: body.fullName,
        role: body.role,
        clearance: body.clearance,
        telephone: body.telephone,
        jobTitle: body.jobTitle,
        employeeNumber: body.employeeNumber,
        passwordHash,
        
        ...(opts.passwordHash ? { passwordChangedAt: new Date() } : {}),
        permissionDenials: denials,
        dataApprover: body.dataApprover,
        scopes: { create: body.scopes.map((s) => ({ companyId: s.companyId, branchId: s.branchId ?? null })) },
      },
      select: publicUser,
    });
    await audit(
      {
        action: "users.create",
        actorId: actor.id,
        actorLabel: actor.username,
        entityType: "user",
        entityId: u.id,
        after: { username: u.username, role: u.role, clearance: u.clearance, scopes: body.scopes.length, restrictions: denials.length, dataApprover: body.dataApprover },
        ...(opts.source ? { details: { source: opts.source } } : {}),
      },
      tx,
    );
    return u;
  };
  const created = opts.tx ? await run(opts.tx) : await prisma.$transaction(run);
  if (body.role === "SYSTEM_ADMIN") {
    await raiseAlert({ type: "ADMIN_ROLE_CHANGE", severity: "HIGH", message: `${actor.username} created administrator account ${created.username}.`, subjectUserId: created.id });
  }
  return { user: created, temporaryPassword: password };
}
