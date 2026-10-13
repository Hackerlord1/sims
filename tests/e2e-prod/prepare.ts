import { execFileSync, execSync } from "node:child_process";
import { resolve } from "node:path";
import { createPrismaClient } from "../../src/server/prisma-client";
import { PROD } from "./env";

// Recreates the sims_e2e_prod database, migrates it, seeds organisation data only (DEMO_MODE=false,
// as in production) and bootstraps the first administrator with the real create-admin command.
// The temporary password it prints is handed to the tests through a file in the OS temp folder.
async function prepare() {
  const url = new URL(PROD.databaseUrl());
  if (url.pathname !== "/sims_e2e_prod") throw new Error("Refusing to reset a database that is not sims_e2e_prod.");
  const adminUrl = new URL(url);
  adminUrl.pathname = "/"; // no default database: MariaDB has no maintenance database like `postgres`
  const admin = createPrismaClient(adminUrl.toString());
  try {
    // MariaDB has no WITH (FORCE): the drop waits for open connections to sims_e2e_prod.
    await admin.$executeRawUnsafe("DROP DATABASE IF EXISTS sims_e2e_prod");
    await admin.$executeRawUnsafe("CREATE DATABASE sims_e2e_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  } finally {
    await admin.$disconnect();
  }
  const root = resolve(__dirname, "../..");
  const env = { ...process.env, DATABASE_URL: url.toString(), DEMO_MODE: "false", STORAGE_DIR: PROD.storage };
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("node --conditions=react-server --import tsx prisma/seed.ts", { cwd: root, env, stdio: "pipe" });
  const out = execFileSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/create-admin.ts", "--username", PROD.admin, "--email", "prod.admin@sims.test", "--name", "Production Test Administrator (fictional)"],
    {
      cwd: root,
      env,
      encoding: "utf8",
    },
  );
  const password = /Temporary password \(shown once\): (\S+)/.exec(out)?.[1];
  if (!password) throw new Error("create-admin did not print a temporary password");
  PROD.writeTemporaryPassword(password);
}

prepare().catch((e: unknown) => {
  console.error("Production e2e preparation failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
