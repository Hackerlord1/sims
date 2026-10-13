import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { audit, raiseAlert } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/principal";
import { ASSIGNMENT_REQUIRED_ROLES, SENSITIVE_MODULE_OVERRIDES, can, decideCaseAccess, visibleLevels, type Action, type CaseAccessSubject, type Module } from "@/lib/permissions";

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const BYPASS_ALERT_THRESHOLD = 5;
const BYPASS_WINDOW_MS = 10 * 60 * 1000;

async function recordDenial(user: CurrentUser, detail: Record<string, unknown>, caseId?: string) {
  await audit({
    action: "authz.denied",
    actorId: user.id,
    actorLabel: user.username,
    caseId: caseId ?? null,
    outcome: "DENIED",
    details: detail,
  });
  const recent = await prisma.auditLog.count({
    where: { actorId: user.id, action: "authz.denied", at: { gte: new Date(Date.now() - BYPASS_WINDOW_MS) } },
  });
  if (recent === BYPASS_ALERT_THRESHOLD) {
    await raiseAlert({
      type: "PERMISSION_BYPASS_ATTEMPT",
      severity: "HIGH",
      message: `${user.username} was denied access ${recent} times in 10 minutes.`,
      subjectUserId: user.id,
      details: detail,
    });
  }
}

/** Module × action check. Throws AuthorizationError and audits the denial. */
export async function requirePermission(user: CurrentUser, module: Module, action: Action): Promise<void> {
  if (can(user, module, action)) return;
  await recordDenial(user, { module, action, reason: "MODULE" });
  throw new AuthorizationError();
}

export async function loadCaseAccessSubject(caseId: string) {
  const c = await prisma.case.findFirst({
    where: { id: caseId },
    select: {
      id: true,
      reference: true,
      companyId: true,
      branchId: true,
      confidentiality: true,
      leadInvestigatorId: true,
      supervisingManagerId: true,
      status: true,
      legalHold: true,
      isDeleted: true,
      currency: true,
      assignments: { where: { active: true }, select: { userId: true } },
    },
  });
  if (!c) return null;
  const subject: CaseAccessSubject & typeof c = {
    ...c,
    assignedUserIds: c.assignments.map((a) => a.userId),
  };
  return subject;
}

export type CaseSubject = NonNullable<Awaited<ReturnType<typeof loadCaseAccessSubject>>>;

/**
 * Full case-level check: module, action, company/branch scope, assignment, sensitive-module
 * rules and confidentiality. A missing case and a forbidden case produce the same error so ids
 * cannot be probed. Deleted cases are only reachable with `allowDeleted` (Recycle Bin).
 */
export async function requireCaseAccess(user: CurrentUser, caseId: string, module: Module, action: Action, opts: { allowDeleted?: boolean } = {}): Promise<CaseSubject> {
  const subject = await loadCaseAccessSubject(caseId);
  const visible = subject && (!subject.isDeleted || opts.allowDeleted);
  const decision = visible ? decideCaseAccess(user, subject, module, action) : ({ allowed: false, reason: "NOT_FOUND" } as const);
  if (!decision.allowed) {
    await recordDenial(user, { module, action, reason: decision.reason, caseId }, subject ? caseId : undefined);
    throw new AuthorizationError("Case not found or access denied.");
  }
  return subject!;
}

/**
 * Prisma filter returning exactly the cases `decideCaseAccess` would allow for (module, VIEW).
 * Used by every list so pagination totals never leak hidden records.
 */
export function caseVisibilityWhere(user: CurrentUser, module: Module = "CASES"): Prisma.CaseWhereInput {
  if (!can(user, module, "VIEW")) return { id: { in: [] } };
  if (user.role === "SYSTEM_ADMIN") return {};

  const levels = visibleLevels(user);
  const assigned: Prisma.CaseWhereInput = {
    OR: [{ leadInvestigatorId: user.id }, { supervisingManagerId: user.id }, { assignments: { some: { userId: user.id, active: true } } }],
  };
  const override = SENSITIVE_MODULE_OVERRIDES[module];
  const mustBeAssigned = ASSIGNMENT_REQUIRED_ROLES.has(user.role) || (override !== undefined && !override.has(user.role));
  if (mustBeAssigned) return { AND: [{ confidentiality: { in: levels } }, assigned] };

  const scoped: Prisma.CaseWhereInput = {
    OR: user.scopes.map((s) => (s.branchId ? { companyId: s.companyId, branchId: s.branchId } : { companyId: s.companyId })),
  };
  return {
    AND: [{ confidentiality: { in: levels } }, { OR: [assigned, ...(user.scopes.length ? [{ AND: [{ confidentiality: { not: "RESTRICTED" as const } }, scoped] }] : [])] }],
  };
}
