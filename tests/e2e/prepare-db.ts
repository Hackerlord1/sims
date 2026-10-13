import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createPrismaClient } from "../../src/server/prisma-client";
import { hash } from "@node-rs/argon2";
import integrationSetup from "../integration/global-setup";
import { testDatabaseUrl } from "../integration/test-db";
import { E2E } from "./env";

// Recreates sims_test, seeds the fictional demo data (felix + one account per role + demo cases)
// and adds a dedicated end-to-end administrator with a known password.
// Runs as the first half of the Playwright webServer command, so the database is ready before the
// server starts (Playwright starts web servers before globalSetup).
async function prepare() {
  await integrationSetup();
  execSync("node --conditions=react-server --import tsx prisma/seed.ts", {
    cwd: resolve(__dirname, "../.."),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl(),
      DEMO_MODE: "true",
      DEMO_ADMIN_PASSWORD: E2E.felixTemp,
      DEMO_USERS_PASSWORD: E2E.password,
      SEED_RESET_DEMO_ADMIN: "true",
      STORAGE_DIR: E2E.storage,
    },
    stdio: "pipe",
  });
  const db = createPrismaClient(testDatabaseUrl());
  try {
    const passwordHash = await hash(E2E.password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const admin = await db.user.upsert({
      where: { username: "e2e.admin" },
      update: { passwordHash, status: "ACTIVE" },
      create: {
        username: "e2e.admin",
        email: "e2e.admin@sims.test",
        fullName: "E2E Administrator (fictional)",
        role: "SYSTEM_ADMIN",
        clearance: "RESTRICTED",
        passwordHash,
        permissionDenials: [],
        
        isDemo: true,
      },
    });
    for (const c of await db.company.findMany()) {
      if (!(await db.userScope.findFirst({ where: { userId: admin.id, companyId: c.id } }))) await db.userScope.create({ data: { userId: admin.id, companyId: c.id } });
    }
    // Deletion requests in the e2e run must not wait for the recycle-bin retention period.
    await db.systemSetting.upsert({ where: { key: "retention.minRecycleDays" }, update: { value: 0 }, create: { key: "retention.minRecycleDays", value: 0 } });
  } finally {
    await db.$disconnect();
  }
}

prepare().catch((e: unknown) => {
  console.error("E2E database preparation failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
