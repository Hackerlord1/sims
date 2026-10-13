import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  assertMakerChecker,
  can,
  canApproveDataChanges,
  normaliseDenials,
  clearanceCovers,
  decideCaseAccess,
  effectiveClearance,
  MakerCheckerViolation,
  MODULES,
  permissionMatrix,
  roleAllows,
  ROLES,
  visibleLevels,
  type CaseAccessSubject,
  type PrincipalLike,
  type Role,
  type ScopeLike,
} from "./permissions";

const user = (role: Role, extra: Partial<PrincipalLike & { scopes: ScopeLike[] }> = {}) => ({
  id: "u1",
  role,
  clearance: "RESTRICTED" as const,
  scopes: [{ companyId: "c1", branchId: null }],
  ...extra,
});

const subject = (extra: Partial<CaseAccessSubject> = {}): CaseAccessSubject => ({
  companyId: "c1",
  branchId: "b1",
  confidentiality: "CONFIDENTIAL",
  leadInvestigatorId: "someone-else",
  supervisingManagerId: null,
  assignedUserIds: [],
  ...extra,
});

describe("role policy", () => {
  it("defines all eleven roles and every granular action", () => {
    expect(ROLES).toHaveLength(11);
    expect(ACTIONS).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it("keeps the Read-Only Executive read-only everywhere", () => {
    for (const m of MODULES) {
      for (const a of ACTIONS.filter((x) => x !== "VIEW")) expect(roleAllows("EXECUTIVE_READ_ONLY", m, a)).toBe(false);
    }
    expect(roleAllows("EXECUTIVE_READ_ONLY", "CASES", "VIEW")).toBe(true);
  });

  it("gives Finance approval over expenses and recoveries, not investigators", () => {
    expect(roleAllows("FINANCE_REVIEWER", "EXPENSES", "APPROVE")).toBe(true);
    expect(roleAllows("FINANCE_REVIEWER", "RECOVERIES", "APPROVE")).toBe(true);
    expect(roleAllows("INVESTIGATOR", "EXPENSES", "APPROVE")).toBe(false);
    expect(roleAllows("LEAD_INVESTIGATOR", "EXPENSES", "APPROVE")).toBe(false);
  });

  it("restricts HR records to HR, oversight and administrators", () => {
    expect(roleAllows("HR_OFFICER", "DISCIPLINARY", "EDIT")).toBe(true);
    expect(roleAllows("INVESTIGATOR", "DISCIPLINARY", "VIEW")).toBe(false);
    expect(roleAllows("FINANCE_REVIEWER", "DISCIPLINARY", "VIEW")).toBe(false);
    expect(roleAllows("EXTERNAL_ADVOCATE_RESTRICTED", "DISCIPLINARY", "VIEW")).toBe(false);
  });

  it("keeps external advocates away from statements, audit, users and settings", () => {
    for (const m of ["STATEMENTS", "AUDIT", "USERS", "SETTINGS", "DATA_ADMIN", "EXPENSES"] as const) {
      expect(roleAllows("EXTERNAL_ADVOCATE_RESTRICTED", m, "VIEW")).toBe(false);
    }
  });

  it("reserves user and settings management to administrators", () => {
    for (const r of ROLES.filter((x) => x !== "SYSTEM_ADMIN")) {
      expect(roleAllows(r, "USERS", "MANAGE_USERS")).toBe(false);
      expect(roleAllows(r, "SETTINGS", "MANAGE_SETTINGS")).toBe(false);
    }
    expect(roleAllows("SYSTEM_ADMIN", "USERS", "MANAGE_USERS")).toBe(true);
  });

  it("separates requesting and approving permanent deletion", () => {
    expect(roleAllows("SYSTEM_ADMIN", "DATA_ADMIN", "REQUEST_PERMANENT_DELETION")).toBe(true);
    expect(roleAllows("COMPLIANCE_REVIEWER", "DATA_ADMIN", "APPROVE_PERMANENT_DELETION")).toBe(true);
    expect(roleAllows("COMPLIANCE_REVIEWER", "DATA_ADMIN", "REQUEST_PERMANENT_DELETION")).toBe(false);
    expect(roleAllows("LEAD_INVESTIGATOR", "DATA_ADMIN", "APPROVE_PERMANENT_DELETION")).toBe(false);
  });

  it("limits bulk upload to administrators and lead investigators", () => {
    const allowed = ROLES.filter((r) => roleAllows(r, "DATA_ADMIN", "BULK_UPLOAD"));
    expect(allowed.sort()).toEqual(["LEAD_INVESTIGATOR", "SYSTEM_ADMIN"]);
  });

  it("gives audit-log access only to administrators and reviewers", () => {
    const allowed = ROLES.filter((r) => can({ role: r }, "AUDIT", "VIEW_AUDIT_LOGS"));
    expect(allowed.sort()).toEqual(["COMPLIANCE_REVIEWER", "INTERNAL_AUDIT_REVIEWER", "SYSTEM_ADMIN"]);
  });

  it("exposes a matrix consistent with roleAllows", () => {
    const m = permissionMatrix();
    for (const r of ROLES)
      for (const [mod, actions] of Object.entries(m[r])) {
        for (const a of actions!) expect(roleAllows(r, mod as (typeof MODULES)[number], a)).toBe(true);
      }
  });
});

describe("confidentiality", () => {
  it("caps clearance by role", () => {
    expect(effectiveClearance({ role: "FINANCE_REVIEWER", clearance: "RESTRICTED" })).toBe("CONFIDENTIAL");
    expect(effectiveClearance({ role: "INVESTIGATOR", clearance: "STANDARD" })).toBe("STANDARD");
    expect(clearanceCovers({ role: "EXECUTIVE_READ_ONLY", clearance: "RESTRICTED" }, "HIGHLY_CONFIDENTIAL")).toBe(false);
    expect(visibleLevels({ role: "FINANCE_REVIEWER", clearance: "RESTRICTED" })).toEqual(["STANDARD", "CONFIDENTIAL"]);
  });
});

describe("case access", () => {
  it("lets administrators see everything", () => {
    expect(decideCaseAccess(user("SYSTEM_ADMIN", { scopes: [] }), subject({ confidentiality: "RESTRICTED" }), "CASES", "VIEW")).toEqual({ allowed: true });
  });

  it("requires assignment for investigators", () => {
    expect(decideCaseAccess(user("INVESTIGATOR"), subject(), "CASES", "VIEW")).toEqual({ allowed: false, reason: "ASSIGNMENT" });
    expect(decideCaseAccess(user("INVESTIGATOR"), subject({ assignedUserIds: ["u1"] }), "CASES", "VIEW")).toEqual({ allowed: true });
  });

  it("treats the supervising manager as assigned", () => {
    expect(decideCaseAccess(user("INVESTIGATOR"), subject({ supervisingManagerId: "u1" }), "CASES", "VIEW")).toEqual({ allowed: true });
  });

  it("uses company and branch scope for scoped roles", () => {
    expect(decideCaseAccess(user("LEAD_INVESTIGATOR"), subject(), "CASES", "VIEW")).toEqual({ allowed: true });
    expect(decideCaseAccess(user("LEAD_INVESTIGATOR", { scopes: [{ companyId: "c2", branchId: null }] }), subject(), "CASES", "VIEW")).toEqual({
      allowed: false,
      reason: "SCOPE",
    });
    expect(decideCaseAccess(user("LEAD_INVESTIGATOR", { scopes: [{ companyId: "c1", branchId: "b9" }] }), subject(), "CASES", "VIEW").allowed).toBe(false);
  });

  it("requires assignment for RESTRICTED cases even in scope", () => {
    expect(decideCaseAccess(user("LEAD_INVESTIGATOR"), subject({ confidentiality: "RESTRICTED" }), "CASES", "VIEW")).toEqual({
      allowed: false,
      reason: "ASSIGNMENT",
    });
  });

  it("denies cases above the user's clearance", () => {
    expect(decideCaseAccess(user("MANAGEMENT_APPROVER"), subject({ confidentiality: "RESTRICTED", assignedUserIds: ["u1"] }), "CASES", "VIEW")).toEqual({
      allowed: false,
      reason: "CONFIDENTIALITY",
    });
  });

  it("requires assignment for sensitive statement analysis unless an oversight role", () => {
    expect(decideCaseAccess(user("LEAD_INVESTIGATOR"), subject(), "STATEMENTS", "VIEW")).toEqual({ allowed: false, reason: "ASSIGNMENT" });
    expect(decideCaseAccess(user("LEAD_INVESTIGATOR"), subject({ leadInvestigatorId: "u1" }), "STATEMENTS", "VIEW")).toEqual({ allowed: true });
    expect(decideCaseAccess(user("COMPLIANCE_REVIEWER"), subject(), "STATEMENTS", "VIEW")).toEqual({ allowed: true });
  });

  it("checks the module before anything else", () => {
    expect(decideCaseAccess(user("EXECUTIVE_READ_ONLY"), subject(), "CASES", "EDIT")).toEqual({ allowed: false, reason: "MODULE" });
  });
});

describe("maker-checker", () => {
  it("blocks self-approval", () => {
    expect(() => assertMakerChecker("u1", "u1")).toThrow(MakerCheckerViolation);
    expect(() => assertMakerChecker("u1", "u2")).not.toThrow();
    expect(() => assertMakerChecker(null, "u2")).not.toThrow();
  });
});

describe("per-user restrictions", () => {
  it("remove single permissions without touching the rest of the role", () => {
    const u = { role: "INVESTIGATOR" as const, denials: ["EXPENSES:CREATE"] };
    expect(can(u, "EXPENSES", "CREATE")).toBe(false);
    expect(can(u, "EXPENSES", "VIEW")).toBe(true);
    expect(can(u, "EXPENSES", "EDIT")).toBe(true);
    expect(can(u, "TASKS", "CREATE")).toBe(true);
  });

  it("remove a whole module when View is restricted", () => {
    const u = { role: "LEAD_INVESTIGATOR" as const, denials: ["STATEMENTS:VIEW"] };
    for (const a of ACTIONS) expect(can(u, "STATEMENTS", a)).toBe(false);
    expect(can(u, "CASES", "VIEW")).toBe(true);
  });

  it("can never grant more than the role", () => {
    expect(normaliseDenials("INVESTIGATOR", ["USERS:MANAGE_USERS", "EXPENSES:CREATE", "BOGUS:VIEW", "EXPENSES:NOPE", "EXPENSES:CREATE"])).toEqual(["EXPENSES:CREATE"]);
    expect(can({ role: "INVESTIGATOR", denials: [] }, "USERS", "MANAGE_USERS")).toBe(false);
  });

  it("never apply to administrators", () => {
    expect(normaliseDenials("SYSTEM_ADMIN", ["USERS:VIEW", "USERS:MANAGE_USERS"])).toEqual([]);
  });

  it("decide who may approve data changes", () => {
    expect(canApproveDataChanges({ role: "SYSTEM_ADMIN" })).toBe(true);
    expect(canApproveDataChanges({ role: "COMPLIANCE_REVIEWER" })).toBe(false);
    expect(canApproveDataChanges({ role: "COMPLIANCE_REVIEWER", dataApprover: true })).toBe(true);
  });
});
