import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "@/server/prisma-client";

// Minimal request context for next/headers outside a Next.js request.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, "user-agent": "vitest" }),
}));

const { signIn, MAX_FAILED_LOGINS } = await import("@/server/auth/sign-in");
const { hashPassword } = await import("@/server/auth/password");
const { loadSession } = await import("@/server/auth/session");

const db = createPrismaClient();
const PASSWORD = "Corr3ct-Horse-Battery!";

async function makeUser(extra: Record<string, unknown> = {}) {
  const username = `u${randomUUID().slice(0, 12)}`;
  return db.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      fullName: "Integration Tester",
      permissionDenials: [],
      role: "INVESTIGATOR",
      passwordHash: await hashPassword(PASSWORD),
      
      ...extra,
    },
  });
}

beforeEach(() => {
  jar.clear();
  process.env.DEMO_MODE = "true";
});
afterAll(() => db.$disconnect());

describe("sign-in", () => {
  it("creates a session and audits success", async () => {
    const user = await makeUser();
    const r = await signIn(user.username.toUpperCase(), PASSWORD);
    expect(r).toEqual({ ok: true, next: "/dashboard" });
    const session = await loadSession();
    expect(session?.userId).toBe(user.id);
    // The cookie holds the raw token; the database only holds its keyed hash.
    const token = [...jar.values()][0]!;
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
    expect(await db.auditLog.count({ where: { actorId: user.id, action: "auth.login.success" } })).toBe(1);
  });

  

  it("gives the same error for unknown users and wrong passwords", async () => {
    const user = await makeUser();
    const a = await signIn("nobody-" + randomUUID(), PASSWORD);
    const b = await signIn(user.username, "wrong-password");
    expect(a).toEqual(b);
    expect(a.ok).toBe(false);
  });

  it("locks the account after repeated failures and raises an alert", async () => {
    const user = await makeUser();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await signIn(user.username, "nope");
    const locked = await signIn(user.username, PASSWORD); // correct password, still locked
    expect(locked.ok).toBe(false);
    expect(await db.securityAlert.count({ where: { subjectUserId: user.id, type: "REPEATED_FAILED_LOGINS" } })).toBe(1);
  });

  it("refuses suspended accounts", async () => {
    const user = await makeUser({ status: "SUSPENDED" });
    expect((await signIn(user.username, PASSWORD)).ok).toBe(false);
  });

  it("disables the demo administrator outside demo mode", async () => {
    const admin = await makeUser({ role: "SYSTEM_ADMIN", isDemoAdmin: true });
    process.env.DEMO_MODE = "false";
    expect((await signIn(admin.username, PASSWORD)).ok).toBe(false);
    process.env.DEMO_MODE = "true";
    expect((await signIn(admin.username, PASSWORD)).ok).toBe(true);
  });

  it("disables fictional demo accounts outside demo mode", async () => {
    const demo = await makeUser({ role: "INVESTIGATOR", isDemo: true });
    process.env.DEMO_MODE = "false";
    expect((await signIn(demo.username, PASSWORD)).ok).toBe(false);
    process.env.DEMO_MODE = "true";
    expect((await signIn(demo.username, PASSWORD)).ok).toBe(true);
  });

  it("never writes the password to the audit log", async () => {
    const user = await makeUser();
    await signIn(user.username, "S3cret-Typo-Password!");
    const rows = await db.auditLog.findMany({ where: { actorId: user.id } });
    expect(JSON.stringify(rows)).not.toContain("S3cret-Typo-Password!");
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });

  it("refuses to run with DEMO_MODE in production", async () => {
    const user = await makeUser();
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      await expect(signIn(user.username, PASSWORD)).rejects.toThrow(/DEMO_MODE/);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });
});
