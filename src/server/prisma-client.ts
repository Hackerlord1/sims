// Builds every PrismaClient in the project (app, worker, scripts, seed, tests) through the MariaDB
// driver adapter. No "server-only" import: scripts and tests construct clients too.
//
// Why the adapter: the production host (MariaDB 10.11 on cPanel) runs with an empty sql_mode, and
// Prisma's built-in connector inherits it, so an over-long string is silently truncated and invalid
// values are coerced instead of rejected. The adapter's pool runs `initSql` on every new
// connection, which restores the strict behaviour the schema was written for.
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, type Prisma } from "@prisma/client";

/** Session sql_mode for every connection: fail on bad data instead of truncating or coercing it. */
export const SESSION_SQL_MODE = ["STRICT_TRANS_TABLES", "STRICT_ALL_TABLES", "ERROR_FOR_DIVISION_BY_ZERO", "NO_ZERO_DATE", "NO_ZERO_IN_DATE", "NO_ENGINE_SUBSTITUTION"].join(",");

/** Default pool size per process. The host allows 18 connections per database user in total. */
const DEFAULT_CONNECTION_LIMIT = 5;

/**
 * Parses a `mysql://user:password@host:port/database?connection_limit=n` URL into the adapter's pool
 * configuration. `connection_limit` keeps its Prisma meaning so DATABASE_URL stays portable.
 */
export function mariadbAdapter(databaseUrl: string): PrismaMariaDb {
  const url = new URL(databaseUrl);
  if (url.protocol !== "mysql:") throw new Error("DATABASE_URL must be a mysql:// URL.");
  const limit = Number(url.searchParams.get("connection_limit") ?? DEFAULT_CONNECTION_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) throw new Error("connection_limit in DATABASE_URL must be a positive integer.");
  const database = decodeURIComponent(url.pathname.slice(1)) || undefined;
  return new PrismaMariaDb(
    {
      host: url.hostname,
      port: Number(url.port || 3306),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database,
      connectionLimit: limit,
      // UTC so that CURRENT_TIMESTAMP column defaults and raw NOW() agree with the UTC values Prisma
      // writes; the host's server time zone is not UTC.
      initSql: [`SET SESSION sql_mode = '${SESSION_SQL_MODE}'`, "SET SESSION time_zone = '+00:00'"],
    },
    { database },
  );
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL, options: Omit<Prisma.PrismaClientOptions, "adapter" | "datasources" | "datasourceUrl"> = {}) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  return new PrismaClient({
    ...options,
    adapter: mariadbAdapter(databaseUrl),
    // The workflows (row lock, then re-read, then maker-checker) were written and tested against
    // PostgreSQL's READ COMMITTED; InnoDB defaults to REPEATABLE READ. READ COMMITTED keeps the
    // same semantics: every statement sees the latest committed data, and no gap locks.
    transactionOptions: { isolationLevel: "ReadCommitted", ...options.transactionOptions },
  });
}
