# cPanel deployment and verification checklist

Step-by-step first deployment of SIMS on the cPanel host (MariaDB 10.11, "Setup Node.js App" /
Passenger, Node 24), followed by checks of every critical flow. Tick each box as you go. Background:
[DEPLOYMENT.md](DEPLOYMENT.md), [BACKUP-RESTORE.md](BACKUP-RESTORE.md),
[MYSQL-MIGRATION-PLAN.md](MYSQL-MIGRATION-PLAN.md).

Examples use the cPanel account `flexmatr`. Replace names in angle brackets (`<…>`) with yours.

**Why a separate verification database:** the checks create fictional records. Some of them are
permanent by design (audit entries, uploaded evidence, verified recoveries), so they must not end
up in the production database. You run every check against `flexmatr_sims_verify`, then switch the
app to `flexmatr_sims` (section 8).

## 1. Databases (cPanel → MySQL Databases)

- [ ] Create database `flexmatr_sims_verify` (production `flexmatr_sims` already exists).
- [ ] Add user `flexmatr_sims_user` to **both** databases with **ALL PRIVILEGES**.
- [ ] phpMyAdmin → SQL tab, run once on the server:

  ```sql
  ALTER DATABASE `flexmatr_sims` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ALTER DATABASE `flexmatr_sims_verify` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```

## 2. Upload the code

- [ ] Choose an application root **outside** `public_html`, e.g. `/home/flexmatr/sims`.
- [ ] Upload the project **without** `node_modules`, `.next`, `.env`, `storage`, `mariadb-data*`,
      `.pgdata*`, `test-results` and `playwright-report`.
- [ ] Create the file store outside `public_html`: `mkdir -p /home/flexmatr/sims-storage`.

## 3. Create the Node.js application (cPanel → Setup Node.js App → Create application)

- [ ] Node.js version **24** (24.21 on this host); Application mode **Production**.
- [ ] Application root `sims`; Application URL your (sub)domain; Application startup file
      **`server.js`**.
- [ ] Create. At the top of the app page cPanel shows a command to enter the app's environment,
      like `source /home/flexmatr/nodevenv/sims/24/bin/activate && cd /home/flexmatr/sims`. Copy
      it: every command below runs after it (cPanel → Terminal, or SSH).

## 4. Configuration (`.env` in the application root)

Terminal commands do not see variables typed into the cPanel app screen, but both the app
(`server.js`) and the commands read `.env`, so put the settings there.

- [ ] Generate two secrets, and keep a copy in your password manager. **Losing
      `DATA_ENCRYPTION_KEY` disables every user's two-step verification.**

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # run twice
  ```

- [ ] Create `/home/flexmatr/sims/.env` and restrict it with `chmod 600 .env`:

  ```bash
  # Verification database first; section 8 switches it to flexmatr_sims.
  # 127.0.0.1, not localhost. URL-encode special characters in the password.
  DATABASE_URL="mysql://flexmatr_sims_user:<PASSWORD>@127.0.0.1:3306/flexmatr_sims_verify?connection_limit=4"
  SESSION_SECRET=<first secret>
  DATA_ENCRYPTION_KEY=<second secret>
  APP_URL=https://<your domain>
  STORAGE_DIR=/home/flexmatr/sims-storage
  DEMO_MODE=false
  # No separate worker process on cPanel: run background jobs inside the app.
  JOBS_INLINE=true
  # node unless Python 3.11+ with pandas and pdfplumber is installed on the host.
  STATEMENT_PARSER=node
  ```

  `connection_limit` is per Node process. The host allows 18 connections per database user, in
  total, across all Passenger processes, terminal commands and phpMyAdmin.

## 5. Install, migrate, build

```bash
npm ci
npx prisma generate
npx prisma migrate deploy      # 4 migrations: init, integrity_guards, job_claim_index, invoice_register_index
npm run verify-db
npm run build
```

- [ ] `prisma migrate deploy` ends with "All migrations have been successfully applied".
- [ ] `npm run verify-db` prints **All checks passed**. It checks, using the app's own connection
      setup: strict `sql_mode` and UTC on app connections, server version, all 4 migrations
      applied, **46** triggers, **14** CHECK constraints, utf8mb4 tables, no leftover purge tokens,
      and that a guard trigger actually rejects a forged purge token. It writes nothing.
- [ ] `npm run build` completes. If the host kills it (the output ends in `Killed`), stop and
      report it: building elsewhere and uploading the output has not been verified for this host.
- [ ] cPanel → Setup Node.js App → **Restart**.
- [ ] `curl -s https://<your domain>/api/health` returns `{"status":"ok"}`.

If something fails here, see Troubleshooting (section 10).

## 6. Accounts for the checks

The flows need two System Administrators (permanent deletion and maker-checker) and one Finance
Reviewer. Use fictional names; they live only in the verification database.

- [ ] Create administrator A from the command line. It prints a one-time temporary password:

  ```bash
  npm run create-admin -- --username verify.admin.a --email verify.a@example.invalid --name "Verify Admin A"
  ```

- [ ] **Sign-in flow.** Sign in as `verify.admin.a` with the temporary password. Expect: forced
      password change → two-step verification setup (mandatory for administrators in
      production; scan the QR code with an authenticator app) → dashboard. Sign out and sign in
      again: the code is now required.
- [ ] As A, **Administration → Users**: create `verify.admin.b` (System Administrator) and
      `verify.finance` (Finance Reviewer), each with a company scope. Sign in once as each to set
      their passwords; B also enrols two-step verification.

## 7. Critical flows

Each check names the database behaviour it proves.

- [ ] **Create a case** (as A): Case files → New case → save. Expect the reference
      `SIMS/<year>/0001`. Create a second case: `…/0002`.
      _Proves: reference counter (`INSERT … ON DUPLICATE KEY UPDATE`), utf8mb4 text._
- [ ] **Search** (as A): global search for a word from a case title typed in **lower case**.
      Expect the case to be found.
      _Proves: case-insensitive search without `mode: "insensitive"` (utf8mb4_unicode_ci)._
- [ ] **Upload a statement** (as A, case 1): **Statement analysis** tab → upload
      `samples/statements/fictional-mpesa-statement.csv`. Expect the status to go from Queued →
      Parsed within a minute, with transactions, pattern-flag counts and suggested links, and the
      money-movement map rendering.
      _Proves: job queue (`SKIP LOCKED`), parser, strict inserts, JSON flags (`JSON_TABLE`), the
      rewritten money-movement query._
- [ ] **Approve an expense** (maker-checker):
  1. As A: case 1 → **Costs and budget** tab → add an expense (e.g. Fuel, 1,500.00) → Submit.
  2. As A: try to approve it. Expect a refusal: you cannot approve your own request.
  3. As `verify.finance`: approve it. Expect status **Approved**.
     _Proves: row lock + READ COMMITTED + maker-checker._
- [ ] **Verify a recovery** (maker-checker and immutability):
  1. As A: case 1 → **Recoveries** tab → record a recovery with a receipt number (e.g. 500.00).
  2. As A: try to verify it. Expect a refusal (own record).
  3. As `verify.finance`: verify it. Expect status **Verified**.
  4. As A: try to edit its amount. Expect "Verified recoveries are immutable".
     _Proves: recovery guard trigger and its message mapping (409 PROTECTED_RECORD)._
- [ ] **Purge a case** (permanent deletion with the purge token):
  1. As A: Administration → Settings → set "Minimum days in the Recycle Bin before permanent
     deletion" to **0**. (Verification database only. Restore it to 30 afterwards.)
  2. As A: open case 2 (it has status history but no evidence) → change its status once → move
     it to the Recycle Bin.
  3. As A: Recycle Bin → select case 2 → Request permanent deletion (confirm your password).
  4. As A: try to approve your own request. Expect a refusal.
  5. As B: approve it (confirm your password). Expect **Executed**, and the case gone.
  6. Terminal: `npm run verify-db`. Expect "No purge tokens left behind" to pass.
  7. Administration → Audit logs: a `permanent_deletion.execute` entry exists.
     _Proves: the purge token lets one approved purge remove append-only history, and nothing
     else can._
- [ ] As A: case 1 → **Change status** once (e.g. to Preliminary review), so it has a
      status-history row for the next check.
- [ ] **Guards against direct SQL** (phpMyAdmin → `flexmatr_sims_verify` → SQL, one at a time).
      Each must fail with `#1644`. A statement that reports **"0 rows affected"** found nothing to
      change, so it proves nothing: a trigger only fires on a row. Re-check that the earlier flows
      created the rows (a case with a status change, a verified recovery).

  ```sql
  UPDATE AuditLog SET reason = 'tampered' LIMIT 1;           -- AuditLog is append-only (UPDATE blocked)
  DELETE FROM AuditLog LIMIT 1;                              -- AuditLog is append-only (DELETE blocked)
  DELETE FROM CaseStatusHistory LIMIT 1;                     -- CaseStatusHistory is append-only (DELETE blocked)
  UPDATE `Case` SET reference = 'CHANGED' LIMIT 1;           -- Case.reference is immutable
  UPDATE Recovery SET grossAmount = 1 WHERE status = 'VERIFIED' LIMIT 1;  -- Verified recoveries are immutable
  DELETE FROM `Case` WHERE id IN (SELECT caseId FROM CaseStatusHistory) LIMIT 1;  -- Case history is append-only (DELETE blocked)
  ```

- [ ] As A, Administration → Settings: set the Recycle Bin minimum back to **30**.

## 8. Switch to the production database

- [ ] In `.env`, change the database name in `DATABASE_URL` from `flexmatr_sims_verify` to
      `flexmatr_sims`.
- [ ] Run `npx prisma migrate deploy`, then `npm run verify-db` (expect **All checks passed**).
- [ ] Restart the app in cPanel, and check `/api/health` again.
- [ ] Create the real first administrator with `npm run create-admin` (real name and email), then
      sign in, change the password and enrol two-step verification.
- [ ] Optional: delete `flexmatr_sims_verify` in cPanel → MySQL Databases. Keep it if you want a
      place to try upgrades first.
- [ ] Take the first backup ([BACKUP-RESTORE.md](BACKUP-RESTORE.md)), and check that it contains
      46 `CREATE TRIGGER` lines.

## 9. Every later upgrade

1. Back up the database (`mysqldump`, see BACKUP-RESTORE) and the file store.
2. Upload the new code, then run `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`,
   `npm run verify-db` and `npm run build`.
3. Restart the app in cPanel and check `/api/health`.

## 10. Troubleshooting

| Symptom                                                 | Cause and fix                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Access denied for user …@'::1'` or `@'localhost'`      | Use host `127.0.0.1` in `DATABASE_URL`; check the user is added to that database.                                                                                  |
| `Too many connections` / `max_user_connections`         | Lower `connection_limit` (e.g. 3). Close phpMyAdmin tabs and terminal sessions on the same user.                                                                   |
| `ERROR 1419 … SUPER privilege and binary logging`       | The host turned binary logging on: triggers cannot be created. Do not run without them. Ask the host for `log_bin_trust_function_creators=1`.                      |
| `migrate deploy` fails half-way                         | MariaDB does not roll back DDL. `npx prisma migrate status` shows the failed migration. Restore the backup, or finish it by hand and `npx prisma migrate resolve`. |
| `verify-db`: "App connections use strict sql_mode" FAIL | The app is not using `createPrismaClient`; do not go live. Report it.                                                                                              |
| `verify-db`: triggers fewer than 46                     | A migration or a restore skipped triggers. Re-run `migrate deploy`, or restore from a dump that contains `CREATE TRIGGER` lines.                                   |
| App page shows 503 / "Incomplete response"              | Read `stderr.log` in the application root. `Invalid environment configuration` means a missing secret in `.env`.                                                   |
| `DEMO_MODE=true is not permitted`                       | Set `DEMO_MODE=false` in `.env`.                                                                                                                                   |
| A command finishes its work but never returns           | A script left a database pool open. Press Ctrl+C, then report the script name.                                                                                     |
