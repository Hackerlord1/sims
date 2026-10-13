import { randomUUID } from "node:crypto";
import type { RoleCode } from "@prisma/client";
import { createPrismaClient } from "@/server/prisma-client";
import request from "supertest";
import type { Server } from "node:http";
import { hashPassword } from "@/server/auth/password";

export const db = createPrismaClient();
export const PASSWORD = "Corr3ct-Horse-Battery!";
let passwordHash: Promise<string> | undefined;

export async function company(code = "TST") {
  const c = await db.company.upsert({ where: { code }, update: {}, create: { code, name: `Test ${code}`, isDemo: true } });
  const branch = await db.branch.upsert({ where: { companyId_code: { companyId: c.id, code: "B1" } }, update: {}, create: { companyId: c.id, code: "B1", name: "Branch 1" } });
  return { company: c, branch };
}

export async function makeUser(
  role: RoleCode,
  opts: { scopeCompanyId?: string; clearance?: "STANDARD" | "CONFIDENTIAL" | "HIGHLY_CONFIDENTIAL" | "RESTRICTED"; extra?: Record<string, unknown> } = {},
) {
  passwordHash ??= hashPassword(PASSWORD);
  const username = `u${randomUUID().slice(0, 12)}`;
  return db.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      fullName: `${role} tester`,
      permissionDenials: [],
      role,
      clearance: opts.clearance ?? "RESTRICTED",
      passwordHash: await passwordHash,
      
      ...(opts.scopeCompanyId ? { scopes: { create: [{ companyId: opts.scopeCompanyId, branchId: null }] } } : {}),
      ...(opts.extra ?? {}),
    },
  });
}

let ip = 1;
/** Signs in through the API and returns a Supertest agent that sends the session cookie and CSRF header. */
export async function login(server: Server, username: string, password = PASSWORD) {
  const agent = request.agent(server);
  const addr = `10.9.${Math.floor(ip / 250)}.${ip++ % 250}`;
  const res = await agent.post("/api/v1/auth/login").set("x-sims-csrf", "1").set("x-forwarded-for", addr).send({ identifier: username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
  const wrap = (m: "get" | "post" | "patch" | "put" | "delete") => (url: string) => {
    const r = agent[m](`/api/v1${url}`).set("cookie", cookie).set("x-forwarded-for", addr);
    return m === "get" ? r : r.set("x-sims-csrf", "1");
  };
  return { get: wrap("get"), post: wrap("post"), patch: wrap("patch"), put: wrap("put"), cookie, addr };
}

export type Client = Awaited<ReturnType<typeof login>>;
