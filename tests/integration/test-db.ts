import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** DATABASE_URL from .env with the database name swapped to sims_test. Never touches the dev database. */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const env = readFileSync(resolve(__dirname, "../../.env"), "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL missing from .env");
  const url = new URL(line.slice("DATABASE_URL=".length).replace(/^"|"$/g, ""));
  url.pathname = "/sims_test";
  return url.toString();
}

/** Server connection with no default database (MariaDB has no maintenance database like `postgres`). */
export function adminDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.pathname = "/";
  return url.toString();
}
