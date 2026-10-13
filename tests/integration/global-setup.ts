import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { createPrismaClient } from "../../src/server/prisma-client";
import { adminDatabaseUrl, testDatabaseUrl } from "./test-db";

// Recreates the dedicated sims_test database and applies every migration (including the integrity
// triggers). It never touches the development database.
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  if (url.pathname !== "/sims_test") throw new Error("Refusing to reset a database that is not sims_test.");
  const admin = createPrismaClient(adminDatabaseUrl());
  try {
    // MariaDB has no WITH (FORCE): the drop waits for open connections to sims_test.
    await admin.$executeRawUnsafe("DROP DATABASE IF EXISTS sims_test");
    await admin.$executeRawUnsafe("CREATE DATABASE sims_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  } finally {
    await admin.$disconnect();
  }
  execSync("npx prisma migrate deploy", {
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: "pipe",
  });
}
