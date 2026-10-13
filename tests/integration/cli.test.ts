import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { verifyPassword } from "@/server/auth/password";
import { db } from "./helpers";
import { testDatabaseUrl } from "./test-db";

const root = path.resolve(__dirname, "../..");
const run = (script: string, args: string[]) =>
  execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", `scripts/${script}`, ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    encoding: "utf8",
  });

afterAll(async () => {
  await db.$disconnect();
});

describe("command-line tools", () => {
  it("create-admin bootstraps an administrator with a one-time temporary password and audits it", async () => {
    const out = run("create-admin.ts", ["--username", "cli.admin", "--email", "cli.admin@sims.test", "--name", "CLI Administrator (fictional)"]);
    const password = /Temporary password \(shown once\): (\S+)/.exec(out)?.[1];
    expect(password).toBeTruthy();
    const user = await db.user.findUniqueOrThrow({ where: { username: "cli.admin" } });
    expect(user.role).toBe("SYSTEM_ADMIN");
    
    expect(user.passwordHash).not.toContain(password!);
    expect(await verifyPassword(user.passwordHash, password!)).toBe(true);
    expect(await db.auditLog.count({ where: { action: "users.create_admin_cli", entityId: user.id } })).toBe(1);
    expect(await db.securityAlert.count({ where: { type: "ADMIN_ROLE_CHANGE", subjectUserId: user.id } })).toBe(1);

    // A second run with the same username is refused.
    expect(() => run("create-admin.ts", ["--username", "cli.admin", "--email", "other@sims.test", "--name", "Someone Else"])).toThrow();
  }, 60_000);

  it("verify-storage reports missing files and exits with an error", async () => {
    const uploader = await db.user.findUniqueOrThrow({ where: { username: "cli.admin" } });
    const file = await db.storedFile.create({
      data: { sha256: "0".repeat(64), storageKey: "zz/missing-file-for-test", originalName: "missing.pdf", mimeType: "application/pdf", sizeBytes: 1, uploadedById: uploader.id },
    });
    let output = "";
    try {
      run("verify-storage.ts", []);
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? "");
    }
    expect(output).toContain(`MISSING  ${file.id}`);
  }, 60_000);
});
