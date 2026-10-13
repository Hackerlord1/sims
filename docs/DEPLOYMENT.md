# Deploying SIMS

SIMS is one Next.js application (web pages and the `/api/v1` REST API), a background worker, a
MariaDB 10.11 database (MySQL-compatible; reached through Prisma's MySQL connector and the MariaDB
driver adapter) and a private file store for evidence, statements and reports.

The production target is a cPanel shared host ("Setup Node.js App" / Passenger) with its local
MariaDB. Why MariaDB and what that changed: [MYSQL-MIGRATION-PLAN.md](MYSQL-MIGRATION-PLAN.md).
Step-by-step first deployment and checks: [CPANEL-VERIFICATION.md](CPANEL-VERIFICATION.md).

## Requirements

- Node.js 24 LTS and npm (the current host runs 24.21; Next.js 16 itself needs 20.9 or later)
- MariaDB 10.11+ (10.6 is the minimum: `JSON_TABLE` and `SKIP LOCKED`). MySQL 8.0.30+ also works
  with the same migrations, but the project is tested on MariaDB.
- A database user allowed to create **triggers** (all integrity guards are triggers). On a server
  with binary logging on, that needs SUPER or `log_bin_trust_function_creators=1`; on the current
  host binary logging is off and cPanel's "ALL PRIVILEGES" is enough.
- Python 3.11+ with `pip install -r parsers/requirements.txt` for the pandas statement parser.
  Without Python the built-in Node parser is used (`STATEMENT_PARSER=node`).
- A persistent disk for `STORAGE_DIR`, outside any public web directory
- TLS termination in front of the app (cPanel/AutoSSL, a reverse proxy or a load balancer)

## Database (cPanel)

1. **MySQL Databases** → create the database (e.g. `cpaneluser_sims`) and a user, then add the user
   to the database with **ALL PRIVILEGES**.
2. Once, in phpMyAdmin (SQL tab, on that database), make utf8mb4 the database default. Prisma
   creates every table as utf8mb4 explicitly, but the server default on the current host is latin1:

   ```sql
   ALTER DATABASE `cpaneluser_sims` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

3. `DATABASE_URL` (below) uses that user and database on `127.0.0.1:3306`.

The host's server-wide `sql_mode` is empty (non-strict). That is acceptable: every connection the
app opens switches itself to strict mode and to UTC (`src/server/prisma-client.ts`), so over-long or
invalid values are rejected rather than silently truncated.

## Configuration

Copy `.env.example` to `.env` (or set the variables in cPanel's Node.js app screen). In production:

| Variable              | Value                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `NODE_ENV`            | `production` (set by `npm start`)                                                        |
| `DATABASE_URL`        | `mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE?connection_limit=5` (see pool size below) |
| `SESSION_SECRET`      | 32 random bytes, base64 — signs session tokens                                           |
| `DATA_ENCRYPTION_KEY` | 32 random bytes, base64 — encrypts two-step verification secrets. **Back it up**         |
| `APP_URL`             | The public HTTPS origin, e.g. `https://sims.example.co.ke` (used for CSRF origin checks) |
| `STORAGE_DIR`         | Absolute path of the file store                                                          |
| `DEMO_MODE`           | `false` — the app refuses to start with `true` in production                             |
| `JOBS_INLINE`         | `false` when the worker runs as its own process; `true` to run jobs inside the web app   |
| `MALWARE_SCAN_URL`    | Optional HTTP malware scanner for uploads                                                |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Never commit `.env`; it is git-ignored. URL-encode special characters in the database password.

**Pool size.** `connection_limit` is the number of database connections _per Node process_. The
current host allows 18 connections per database user in total, shared by every Passenger process of
the app, the worker, migrations and phpMyAdmin. Keep `processes × connection_limit` comfortably
below that: with the default of 5, at most 2–3 app processes plus the worker.

## Install and start (cPanel or any server without Docker)

```bash
npm ci
# Back up first: MariaDB applies DDL statement by statement, so a migration that fails half-way
# is NOT rolled back (see "Upgrades").
npx prisma migrate deploy        # applies every migration, including the integrity triggers
npm run verify-db                # strict/UTC connections, 46 triggers, 14 checks, guards fire
npm run build
npm start                        # preflight check, then server.js (Passenger entry point)
npm run worker                   # optional second process: parsing, imports, reminders
```

`prisma migrate deploy` needs no shadow database and no CREATE DATABASE privilege.

Create the first administrator from the Users screen after signing in with a bootstrap account, or
with the seed script in a controlled step (`DEMO_MODE=false` seeds organisation data only). Every
production System Administrator is required to set up two-step verification at first sign-in.

## With Docker Compose (optional)

```bash
docker compose --profile app up -d --build
```

This runs `db` (MariaDB 10.11, configured like the production host), a one-off `migrate` service,
`app` (port 3000 on localhost) and `worker`, with the file store on the `sims-storage` volume. Put a
TLS reverse proxy in front of port 3000.

## Reverse proxy

- Forward `X-Forwarded-For` so sign-in rate limiting and audit entries record the client address.
- Allow request bodies up to the largest upload you permit (setting "Maximum evidence or statement file size", default 25 MB, up to 50 MB; bulk import files up to 60 MB).
- The app sends security headers itself (frame denial, `nosniff`, referrer policy, permissions
  policy, COOP, and HSTS in production). Session cookies are `Secure`, `HttpOnly`, `SameSite=Lax`
  and use the `__Host-` prefix in production.

## Health and monitoring

- `GET /api/health` returns 200 when the app and database respond; use it for load balancer checks.
- Security alerts (repeated failed sign-ins, evidence hash mismatches, administrator role changes,
  permanent deletions, demo mode in production) appear under **Administration → Audit logs**.
- Run `npm run verify-storage` on a schedule to confirm every stored file still matches its SHA-256.
- To confirm the integrity guards are installed:
  `SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE();` (expect 46).

## Upgrades

1. Back up the database and file store (see [BACKUP-RESTORE.md](BACKUP-RESTORE.md)). This is not
   optional: unlike PostgreSQL, MariaDB cannot roll back a half-applied migration.
2. Deploy the new version, run `npx prisma migrate deploy`, then restart the app and the worker.
3. If a migration fails, do not re-run it blindly: `npx prisma migrate status` shows which one
   failed. Either restore the backup, or finish or undo the failed statements by hand and record
   the outcome with `npx prisma migrate resolve --applied <name>` or `--rolled-back <name>`.
