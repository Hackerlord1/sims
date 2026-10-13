// Checks that the database SIMS is connected to has every integrity guarantee in place, using the
// same connection setup as the app (src/server/prisma-client.ts). Read-only: the one guard it fires
// is rejected by the trigger, so nothing is written. Exits with code 1 if any check fails.
// Usage: npm run verify-db   (reads DATABASE_URL from the environment or .env)
import { createPrismaClient } from "../src/server/prisma-client";

const EXPECTED_MIGRATIONS = ["20261007074748_init", "20261007082645_integrity_guards", "20261007084943_job_claim_index", "20261007122648_invoice_register_index"];
const EXPECTED_TRIGGERS = 46;
const EXPECTED_CHECKS = 14;

const db = createPrismaClient();
let failed = 0;
function report(ok: boolean, label: string, detail: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(44)} ${detail}`);
}
const one = async <T>(sql: string) => (await db.$queryRawUnsafe<T[]>(sql))[0]!;

async function main() {
  const server = await one<{ v: string; c: string }>("SELECT VERSION() AS v, @@version_comment AS c");
  console.log(`Database server: ${server.v} (${server.c})\n`);

  const session = await one<{ mode: string; tz: string }>("SELECT @@SESSION.sql_mode AS mode, @@SESSION.time_zone AS tz");
  report(session.mode.includes("STRICT_TRANS_TABLES"), "App connections use strict sql_mode", session.mode || "(empty)");
  report(session.tz === "+00:00", "App connections use UTC", session.tz);

  const version = /^(\d+)\.(\d+)/.exec(server.v);
  const major = Number(version?.[1]),
    minor = Number(version?.[2]);
  const isMaria = /mariadb/i.test(server.v + server.c);
  report(isMaria ? major > 10 || (major === 10 && minor >= 6) : major >= 8, "Server version supported", isMaria ? "MariaDB ≥ 10.6 required" : "MySQL ≥ 8.0 required");

  const migrations = await db.$queryRawUnsafe<{ name: string; finished: Date | null; rolledBack: Date | null }[]>(
    "SELECT migration_name AS name, finished_at AS finished, rolled_back_at AS rolledBack FROM _prisma_migrations",
  );
  const applied = new Set(migrations.filter((m) => m.finished && !m.rolledBack).map((m) => m.name));
  const missing = EXPECTED_MIGRATIONS.filter((m) => !applied.has(m));
  const unfinished = migrations.filter((m) => !m.finished && !m.rolledBack).map((m) => m.name);
  report(
    !missing.length && !unfinished.length,
    "Migrations applied",
    missing.length ? `missing: ${missing.join(", ")}` : unfinished.length ? `FAILED/unfinished: ${unfinished.join(", ")}` : `${applied.size} applied`,
  );

  const triggers = Number((await one<{ n: bigint }>("SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()")).n);
  report(triggers === EXPECTED_TRIGGERS, "Integrity triggers installed", `${triggers} of ${EXPECTED_TRIGGERS}`);

  const checks = Number((await one<{ n: bigint }>("SELECT COUNT(*) AS n FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CHECK_CLAUSE NOT LIKE 'json_valid%'")).n);
  report(checks === EXPECTED_CHECKS, "Money and date CHECK constraints", `${checks} of ${EXPECTED_CHECKS}`);

  const latin = await db.$queryRawUnsafe<{ t: string; c: string }[]>(
    "SELECT TABLE_NAME AS t, TABLE_COLLATION AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_COLLATION NOT LIKE 'utf8mb4%'",
  );
  report(!latin.length, "All tables are utf8mb4", latin.length ? latin.map((r) => `${r.t}=${r.c}`).join(", ") : "yes");

  const tokens = Number((await one<{ n: bigint }>("SELECT COUNT(*) AS n FROM PurgeToken")).n);
  report(tokens === 0, "No purge tokens left behind", `${tokens} row(s)`);

  // A token for another connection must be refused by purge_token_guard_bi (error 1644). Nothing is written.
  const guard = await db.$executeRawUnsafe("INSERT INTO PurgeToken (caseId, connectionId) VALUES ('verify-db-probe', CONNECTION_ID() + 1)").then(
    () => "ACCEPTED",
    (e: Error) => e.message,
  );
  report(
    /current connection/.test(guard),
    "Guard triggers fire",
    /current connection/.test(guard) ? "purge-token guard rejected a forged token" : `unexpected: ${guard.split("\n").filter(Boolean).slice(-1)[0]}`,
  );

  console.log(failed ? `\n${failed} check(s) FAILED.` : "\nAll checks passed.");
  process.exitCode = failed ? 1 : 0;
}

main()
  .catch((e: unknown) => {
    console.error("verify-db could not run:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
