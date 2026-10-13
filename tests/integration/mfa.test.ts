import { Secret, TOTP } from "otpauth";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiServer } from "./http";
import { db, login, makeUser, PASSWORD, type Client } from "./helpers";

const server = apiServer();

/** The code an authenticator app would show for `secret`, `offsetSteps` periods from now. */
function codeFor(secret: string, offsetSteps = 0) {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offsetSteps * 30_000 });
}

let user: { id: string; username: string };
let secret: string;
let first: Client;

beforeAll(async () => {
  user = await makeUser("INVESTIGATOR");
  first = await login(server, user.username);
});
afterAll(async () => {
  server.close();
  await db.$disconnect();
});

describe("two-step verification (TOTP)", () => {
  it("enrols only after a valid code from the new secret, storing the secret encrypted", async () => {
    const start = await first.post("/me/mfa/enrol").send({});
    expect(start.status).toBe(201);
    secret = start.body.data.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(start.body.data.uri).toMatch(/^otpauth:\/\/totp\/SIMS:/);
    expect(start.body.data.qrSvg).toContain("<svg");

    const wrong = await first.post("/me/mfa/confirm").send({ code: "000000" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("MFA_FAILED");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).mfaEnabled).toBe(false);

    const ok = await first.post("/me/mfa/confirm").send({ code: codeFor(secret) });
    expect(ok.status).toBe(201);
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.mfaEnabled).toBe(true);
    expect(stored.mfaPendingSecret).toBeNull();
    expect(stored.mfaSecret).toMatch(/^v1\./);
    expect(stored.mfaSecret).not.toContain(secret);
    // The enrolling session stays usable.
    expect((await first.get("/auth/me")).status).toBe(200);
  });

  it("blocks a new password-only session until a code is verified, and refuses replayed codes", async () => {
    const second = await login(server, user.username);
    const blocked = await second.get("/cases");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toMatch(/verification/i);

    // The code used for enrolment belongs to an already-used time step.
    expect((await second.post("/auth/mfa/verify").send({ code: codeFor(secret) })).status).toBe(400);

    const next = codeFor(secret, 1);
    const verified = await second.post("/auth/mfa/verify").send({ code: next });
    expect(verified.status).toBe(201);
    expect((await second.get("/cases")).status).toBe(200);

    const third = await login(server, user.username);
    expect((await third.post("/auth/mfa/verify").send({ code: next })).status).toBe(400);
    const log = await db.auditLog.findMany({ where: { actorId: user.id, action: { startsWith: "auth.mfa" } }, orderBy: { at: "asc" } });
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["auth.mfa.enabled", "auth.mfa.verified", "auth.mfa.failed"]));
    expect(JSON.stringify(log)).not.toContain(secret);
  });

  it("limits guessing and raises a security alert", async () => {
    const target = await makeUser("INVESTIGATOR");
    const enrolling = await login(server, target.username);
    const s = (await enrolling.post("/me/mfa/enrol").send({})).body.data.secret as string;
    expect((await enrolling.post("/me/mfa/confirm").send({ code: codeFor(s) })).status).toBe(201);
    const guesser = await login(server, target.username);
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await guesser.post("/auth/mfa/verify").send({ code: String(100000 + i) })).status);
    expect(statuses).toEqual([400, 400, 400, 400]);
    const lastBody = await guesser.post("/auth/mfa/verify").send({ code: "123456" });
    expect(lastBody.body.error.message).toMatch(/too many attempts/i);
    expect(await db.securityAlert.count({ where: { subjectUserId: target.id, type: "REPEATED_FAILED_LOGINS" } })).toBe(1);
  });

  it("an administrator can reset a lost device, signing the user out; nobody can reset their own", async () => {
    const adminUser = await makeUser("SYSTEM_ADMIN");
    const admin = await login(server, adminUser.username);
    expect((await admin.post(`/users/${adminUser.id}/mfa/reset`).send({ reason: "Testing self reset" })).status).toBe(403);
    expect((await admin.post(`/users/${user.id}/mfa/reset`).send({ reason: "Lost phone (fictional)" })).status).toBe(201);
    expect((await first.get("/auth/me")).status).toBe(401);
    const cleared = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(cleared.mfaEnabled).toBe(false);
    expect(cleared.mfaSecret).toBeNull();
    expect(await db.auditLog.count({ where: { action: "users.mfa_reset", entityId: user.id, reason: "Lost phone (fictional)" } })).toBe(1);

    const investigator = await login(server, (await makeUser("INVESTIGATOR")).username);
    expect((await investigator.post(`/users/${user.id}/mfa/reset`).send({ reason: "Not allowed here" })).status).toBe(403);
  });

  it("switching MFA off needs the password and a current code", async () => {
    const u = await makeUser("INTERNAL_AUDIT_REVIEWER");
    const c = await login(server, u.username);
    const s = (await c.post("/me/mfa/enrol").send({})).body.data.secret as string;
    expect((await c.post("/me/mfa/confirm").send({ code: codeFor(s) })).status).toBe(201);
    expect((await c.post("/me/mfa/disable").send({ password: "wrong-password", code: codeFor(s, 1) })).status).toBe(400);
    expect((await c.post("/me/mfa/disable").send({ password: PASSWORD, code: codeFor(s, 1) })).status).toBe(201);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).mfaEnabled).toBe(false);
  });
});
