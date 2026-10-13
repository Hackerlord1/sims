// Role → module → action policy. Pure and framework-free so it can be unit-tested and used by the
// UI for display. The server is the authority: every API handler calls the checks in
// src/server/authz.ts, which build on these functions.

export const ROLES = [
  "SYSTEM_ADMIN",
  "LEAD_INVESTIGATOR",
  "INVESTIGATOR",
  "INTERNAL_AUDIT_REVIEWER",
  "COMPLIANCE_REVIEWER",
  "LEGAL_OFFICER",
  "HR_OFFICER",
  "FINANCE_REVIEWER",
  "MANAGEMENT_APPROVER",
  "EXECUTIVE_READ_ONLY",
  "EXTERNAL_ADVOCATE_RESTRICTED",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SYSTEM_ADMIN: "System Administrator",
  LEAD_INVESTIGATOR: "Lead Investigator",
  INVESTIGATOR: "Investigator",
  INTERNAL_AUDIT_REVIEWER: "Internal Audit Reviewer",
  COMPLIANCE_REVIEWER: "Compliance Reviewer",
  LEGAL_OFFICER: "Legal Officer",
  HR_OFFICER: "HR Officer",
  FINANCE_REVIEWER: "Finance Reviewer",
  MANAGEMENT_APPROVER: "Management Approver",
  EXECUTIVE_READ_ONLY: "Read-Only Executive",
  EXTERNAL_ADVOCATE_RESTRICTED: "Restricted External Advocate",
};

export const MODULES = [
  "DASHBOARD",
  "CASES",
  "SUBFILES",
  "PARTIES",
  "INVOICES",
  "CHEQUES",
  "INTERVIEWS",
  "EVIDENCE",
  "WORK_LOGS",
  "TASKS",
  "FINDINGS",
  "DECISIONS",
  "CRIMINAL",
  "CIVIL",
  "DISCIPLINARY",
  "WRITE_OFFS",
  "EXPENSES",
  "ADVANCES",
  "BUDGETS",
  "RECOVERIES",
  "STATEMENTS",
  "REPORTS",
  "DATA_ADMIN",
  "AUDIT",
  "SETTINGS",
  "USERS",
] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_LABELS: Record<Module, string> = {
  DASHBOARD: "Dashboard",
  CASES: "Main case files",
  SUBFILES: "Case sub-files",
  PARTIES: "Parties, suspects and witnesses",
  INVOICES: "Invoice investigation",
  CHEQUES: "Bad-cheque tracking",
  INTERVIEWS: "Interviews and statements",
  EVIDENCE: "Evidence management",
  WORK_LOGS: "Work-done log",
  TASKS: "Tasks and deadlines",
  FINDINGS: "Findings and recommendations",
  DECISIONS: "Management decisions",
  CRIMINAL: "Criminal action",
  CIVIL: "Civil action",
  DISCIPLINARY: "Disciplinary action",
  WRITE_OFFS: "Write-offs",
  EXPENSES: "Investigation expenses",
  ADVANCES: "Advances and imprests",
  BUDGETS: "Budgets",
  RECOVERIES: "Recoveries",
  STATEMENTS: "Bank and M-Pesa analysis",
  REPORTS: "Reports and exports",
  DATA_ADMIN: "Data administration",
  AUDIT: "Audit logs",
  SETTINGS: "System settings",
  USERS: "User management",
};

export const ACTIONS = [
  "VIEW",
  "CREATE",
  "EDIT",
  "APPROVE",
  "EXPORT",
  "BULK_UPLOAD",
  "ARCHIVE",
  "SOFT_DELETE",
  "RESTORE",
  "REQUEST_PERMANENT_DELETION",
  "APPROVE_PERMANENT_DELETION",
  "MANAGE_USERS",
  "MANAGE_SETTINGS",
  "VIEW_AUDIT_LOGS",
] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  VIEW: "View",
  CREATE: "Create",
  EDIT: "Edit",
  APPROVE: "Approve",
  EXPORT: "Export",
  BULK_UPLOAD: "Bulk upload",
  ARCHIVE: "Archive",
  SOFT_DELETE: "Soft delete",
  RESTORE: "Restore",
  REQUEST_PERMANENT_DELETION: "Request permanent deletion",
  APPROVE_PERMANENT_DELETION: "Approve permanent deletion",
  MANAGE_USERS: "Manage users",
  MANAGE_SETTINGS: "Manage settings",
  VIEW_AUDIT_LOGS: "View audit logs",
};

// Compact grant notation, one letter per action.
const CODE: Record<string, Action> = {
  V: "VIEW",
  C: "CREATE",
  E: "EDIT",
  A: "APPROVE",
  X: "EXPORT",
  U: "BULK_UPLOAD",
  R: "ARCHIVE",
  D: "SOFT_DELETE",
  S: "RESTORE",
  P: "REQUEST_PERMANENT_DELETION",
  Q: "APPROVE_PERMANENT_DELETION",
  M: "MANAGE_USERS",
  G: "MANAGE_SETTINGS",
  L: "VIEW_AUDIT_LOGS",
};
type Grants = Partial<Record<Module, string>>;

/** Case-record modules an investigator works in day to day. */
const CASEWORK: Module[] = ["CASES", "SUBFILES", "PARTIES", "INVOICES", "CHEQUES", "INTERVIEWS", "EVIDENCE", "WORK_LOGS", "TASKS", "FINDINGS"];
const grantAll = (mods: readonly Module[], g: string): Grants => Object.fromEntries(mods.map((m) => [m, g]));

const ROLE_GRANTS: Record<Role, Grants> = {
  SYSTEM_ADMIN: {
    ...grantAll(MODULES, "VCEAXURDS"),
    DATA_ADMIN: "VCEAXURDSPQ",
    AUDIT: "VXL",
    SETTINGS: "VEG",
    USERS: "VCEM",
  },

  LEAD_INVESTIGATOR: {
    DASHBOARD: "V",
    ...grantAll(CASEWORK, "VCEXRDS"),
    CASES: "VCEAXRDS", // may close, reopen and place legal holds on cases in scope
    DECISIONS: "V",
    CRIMINAL: "VCEXRDS",
    CIVIL: "VCEXRDS",
    DISCIPLINARY: "VC",
    WRITE_OFFS: "VCERDS",
    EXPENSES: "VCEXRDS",
    ADVANCES: "VCERDS",
    BUDGETS: "VCERDS",
    RECOVERIES: "VCEXRDS",
    STATEMENTS: "VCEXRDS",
    REPORTS: "VX",
    DATA_ADMIN: "VU",
  },

  INVESTIGATOR: {
    DASHBOARD: "V",
    ...grantAll(CASEWORK, "VCE"),
    CRIMINAL: "VCE",
    CIVIL: "VCE",
    WRITE_OFFS: "V",
    EXPENSES: "VCE",
    ADVANCES: "VC",
    BUDGETS: "V",
    RECOVERIES: "VC",
    STATEMENTS: "VCE",
    REPORTS: "VX",
  },

  INTERNAL_AUDIT_REVIEWER: {
    DASHBOARD: "V",
    ...grantAll(CASEWORK, "VX"),
    DECISIONS: "V",
    CRIMINAL: "V",
    CIVIL: "V",
    WRITE_OFFS: "V",
    EXPENSES: "VX",
    ADVANCES: "VX",
    BUDGETS: "V",
    RECOVERIES: "VX",
    STATEMENTS: "V",
    REPORTS: "VX",
    AUDIT: "VXL",
  },

  COMPLIANCE_REVIEWER: {
    DASHBOARD: "V",
    ...grantAll(CASEWORK, "VX"),
    DECISIONS: "V",
    CRIMINAL: "V",
    CIVIL: "V",
    DISCIPLINARY: "V",
    WRITE_OFFS: "V",
    EXPENSES: "V",
    RECOVERIES: "V",
    STATEMENTS: "V",
    REPORTS: "VX",
    DATA_ADMIN: "VQ", // second-person approver for permanent deletion
    AUDIT: "VXL",
  },

  LEGAL_OFFICER: {
    DASHBOARD: "V",
    CASES: "V",
    SUBFILES: "V",
    PARTIES: "V",
    INTERVIEWS: "V",
    EVIDENCE: "V",
    WORK_LOGS: "VC",
    TASKS: "VCE",
    FINDINGS: "V",
    DECISIONS: "V",
    CRIMINAL: "VCEX",
    CIVIL: "VCEX",
    DISCIPLINARY: "V",
    WRITE_OFFS: "VE",
    RECOVERIES: "V",
    REPORTS: "VX",
  },

  HR_OFFICER: {
    DASHBOARD: "V",
    CASES: "V",
    PARTIES: "V",
    INTERVIEWS: "V",
    FINDINGS: "V",
    DECISIONS: "V",
    TASKS: "VCE",
    DISCIPLINARY: "VCEX",
    REPORTS: "VX",
  },

  FINANCE_REVIEWER: {
    DASHBOARD: "V",
    CASES: "V",
    SUBFILES: "V",
    INVOICES: "V",
    CHEQUES: "V",
    FINDINGS: "V",
    WRITE_OFFS: "VA",
    EXPENSES: "VEAX",
    ADVANCES: "VEAX",
    BUDGETS: "VX",
    RECOVERIES: "VEAX",
    STATEMENTS: "V",
    REPORTS: "VX",
  },

  MANAGEMENT_APPROVER: {
    DASHBOARD: "V",
    CASES: "VA",
    SUBFILES: "V",
    FINDINGS: "V",
    DECISIONS: "VCA",
    CRIMINAL: "V",
    CIVIL: "V",
    DISCIPLINARY: "V",
    WRITE_OFFS: "VA",
    EXPENSES: "VA",
    ADVANCES: "VA",
    BUDGETS: "VA",
    RECOVERIES: "V",
    REPORTS: "VX",
  },

  EXECUTIVE_READ_ONLY: {
    DASHBOARD: "V",
    CASES: "V",
    FINDINGS: "V",
    DECISIONS: "V",
    EXPENSES: "V",
    BUDGETS: "V",
    RECOVERIES: "V",
    REPORTS: "V",
  },

  EXTERNAL_ADVOCATE_RESTRICTED: {
    CASES: "V",
    PARTIES: "V",
    EVIDENCE: "V",
    TASKS: "V",
    CRIMINAL: "V",
    CIVIL: "VE",
  },
};

export function roleAllows(role: Role, module: Module, action: Action): boolean {
  const g = ROLE_GRANTS[role][module];
  if (!g) return false;
  return [...g].some((c) => CODE[c] === action);
}

export function roleModules(role: Role): Module[] {
  return MODULES.filter((m) => ROLE_GRANTS[role][m]);
}

/** The full role × module × action matrix, for documentation and the permissions screen. */
export function permissionMatrix(): Record<Role, Partial<Record<Module, Action[]>>> {
  const out = {} as Record<Role, Partial<Record<Module, Action[]>>>;
  for (const r of ROLES) {
    out[r] = {};
    for (const m of MODULES) {
      const actions = ACTIONS.filter((a) => roleAllows(r, m, a));
      if (actions.length) out[r][m] = actions;
    }
  }
  return out;
}

export interface PrincipalLike {
  id: string;
  role: Role;
  clearance: Confidentiality;
  /** Per-user restrictions ("MODULE:ACTION"). They only narrow the role; see isDenied. */
  denials?: readonly string[];
}

export const denialKey = (module: Module, action: Action) => `${module}:${action}`;

/** True when a per-user restriction removes this permission. Denying VIEW removes the whole module. */
export function isDenied(denials: readonly string[] | undefined, module: Module, action: Action): boolean {
  if (!denials?.length) return false;
  return denials.includes(denialKey(module, action)) || denials.includes(denialKey(module, "VIEW"));
}

/**
 * Keeps only well-formed restrictions for permissions the role actually grants, so a stored denial
 * can never be read as a grant and stale entries are dropped when a role changes.
 */
export function normaliseDenials(role: Role, denials: readonly string[]): string[] {
  // Administrators are never restricted, so no one can lock the system out of user management.
  if (role === "SYSTEM_ADMIN") return [];
  const out = new Set<string>();
  for (const d of denials) {
    const [m, a] = d.split(":");
    if ((MODULES as readonly string[]).includes(m!) && (ACTIONS as readonly string[]).includes(a!) && roleAllows(role, m as Module, a as Action)) out.add(d);
  }
  return [...out].sort();
}

export function can(user: Pick<PrincipalLike, "role" | "denials">, module: Module, action: Action): boolean {
  return roleAllows(user.role, module, action) && !isDenied(user.denials, module, action);
}

/** Who may approve other people's pending data changes: administrators and users flagged as data approvers. */
export function canApproveDataChanges(user: Pick<PrincipalLike, "role"> & { dataApprover?: boolean }): boolean {
  return user.role === "SYSTEM_ADMIN" || user.dataApprover === true;
}

// ───────────────────── Confidentiality ─────────────────────

export const CONFIDENTIALITY_LEVELS = ["STANDARD", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL", "RESTRICTED"] as const;
export type Confidentiality = (typeof CONFIDENTIALITY_LEVELS)[number];

const rank = (c: Confidentiality) => CONFIDENTIALITY_LEVELS.indexOf(c);

/** Highest level a role can ever see, regardless of the clearance granted to the user. */
export const ROLE_CLEARANCE_CAP: Record<Role, Confidentiality> = {
  SYSTEM_ADMIN: "RESTRICTED",
  LEAD_INVESTIGATOR: "RESTRICTED",
  INVESTIGATOR: "HIGHLY_CONFIDENTIAL",
  INTERNAL_AUDIT_REVIEWER: "HIGHLY_CONFIDENTIAL",
  COMPLIANCE_REVIEWER: "RESTRICTED",
  LEGAL_OFFICER: "RESTRICTED",
  HR_OFFICER: "HIGHLY_CONFIDENTIAL",
  FINANCE_REVIEWER: "CONFIDENTIAL",
  MANAGEMENT_APPROVER: "HIGHLY_CONFIDENTIAL",
  EXECUTIVE_READ_ONLY: "CONFIDENTIAL",
  EXTERNAL_ADVOCATE_RESTRICTED: "CONFIDENTIAL",
};

export function effectiveClearance(user: Pick<PrincipalLike, "role" | "clearance">): Confidentiality {
  const cap = ROLE_CLEARANCE_CAP[user.role];
  return rank(user.clearance) <= rank(cap) ? user.clearance : cap;
}

export function clearanceCovers(user: Pick<PrincipalLike, "role" | "clearance">, level: Confidentiality): boolean {
  return rank(effectiveClearance(user)) >= rank(level);
}

/** Levels (lowest first) the user may see — used to build database filters. */
export function visibleLevels(user: Pick<PrincipalLike, "role" | "clearance">): Confidentiality[] {
  return CONFIDENTIALITY_LEVELS.slice(0, rank(effectiveClearance(user)) + 1) as Confidentiality[];
}

/** Identification numbers, phone numbers and accounts are shown in full only at this clearance. */
export function canSeeSensitiveIdentifiers(user: Pick<PrincipalLike, "role" | "clearance">): boolean {
  return rank(effectiveClearance(user)) >= rank("HIGHLY_CONFIDENTIAL");
}

// ───────────────────── Case-level access ─────────────────────

/** Roles that only ever see cases they are actively assigned to. */
export const ASSIGNMENT_REQUIRED_ROLES: ReadonlySet<Role> = new Set<Role>(["INVESTIGATOR", "LEGAL_OFFICER", "HR_OFFICER", "EXTERNAL_ADVOCATE_RESTRICTED"]);

/**
 * Sensitive modules (HR records, financial statements and accounts) additionally require case
 * assignment, except for the listed oversight roles.
 */
export const SENSITIVE_MODULE_OVERRIDES: Partial<Record<Module, ReadonlySet<Role>>> = {
  STATEMENTS: new Set<Role>(["SYSTEM_ADMIN", "COMPLIANCE_REVIEWER", "INTERNAL_AUDIT_REVIEWER"]),
  DISCIPLINARY: new Set<Role>(["SYSTEM_ADMIN", "MANAGEMENT_APPROVER", "COMPLIANCE_REVIEWER"]),
};

export interface ScopeLike {
  companyId: string;
  /** null = every branch of the company */
  branchId: string | null;
}

export interface CaseAccessSubject {
  companyId: string;
  branchId: string | null;
  confidentiality: Confidentiality;
  leadInvestigatorId: string | null;
  supervisingManagerId?: string | null;
  /** ids of users with an active assignment */
  assignedUserIds: string[];
}

export type CaseAccessDecision = { allowed: true } | { allowed: false; reason: "MODULE" | "SCOPE" | "ASSIGNMENT" | "CONFIDENTIALITY" };

export function inScope(scopes: ScopeLike[], companyId: string, branchId: string | null): boolean {
  return scopes.some((s) => s.companyId === companyId && (s.branchId === null || s.branchId === branchId));
}

export function isAssigned(userId: string, subject: CaseAccessSubject): boolean {
  return subject.leadInvestigatorId === userId || subject.supervisingManagerId === userId || subject.assignedUserIds.includes(userId);
}

export function decideCaseAccess(user: PrincipalLike & { scopes: ScopeLike[] }, subject: CaseAccessSubject, module: Module, action: Action): CaseAccessDecision {
  if (!can(user, module, action)) return { allowed: false, reason: "MODULE" };
  if (user.role === "SYSTEM_ADMIN") return { allowed: true };

  const assigned = isAssigned(user.id, subject);
  if (!clearanceCovers(user, subject.confidentiality)) return { allowed: false, reason: "CONFIDENTIALITY" };
  // RESTRICTED cases are need-to-know: assignment is always required.
  if (subject.confidentiality === "RESTRICTED" && !assigned) return { allowed: false, reason: "ASSIGNMENT" };
  const override = SENSITIVE_MODULE_OVERRIDES[module];
  if (override && !assigned && !override.has(user.role)) return { allowed: false, reason: "ASSIGNMENT" };
  if (ASSIGNMENT_REQUIRED_ROLES.has(user.role)) {
    return assigned ? { allowed: true } : { allowed: false, reason: "ASSIGNMENT" };
  }
  if (assigned) return { allowed: true };
  return inScope(user.scopes, subject.companyId, subject.branchId) ? { allowed: true } : { allowed: false, reason: "SCOPE" };
}

// ───────────────────── Maker-checker ─────────────────────

export class MakerCheckerViolation extends Error {
  constructor(message = "You cannot approve a request you made yourself.") {
    super(message);
    this.name = "MakerCheckerViolation";
  }
}

/** A requester must never approve their own expense, advance, write-off, decision or deletion request. */
export function assertMakerChecker(requesterId: string | null | undefined, approverId: string): void {
  if (requesterId && requesterId === approverId) throw new MakerCheckerViolation();
}
