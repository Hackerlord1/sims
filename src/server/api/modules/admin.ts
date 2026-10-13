import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { idParam, listMeta, ListResult, paginationQuery, type Router } from "@/server/api/router";
import { ApiError, notFound } from "@/server/api/errors";
import { prisma } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import { requirePermission } from "@/server/authz";
import { hashPassword, temporaryPassword } from "@/server/auth/password";
import { createUserAccount, denialsSchema, publicUser, scopeSchema, userBody, validateScopes } from "@/server/services/users";
import { revokeAllSessions } from "@/server/auth/session";
import { resetUserMfa } from "@/server/auth/mfa";
import { allSettings, invalidateSettings, SETTINGS, type SettingKey } from "@/server/services/settings";
import { ENUMS } from "@/lib/enums";
import { normaliseDenials, type Role } from "@/lib/permissions";
import { stringArray } from "@/lib/string-array";

export function registerAdmin(router: Router) {
  router.add({
    method: "GET",
    path: "/users",
    summary: "Users (search by name, username or email; filter by role and status)",
    tags: ["Administration"],
    query: paginationQuery.extend({ role: z.enum(ENUMS.RoleCode).optional(), status: z.enum(ENUMS.UserStatus).optional() }),
    async handler({ user, query }) {
      await requirePermission(user, "USERS", "VIEW");
      const where: Prisma.UserWhereInput = {
        ...(query.role ? { role: query.role } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.q ? { OR: [{ fullName: { contains: query.q } }, { username: { contains: query.q } }, { email: { contains: query.q } }] } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({ where, select: publicUser, orderBy: [{ fullName: "asc" }, { id: "asc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      ]);
      return new ListResult(rows, listMeta(query.page, query.pageSize, total));
    },
  });

  router.add({
    method: "POST",
    path: "/users",
    summary: "Create a user. Returns a one-time temporary password that must be changed at first sign-in.",
    tags: ["Administration"],
    body: userBody,
    async handler({ user, body }) {
      await requirePermission(user, "USERS", "MANAGE_USERS");
      return createUserAccount(user, body);
    },
  });

  router.add({
    method: "PATCH",
    path: "/users/:id",
    summary: "Change a user's role, clearance, status or profile (permission changes are audited)",
    tags: ["Administration"],
    body: userBody
      .omit({ username: true, scopes: true, permissionDenials: true, dataApprover: true })
      .partial()
      .extend({
        status: z.enum(ENUMS.UserStatus).optional(),
        version: z.number().int().optional(),
        permissionDenials: denialsSchema.optional(),
        dataApprover: z.boolean().optional(),
      }),
    async handler({ user, params, body }) {
      await requirePermission(user, "USERS", "MANAGE_USERS");
      const id = idParam(params);
      const existing = await prisma.user.findUnique({ where: { id }, select: publicUser });
      if (!existing) throw notFound("User");
      if (id === user.id && ((body.role && body.role !== existing.role) || (body.status && body.status !== "ACTIVE"))) {
        throw new ApiError(409, "CONFLICT", "You cannot change your own role or suspend your own account.");
      }
      const { version, permissionDenials, ...data } = body;
      if (version !== undefined && version !== existing.version) throw new ApiError(409, "STALE_VERSION", "This user was changed by someone else. Reload and try again.");
      if (id === user.id && (permissionDenials !== undefined || body.dataApprover !== undefined)) {
        throw new ApiError(409, "CONFLICT", "You cannot change your own restrictions or approval rights.");
      }
      // Restrictions are re-checked against the (possibly new) role, so stale ones are dropped.
      const role = (body.role ?? existing.role) as Role;
      const denials = normaliseDenials(role, permissionDenials ?? stringArray(existing.permissionDenials, "permissionDenials"));
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.user.update({ where: { id }, data: { ...data, permissionDenials: denials, version: { increment: 1 } }, select: publicUser });
        const permissionChange =
          (body.role && body.role !== existing.role) ||
          (body.clearance && body.clearance !== existing.clearance) ||
          (body.status && body.status !== existing.status) ||
          (body.dataApprover !== undefined && body.dataApprover !== existing.dataApprover) ||
          denials.join() !== [...stringArray(existing.permissionDenials, "permissionDenials")].sort().join();
        await audit(
          { action: permissionChange ? "users.permission_change" : "users.update", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: id, before: existing, after: u },
          tx,
        );
        return u;
      });
      if (body.status && body.status !== "ACTIVE") await revokeAllSessions(id);
      if ((body.role === "SYSTEM_ADMIN" || existing.role === "SYSTEM_ADMIN") && body.role && body.role !== existing.role) {
        await raiseAlert({ type: "ADMIN_ROLE_CHANGE", severity: "HIGH", message: `${user.username} changed ${existing.username} from ${existing.role} to ${body.role}.`, subjectUserId: id });
      }
      return updated;
    },
  });

  router.add({
    method: "PUT",
    path: "/users/:id/scopes",
    summary: "Replace a user's company and branch scope",
    tags: ["Administration"],
    body: z.object({ scopes: scopeSchema }),
    async handler({ user, params, body }) {
      await requirePermission(user, "USERS", "MANAGE_USERS");
      const id = idParam(params);
      if (!(await prisma.user.findUnique({ where: { id } }))) throw notFound("User");
      await validateScopes(body.scopes);
      return prisma.$transaction(async (tx) => {
        const before = await tx.userScope.count({ where: { userId: id } });
        await tx.userScope.deleteMany({ where: { userId: id } });
        await tx.userScope.createMany({ data: body.scopes.map((s) => ({ userId: id, companyId: s.companyId, branchId: s.branchId ?? null })) });
        await audit(
          { action: "users.permission_change", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: id, before: { scopes: before }, after: { scopes: body.scopes.length } },
          tx,
        );
        return { scopes: body.scopes.length };
      });
    },
  });

  router.add({
    method: "POST",
    path: "/users/:id/reset-password",
    summary: "Issue a new temporary password (shown once) and sign the user out everywhere",
    tags: ["Administration"],
    async handler({ user, params }) {
      await requirePermission(user, "USERS", "MANAGE_USERS");
      const id = idParam(params);
      if (!(await prisma.user.findUnique({ where: { id } }))) throw notFound("User");
      const password = temporaryPassword();
      await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password),  failedLoginCount: 0, lockedUntil: null, version: { increment: 1 } } });
      await revokeAllSessions(id);
      await audit({ action: "users.password_reset", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: id });
      return { temporaryPassword: password };
    },
  });

  router.add({
    method: "POST",
    path: "/users/:id/mfa/reset",
    summary: "Clear a user's two-step verification (lost device); they are signed out and must enrol again",
    tags: ["Administration"],
    body: z.object({ reason: z.string().trim().min(5).max(1000) }),
    async handler({ user, params, body }) {
      await requirePermission(user, "USERS", "MANAGE_USERS");
      const id = idParam(params);
      if (id === user.id) throw new ApiError(403, "FORBIDDEN", "Ask another administrator to reset your own two-step verification.");
      if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw notFound("User");
      await resetUserMfa(user, id, body.reason);
      return { reset: true };
    },
  });

  router.add({
    method: "POST",
    path: "/users/:id/unlock",
    summary: "Unlock an account locked after failed sign-ins",
    tags: ["Administration"],
    async handler({ user, params }) {
      await requirePermission(user, "USERS", "MANAGE_USERS");
      const id = idParam(params);
      await prisma.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
      await audit({ action: "users.unlock", actorId: user.id, actorLabel: user.username, entityType: "user", entityId: id });
      return { unlocked: true };
    },
  });

  router.add({
    method: "GET",
    path: "/security-alerts",
    summary: "Unacknowledged security alerts",
    tags: ["Administration"],
    async handler({ user }) {
      await requirePermission(user, "AUDIT", "VIEW_AUDIT_LOGS");
      return prisma.securityAlert.findMany({ where: { acknowledgedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
    },
  });

  router.add({
    method: "POST",
    path: "/security-alerts/:id/acknowledge",
    summary: "Acknowledge a security alert",
    tags: ["Administration"],
    async handler({ user, params }) {
      await requirePermission(user, "AUDIT", "VIEW_AUDIT_LOGS");
      await prisma.securityAlert.update({ where: { id: idParam(params) }, data: { acknowledgedAt: new Date(), acknowledgedById: user.id } });
      await audit({ action: "security_alert.acknowledge", actorId: user.id, actorLabel: user.username, entityType: "securityAlert", entityId: params.id });
      return { acknowledged: true };
    },
  });

  router.add({
    method: "GET",
    path: "/settings",
    summary: "System settings",
    tags: ["Administration"],
    async handler({ user }) {
      await requirePermission(user, "SETTINGS", "VIEW");
      return allSettings();
    },
  });

  router.add({
    method: "PUT",
    path: "/settings",
    summary: "Update system settings",
    tags: ["Administration"],
    body: z.record(z.string().max(64), z.unknown()),
    async handler({ user, body }) {
      await requirePermission(user, "SETTINGS", "MANAGE_SETTINGS");
      const errors: Record<string, string> = {};
      const values: [SettingKey, unknown][] = [];
      for (const [key, value] of Object.entries(body)) {
        const def = SETTINGS[key as SettingKey];
        if (!def) {
          errors[key] = "Unknown setting.";
          continue;
        }
        const parsed = def.schema.safeParse(value);
        if (!parsed.success) errors[key] = parsed.error.issues[0]?.message ?? "Invalid value.";
        else values.push([key as SettingKey, parsed.data]);
      }
      if (Object.keys(errors).length) throw new ApiError(422, "VALIDATION_FAILED", "Some settings are invalid.", { fields: errors });
      const before = await allSettings();
      await prisma.$transaction(async (tx) => {
        for (const [key, value] of values) {
          await tx.systemSetting.upsert({
            where: { key },
            update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
            create: { key, value: value as Prisma.InputJsonValue, updatedById: user.id },
          });
        }
        await audit(
          {
            action: "settings.update",
            actorId: user.id,
            actorLabel: user.username,
            entityType: "systemSetting",
            before: Object.fromEntries(before.filter((b) => values.some(([k]) => k === b.key)).map((b) => [b.key, b.value])),
            after: Object.fromEntries(values),
          },
          tx,
        );
      });
      invalidateSettings();
      return allSettings();
    },
  });
}
