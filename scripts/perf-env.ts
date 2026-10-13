import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Shared settings for the performance dataset. It lives in its own database (sims_perf) and storage
 * folder so loading hundreds of thousands of fictional rows never touches development or test data.
 */
export const PERF = {
  database: "sims_perf",
  storage: path.join(tmpdir(), "sims-perf-storage"),
  /** Fictional password for every seeded account in sims_perf only. */
  password: "Perf-Fictional-Pass-2026!",
};

function envDatabaseUrl(): string {
  if (process.env.PERF_DATABASE_URL) return process.env.PERF_DATABASE_URL;
  const env = readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing from .env");
  return line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

export function perfDatabaseUrl(): string {
  const url = new URL(envDatabaseUrl());
  url.pathname = `/${PERF.database}`;
  return url.toString();
}

/** Server connection with no default database (MariaDB has no maintenance database like `postgres`). */
export function perfAdminUrl(): string {
  const url = new URL(perfDatabaseUrl());
  url.pathname = "/";
  return url.toString();
}

/** Makes the server modules (imported afterwards) use the performance database and storage. */
export function applyPerfEnvironment() {
  if (process.env.NODE_ENV === "production") throw new Error("Performance tooling must not run with NODE_ENV=production.");
  process.env.DATABASE_URL = perfDatabaseUrl();
  process.env.STORAGE_DIR = PERF.storage;
  process.env.DEMO_MODE = "true";
  process.env.JOBS_INLINE = "false";
}
