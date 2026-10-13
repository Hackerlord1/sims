# PostgreSQL → MySQL 8 migration — reconnaissance report and plan

Status: **All 7 phases complete (2026-10-07). Server-side verification is your step:
[CPANEL-VERIFICATION.md](CPANEL-VERIFICATION.md).**

### Final summary

**Cannot be preserved on MariaDB** (final list, superseding §4):

1. **Transactional DDL.** A migration that fails half-way stays half-applied. Mitigation: back up
   before every `migrate deploy`; recovery steps are in DEPLOYMENT.md.
2. **Case- and accent-sensitive equality.** Unique values and searches ignore case, accents and
   trailing spaces (`utf8mb4_unicode_ci`); "José" = "jose".
3. **Index-backed substring search.** The pg_trgm indexes are gone. Results are the same;
   invoice-number search is 440 ms and global search 517 ms p95 at 100,000 invoices (all within
   budget).

No longer losses (resolved during the phases): INSERT IGNORE (§4.4, removed in Phase 4); JSON
number precision (§4.5, MariaDB stores JSON verbatim, Phase 3); the host's empty `sql_mode` (§4.6,
the app's connections are strict, Phase 1); trigger privileges (§3.2, binary logging is off on the
host, Phase 0).

**Deviations from the brief, each recorded in its phase:**

- Target MariaDB 10.11.19 (what the host runs) instead of MySQL 8.0.30+.
- Purge token keyed by `CONNECTION_ID()`, not a transaction id.
- Two additive indexes: `Job(status, createdAt)` and `Invoice(isDeleted, archivedAt, invoiceDate)`.
- `@prisma/adapter-mariadb` with `mariadb@3.4.7` via `overrides`.
- New guards with no PostgreSQL counterpart: `case_guard_bd`, `user_audit_guard_bd`,
  `purge_token_guard_*`.
- `server.js` excluded from ESLint.
- New `npm run verify-db`.

**Open, for your decision:** the 6 e2e failures that predate the migration (dashboard contrast and
infinite pulse, Phase 6); restoring `.env` secrets from the 2026-10-03 07:10 VS Code snapshot;
formatting `server.js`; deleting the unused `.pgdata/`.

### Phase 7 results (2026-10-07)

- `docs/CPANEL-VERIFICATION.md`: the first-deployment checklist for this host.
  - Setup: separate verification database, upload, Setup Node.js App, `.env` (600), install,
    migrate, build.
  - Accounts: two administrators and a Finance Reviewer.
  - Flows, each mapped to the database behaviour it proves: sign-in with forced change and
    two-step, case references, case-insensitive search, statement upload, expense and recovery
    maker-checker with immutability, case purge with the purge token.
  - Direct-SQL guard probes; switching to production; upgrades; troubleshooting.
- `scripts/verify-database.ts` (`npm run verify-db`): read-only check through the app's own
  connection setup (strict `sql_mode` and UTC, server version, 4 migrations, 46 triggers, 14
  CHECKs, utf8mb4, no leftover purge tokens, a guard trigger rejecting a forged token).
  Verified: passes locally; with one trigger dropped on `sims_perf` it reports "45 of 46" and exits
  with code 1.
- The checklist's direct-SQL probes were run locally exactly as written. All six fail with 1644 and
  the stated messages where matching rows exist. Two found no rows in the dev database and
  "succeeded" silently, so the checklist now creates the needed rows first and warns about
  "0 rows affected".
- Tab names in the checklist come from the code (`case-workspace.tsx`): Costs and budget,
  Recoveries, Statement analysis.
- Not verified here (needs the server): the build under the host's memory limits, Passenger start,
  and the flows on the real host. That is what the checklist is for.

### Phase 6 results (2026-10-07)

| Gate                                      | Result                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| `npm run typecheck`                       | clean                                                        |
| `npm run lint`                            | clean                                                        |
| `npm run format:check`                    | only `server.js` (predates the migration; untouched)         |
| `npm run test:unit`                       | 131 / 131 (15 files)                                         |
| `npm run test:integration`                | 101 / 101 (10 files), no skips; Vitest exits normally (84 s) |
| `npm run build`                           | passes (95 s), no warnings                                   |
| `npm run test:e2e:prod` (after the build) | 3 / 3                                                        |
| `npm run test:e2e` (dev server)           | 25 / 31; the 6 failures predate the migration (see below)    |
| `npm run load-data` + `npm run perf`      | 21 / 21 scenarios and the analysis job within budget         |

- Test changes:
  - Test databases: the admin connection uses no default database; `DROP DATABASE` has no
    `FORCE`; `CREATE DATABASE … utf8mb4`.
  - `references-and-guards.test.ts`: the purge test uses PurgeToken instead of `set_config`, with
    the same three assertions plus "no token left behind". New tests: a token for another
    connection is refused; a case with history cannot be deleted outside a purge (cascade guard);
    a user referenced by the audit log cannot be deleted (SET NULL guard).
  - No test was skipped or weakened.
- Fixed:
  - **Seed hang.** The seed closed its own client but not the app client (`src/server/db.ts`) that
    the demo workflows use, so the open MariaDB pool kept Node running and Playwright's web
    server never started (timeout). `prisma/seed.ts` now closes both.
    `scripts/reparse-statements.ts` had the same pattern; it now uses the app client and closes
    it. E2E preparation: timeout → 17 s.
  - **Invoice register over budget.** It was 803 ms p50 / 845 ms p95 against a 700 ms budget:
    MariaDB scanned every visible case and sorted all their invoices to return one page. New
    additive index `Invoice(isDeleted, archivedAt, invoiceDate)` (migration
    `20261007122648_invoice_register_index`, a second deviation from "indexes as-is"): the plan
    reads it newest first and stops after the page. Now 269 ms p50 / 278 ms p95; the invoice-number
    search also improved, to 440 ms p95.
- **E2E failures that predate the migration** (6 tests in `responsive.spec.ts`, all
  UI/CSS; no database involvement):
  - 5 × color-contrast on the dashboard KPI "View records" line: `.kpi-open { opacity: 0.55 }` with
    accent-coloured 0.6 rem text gives contrast 2.93 (needs 4.5).
  - 1 × "every case-file tab … passes axe" times out in the test's `settle()` helper, which waits
    for all animations to stop: `.step-pulse` (current pathway stage) animates forever
    (`sims-pulse … infinite`), so it never stops on case pages. The screenshot shows the page fully
    rendered with database data.
  - Both styles are in `src/app/globals.css`, `ui/kpi.tsx` and `dashboard/dashboard.tsx`, saved on
    2026-09-30 21:15–21:16, after the last verified run (20:02) and before this migration. Not
    changed here (a UI fix in a database migration, and the tests must not be weakened). Options are
    for your decision.
- Not database-related, noted on the way: the first dev-mode run timed out because the
  dashboard stayed on its loading placeholders while `next dev` compiled the route on first visit.
  The dashboard service itself takes 35–48 ms on MariaDB, and with a warm compile cache all 6 auth
  tests pass. A browser-side `Cannot read properties of null (reading 'notify')` appears in the dev
  log.
- Performance compared with the PostgreSQL baseline (same dataset: 5,005 cases, 100,030 invoices,
  100,019 transactions, 200,000 audit rows). The original PostgreSQL table is **lost**: `npm run
perf` rewrites `docs/performance-results.md`, and I ran it without saving the PostgreSQL version
  first. Its summary survives in `VERIFICATION-REPORT.md`:
  - PostgreSQL: every list, search, dashboard, statement and audit endpoint p95 < 200 ms; money
    movement p95 1.1 s; 25,104-row export 2.8 s; analysis 26.6 s.
  - MariaDB (now): above 200 ms p95 are the invoice register 278 ms, invoice-number search 440 ms,
    global search 517 ms (no trigram indexes, §2.2/§4.3) and statement overview 201 ms. Money
    movement p95 1.58 s (p50 1.03 s; p95 was 1.14 s on the previous run), 25,104-row export 3.9 s,
    analysis 28.2 s. Every budget is met; substring search is the measurable cost of §4.3.
- `.env`: the file had only the three PostgreSQL lines when this migration started. VS Code's
  history shows it was saved that way from the editor on 2026-10-03 07:19 UTC, with the full set
  of variables in an earlier save that day at 07:10 UTC. So `SESSION_SECRET`,
  `DATA_ENCRYPTION_KEY` and the demo settings are missing, and `npm run dev` cannot start. The e2e
  runs used throwaway secrets passed in the environment only. Restoring the values from the
  07:10 snapshot is your decision.

### Phase 5 results (2026-10-07)

- Scripts:
  - `setup-env.mjs` and `.env.example`: `mysql://…@127.0.0.1:3307/sims?connection_limit=5`;
    `MARIADB_PORT`/`MARIADB_PASSWORD` replace the `POSTGRES_*` variables (used by Compose only).
  - `perf-env.ts`: the admin connection uses no default database (MariaDB has no `postgres`
    database).
  - `load-test-data.ts`: `DROP DATABASE IF EXISTS` (no `FORCE` in MariaDB: it waits for open
    connections), utf8mb4 `CREATE DATABASE`, `reserve()` uses the same upsert + read transaction as
    `nextSequence`, and `ANALYZE` → `ANALYZE TABLE` over `SHOW TABLES`.
  - `perf.ts` report text now says MariaDB.
- Config:
  - `docker-compose.yml`: a `mariadb:10.11` service configured like the host (empty `sql_mode`,
    binary logging off).
  - `.dockerignore` and `.prettierignore` exclude `mariadb-data`.
  - **`eslint.config.mjs` ignores `server.js`** (option A; the CommonJS Passenger entry point).
    `npm run lint` now passes.
- Docs:
  - `DEPLOYMENT.md` rewritten for cPanel and MariaDB: database creation, one-time utf8mb4
    `ALTER DATABASE`, `DATABASE_URL`, pool sizing against the 18-connection limit, a backup before
    every `migrate deploy`, recovery from a half-applied migration, and a trigger-count check
    (46).
  - `BACKUP-RESTORE.md` rewritten for `mysqldump`/`mariadb-dump`, phpMyAdmin and cPanel Backup,
    trigger checks, and stripping `DEFINER` when restoring as a different user. **The documented
    procedure was run locally:** a dump as the non-admin app user with all 46 triggers, a restore
    through the `DEFINER`-stripping pipeline into a new database, 46 triggers back, audit rows
    match, and a guard fires in the restored copy (`AuditLog is append-only`).
  - README, `FINANCIAL-CALCULATIONS.md` (`DECIMAL(18,2)` in MariaDB), `PLAN.md` (dated note;
    history kept), and `CLAUDE.md` (stack line plus a new "MariaDB rules" section with the rules
    this migration established).
  - `performance-results.md` and `VERIFICATION-REPORT.md` are marked historical (PostgreSQL),
    not rewritten.
  - `npm run docs` regenerated the role matrix, entity summary and OpenAPI. No route schema
    changed in any phase, so the API surface is unchanged.
- Gates: `typecheck` clean, `lint` clean. `format:check` flags only `server.js`, the untouched
  file that predates this migration (left as is: reformatting the production entry point is not
  part of this migration).
- Root cause of every escaping incident in Phases 3–5: commands passed through the shell tool
  collapse `\\` to `\`, so escapes written in shell heredocs or `node -e` lost one level. Anything
  that contains backslashes is now written with the file edit tools, which write text verbatim.
  A bare backtick in a template literal is a syntax error, so the clean typecheck also confirms
  no file was left damaged.
- Left for you: the old PostgreSQL data folder `.pgdata/` (and `.pgdata.log`) is still in the
  project folder, and the local PostgreSQL server may still be running from it. Neither is used
  any more. Their ignore entries are kept until you remove them.

### Phase 4 results (2026-10-07)

- `mode: "insensitive"` removed from all 14 sites in 6 files. `search.ts` and
  `resources/service.ts` passed the type checker (via `as const` and computed keys) but Prisma's
  MySQL connector would have rejected them at run time. Verified on MariaDB: `contains` is case-
  and accent-insensitive ("grace", "GRACE" and "omondi" all match "Grace Wanjiku Ömondi"), as
  §4.2 says.
- JSON lists: new `src/lib/string-array.ts` (`stringArray`) with a unit test. It throws on
  anything that isn't `string[]` instead of reading it as `[]`, so corrupted `permissionDenials`
  fail closed. Used by `principal.ts`, `admin.ts`, `bulk.ts`, `permanent-deletion.ts`,
  `imports/service.ts` and the statement export. API response shapes are unchanged.
- `flags: { has }` → `flags: { array_contains: [flag] }`. Verified: matches whole elements only
  (`ROUND_FIGURE` does not match `ROUND_FIGURE_X`).
- Required Json lists are supplied at every create site (`flags: []` for parsed and load-test
  transactions; `permissionDenials: []` in the seed, `create-admin`, and the e2e and integration
  helpers).
- `orderBy … nulls: "last"/"first"`: Prisma emulates it on MariaDB. Verified ascending and
  descending, nulls first and last. No change needed.
- `skipDuplicates` (INSERT IGNORE) removed from all 4 sites (§4.4 is no longer a loss):
  - New `src/server/services/notifications.ts` (`createNotifications`) skips only rows whose
    `(userId, dedupeKey)` exists or repeats in the batch, then inserts strictly; used by
    reminders, access requests and change requests.
  - Link suggestions skip only keys of already-reviewed links, then insert strictly.
  - Verified: duplicates skipped; an overlong value is rejected instead of silently dropped.
  - Remaining race: two reminder sweeps running at the same moment could both pass the
    duplicate check, and the second insert then fails with a unique-key error (P2002). The job is
    retried and the check then skips the rows. Nothing is lost or duplicated; the previous
    behaviour was a silent skip.
- Parser caps (`src/lib/statements/normalize.ts`, used by every parser including Python):
  `reference` and `counterpartyName` 300, `counterpartyPhone`, `counterpartyAccount` and
  `txnTime` 191, `description` 1,000 as before. Unit test added.
- `statementHeader`'s JSON path was fixed in Phase 3 (see there).
- Gates: `npm run typecheck` clean (from 33 errors); `npm run test:unit` 131/131 in 15 files;
  `npm run lint` fails **only** in `server.js` (CommonJS `require()` in the cPanel entry point,
  last changed 2026-10-02, before this migration). That failure was there before the migration,
  so it was left untouched pending a decision.
- Process notes: edits now go through a slice-based helper that checks each target occurs once
  and interprets no `$` patterns. Passing escapes through `node -e` turned `\u0000` into literal NUL
  bytes in `statements/service.ts`; the line was replaced (now `JSON.stringify` keys) and every
  source file was scanned: no NUL bytes remain.

### Phase 3 results (2026-10-07)

- `references.ts`: `INSERT … ON DUPLICATE KEY UPDATE` + `SELECT` in one transaction; with the
  bare client it wraps itself in one. Verified: 1,2,3 sequential; 20 concurrent allocations
  distinct and contiguous; a rolled-back allocation leaves no gap.
- `jobs/queue.ts`: `SELECT … ORDER BY createdAt LIMIT 1 FOR UPDATE SKIP LOCKED`, then
  `job.update`, in one transaction; `UTC_TIMESTAMP(3)` instead of `now()`.
  **Found:** InnoDB locks every row it reads before a filesort, so with only the
  `(status, runAfter)` index the first worker locked all queued jobs and concurrent workers
  skipped them all (1 of 5 claimed). **Fix (additive deviation from "indexes as-is"):** new index
  `Job(status, createdAt)`, migration `20261007084943_job_claim_index`. The plan now reads that
  index with no sort. Verified: 10 workers drained 300 jobs with 300 distinct claims, none
  double-claimed, none left; a job with `runAfter` in the future is not claimed.
- Locks: `lockRow` uses `?` and a `LockedTable` union of literal table names (never input);
  `Case` locks use backticks. Re-audit of **17** locking flows (13 finance, 4 case; the earlier
  count of 14 was wrong): in every one the `FOR UPDATE` is the transaction's first statement and
  all state and maker-checker reads follow it. Only `verifyRecovery` takes two locks, always
  Recovery then Case, so lock ordering cannot deadlock. Verified: two approvers deciding one
  expense at once give exactly one decision and one `409 INVALID_TRANSITION`; self-approval gives
  `MAKER_CHECKER`.
- Isolation: `createPrismaClient` sets `transactionOptions.isolationLevel = "ReadCommitted"` for
  every client. The adapter issues `SET TRANSACTION ISOLATION LEVEL` before `BEGIN`. Verified by
  behaviour (a transaction sees another connection's commit on its second read), because MariaDB
  has no variable showing the current transaction's level.
- `permanent-deletion.ts`: `set_config` is replaced by a PurgeToken insert; the token is deleted
  after the case row, before commit, and the purge throws (rolls back) if exactly one token was
  not removed. Verified through the real `requestDeletion` → `decideDeletion`: requester
  self-approval refused; purge `EXECUTED`; case and history gone; no token left; audit row
  written.
- `statements/service.ts`: `unnest` → `JSON_TABLE`; `LATERAL` → `ROW_NUMBER()` over confirmed
  links (`reviewedAt IS NULL, reviewedAt, id`, the same order plus a deterministic tie-break);
  casts → `CAST(… AS CHAR)` for sums and `CAST(? AS DECIMAL(18,2))` for the minimum amount (exact,
  not a float comparison); `to_char` → `DATE_FORMAT`; `ANY` → `IN (Prisma.join)` with an
  empty-list short-circuit; BigInt counts and 0/1 booleans normalised. The JSON path filter
  (`"$.statementId"`) was fixed here rather than in Phase 4 because it broke the same function.
  Verified: flag counts; earliest confirmed link chosen; exact sums up to 999,999,999,999.99;
  UTC-day timeline; min-amount filter; a case with no statements.
- JSON numbers (§4.5): audit `before`/`after` store Decimals as strings (`audit.ts`); change-request
  payloads hold validated money as strings (`moneySchema` → `toDbString`) and the preview stringifies
  Decimals. MariaDB's JSON is `LONGTEXT` stored verbatim, so even a JSON number round-trips
  exactly; only JSON _functions_ compute in doubles, and none is used on money. §4.5 is
  therefore **not a loss on MariaDB**.
- Process note: while editing `statements/service.ts` a `String.replace` call treated `$'` in the
  replacement SQL as "rest of the file" and duplicated the file's tail. The file was rebuilt from
  verified parts (the two tail copies differed only in the intended block). Later SQL edits use
  verbatim heredocs, not JS string replacement.

### Phase 2 results (2026-10-07)

- `prisma/migrations/20261007082645_integrity_guards/migration.sql`: 46 triggers and 14 CHECK
  constraints, applied to local MariaDB.
  - Prisma's MySQL engine accepts multi-statement `BEGIN … END` trigger bodies without
    `DELIMITER` (verified before writing the guards).
  - One trigger per table and event. Where PostgreSQL had several guards on the same table and
    event, the checks are folded into one body in PostgreSQL's firing order (alphabetical by
    trigger name), so the first reported error is unchanged.
  - Messages are word-for-word identical. Nothing is `// WEAKENED:`.
  - New guards: `case_guard_bd` (a case with history can only be deleted under its purge token,
    replacing the cascade-fired history triggers), `user_audit_guard_bd` (replacing the SET NULL
    cascade onto the append-only audit log), and `purge_token_guard_bi/bu/bd` (a connection can
    only issue and remove its own tokens).
- Hand probe through the app's own client (strict adapter connection): **80 checks, 80 passed.**
  It covers every guard's blocked and allowed paths, purge with a token (explicit and cascaded
  history delete), a token for another case, a token for another connection, no tokens left
  behind, and all 14 CHECKs. The probe is kept outside the repo and becomes the basis of the
  Phase 6 integration tests.
- `src/server/api/errors.ts`: guard messages are now extracted from MariaDB's error 1644 (the
  trigger `SIGNAL`), either from `meta` (P2010, raw queries) or from the `MysqlError { code: 1644,
message: "…" }` text (model queries). Only messages that come from a trigger and match the known
  guard phrases are shown. Verified: model update, delete inside a transaction, and raw update all
  map to `409 PROTECTED_RECORD` with the trigger's message. CHECK violations and over-long values
  still map to the generic 500, as before. The PostgreSQL `ERROR:` pattern is removed.
- **Driver version corrected to `mariadb@3.4.7`.** 3.5.x removed the `dataTypeFormat` column
  property the adapter uses to recognise JSON columns, so under 3.5.4 every `Json` column read
  back as bytes (P2023 on the first `User` read). 3.4.7 keeps the property, is outside the
  vulnerable 3.4.0–3.4.5 range, and `npm audit` no longer flags it. Strict mode and UTC were
  re-verified on 3.4.7.
- **New behaviour to keep in mind:** the `mariadb` pool keeps Node's event loop alive. A script
  that exits without `prisma.$disconnect()` now hangs (verified: 30 s timeout without, 1 s exit
  with). Every script and the seed already disconnect or call `process.exit`. Vitest files
  (`helpers.ts`, `http.ts`, `storage.test.ts`) are checked in Phase 6.

### Phase 1 addendum: strict mode via the MariaDB driver adapter (option A, approved)

- `@prisma/adapter-mariadb@6.19.3`, pinned exactly. Driver adapters are GA in Prisma 6.19, so no
  preview flag is needed. The adapter pins `mariadb@3.4.5`, which `npm audit` flags with three
  high advisories (GHSA-cqhc-2h57-wpxf, GHSA-42r5-vhpq-m858, GHSA-g5xc-5w98-jfvm; 3.4.0–3.4.5
  only). `package.json` `overrides` moved the driver to 3.5.4 at first, then to **3.4.7** in
  Phase 2 (see above).
- `src/server/prisma-client.ts` (`createPrismaClient`, `mariadbAdapter`) is now the only place a
  `PrismaClient` is constructed: app (`db.ts`), instrumentation, seed, scripts and tests. Each new
  pooled connection runs `SET SESSION sql_mode = 'STRICT_TRANS_TABLES,STRICT_ALL_TABLES,
ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'` and `SET SESSION
time_zone = '+00:00'`. Pool size comes from `connection_limit` in `DATABASE_URL` (default 5).
- Verified against local MariaDB (empty server `sql_mode`, UTC+3 system zone): a 192-char value
  into `VARCHAR(191)` is **rejected** (previously truncated); the session time zone is UTC
  (`NOW()` = JS UTC clock); `CONNECTION_ID()` is constant within an interactive transaction, as
  the purge token requires.
- `next.config.ts` adds `@prisma/adapter-mariadb` and `mariadb` to `serverExternalPackages`. The
  build is verified in Phase 6, since `next build` typechecks and the 34 expected errors remain.
- Not covered: `prisma migrate deploy` uses Prisma's own engine, not the adapter, so migrations
  run under the server's empty `sql_mode`. That is harmless for DDL. MariaDB triggers keep the
  `sql_mode` in force when they were created, and the guard bodies only `SIGNAL`, so they write
  nothing a strict mode would affect.

### Phase 1 results (2026-10-07)

- `schema.prisma`: provider `mysql`. The 5 `String[]` fields become `Json` NOT NULL with no DB
  default (create sites must supply them). The 6 trigram indexes are removed; the B-tree indexes
  stay. `PurgeToken(caseId, connectionId BIGINT UNSIGNED)` is added.
- Column sizing, generated from the registry by rule and checked against route Zod limits:
  registry `text` → `VARCHAR(max)` (117 × 300, 3 × 3, 4 × 254 emails); registry `textarea` →
  `MEDIUMTEXT` (20,000 chars > 16,383) or `TEXT` (≤ 2,000); non-registry free text (reasons,
  comments, messages, notes; limits 1,000–5,000) → `TEXT`; closure summary, reopening information
  and parse message → `MEDIUMTEXT`; `passwordHash` 255; `userAgent` 300 (the code slices it to
  300); ids, FKs, hashes and codes keep `VARCHAR(191)`. Largest index: two `VARCHAR(300)` columns,
  2,400 bytes, under InnoDB's 3,072.
- `prisma/migrations/` replaced by `20261007074748_init` (1,832 lines), applied to local MariaDB.
  All 57 tables are `utf8mb4_unicode_ci`. `Json` columns are `LONGTEXT` + `json_valid` CHECK. No
  Postgres syntax remains. The Postgres schema and migrations are kept in the session scratchpad
  only (not in the repo).
- Parser fields with no length cap: `StatementTransaction.reference`, `counterpartyName` (300),
  `counterpartyPhone`, `counterpartyAccount`, `txnTime` (191). Phase 4 adds explicit caps in
  `src/lib/statements/normalize.ts`.
- **Strict mode test: Prisma's connections inherit the server's empty `sql_mode`.** A 192-char
  value into a `VARCHAR(191)` column was stored truncated to 191 with no error. Options:
  - **A (recommended): `@prisma/adapter-mariadb@6.19.3`** (official, `mariadb` driver 3.4.5).
    The pool runs `SET SESSION sql_mode='STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'`
    on every new connection, so over-long or invalid values fail the statement, as on Postgres.
    Costs: two new dependencies; `src/server/db.ts` and every `new PrismaClient()` in scripts and
    tests construct the client through the adapter; queries run through the JS driver instead of
    the Rust engine's own MySQL driver, so raw-query result typing must be rechecked in Phase 3.
  - **B: column sizing alone.** Valid input already fits every column, and parser fields get
    caps, but any path that misses a cap truncates silently. That needs a `// WEAKENED:` marker
    and an entry in §4.
- `tsc` reports 34 errors after the schema change, all expected (Json typing of the former arrays,
  `mode: "insensitive"`, required Json fields in create calls). They are fixed in Phases 3–4.

Decisions (approved 2026-10-07): all §5 recommendations. For §5.5, `skipDuplicates` is replaced by
pre-filter + strict insert. Existing data does not need to be preserved.

## Revision after Phase 0: the target is MariaDB 10.11.19, not MySQL 8

The production probe (phpMyAdmin, 2026-10-07) showed the host runs **10.11.19-MariaDB-cll-lve**.
This revision overrides the rest of the document wherever they conflict. The MySQL 8 sections
below are kept for the reasoning; §2–§4 get rewritten in place as each phase lands.

| Production setting       | Value               | Consequence                                                                                                                                               |
| ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `log_bin`                | 0                   | **The §3.2 blocker is gone.** Triggers can be created without SUPER (verified on the host as `flexmatr`, and locally as a user without global privileges) |
| `sql_mode`               | empty (non-strict)  | **New risk, see below**                                                                                                                                   |
| `collation_server`       | `latin1_swedish_ci` | Prisma writes `utf8mb4` explicitly on every table. At deploy, run `ALTER DATABASE … CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` once (Phase 7)      |
| `max_user_connections`   | 18                  | `connection_limit` in `DATABASE_URL` sized for the Passenger process count (about 5 per process)                                                          |
| `lower_case_table_names` | 0                   | Table names are case-sensitive on the host. Local uses 2 (Windows)                                                                                        |
| `time_zone`              | SYSTEM              | Raw SQL uses `UTC_TIMESTAMP(3)`, never `NOW()` (§2.4)                                                                                                     |
| `binlog_format`          | MIXED (logging off) | READ COMMITTED isolation is allowed (§3.4)                                                                                                                |

Changes to the plan:

- **`LATERAL` does not exist in MariaDB.** The money-movement query uses a correlated subquery for
  the first confirmed link (§2.4 fallback).
- **Collation:** `utf8mb4_unicode_ci` (Prisma's MySQL-connector default) replaces
  `utf8mb4_0900_ai_ci`, which MariaDB 10.11 lacks. It is case- and accent-insensitive and
  **PAD SPACE** (`'abc' = 'abc '`), which adds to §4.2: unique values that differ only in trailing
  spaces collide. Inputs are already `.trim()`med by Zod for usernames and emails. Phase 1 checks
  every other unique text field.
- **JSON** is a `LONGTEXT` alias with a `JSON_VALID` CHECK. `JSON_TABLE`, `JSON_LENGTH` and
  `JSON_CONTAINS` exist (`JSON_TABLE` since 10.6). Phase 4 verifies that Prisma's Json filters work
  on MariaDB.
- **Unchanged on MariaDB 10.11:** `SKIP LOCKED` (10.6+), enforced CHECK constraints, multiple
  triggers per event, `SIGNAL`, `<=>`, `CONNECTION_ID()`, `LAST_INSERT_ID(expr)`, window
  functions, `DATE_FORMAT`, `UTC_TIMESTAMP`. FK cascades still do not fire triggers, so §3.1
  still applies.
- **New risk: non-strict `sql_mode`.** Over-long strings are silently truncated instead of
  rejected, and invalid values coerced. CHECK constraints are still enforced. Mitigations:
  (1) every column is sized ≥ its Zod maximum (Phase 1); (2) Phase 1 tests whether Prisma's
  connector sets a strict `sql_mode` on its own connections. If it does not, there are two options
  for your decision: a Prisma MariaDB driver adapter that runs `SET SESSION sql_mode =
'STRICT_TRANS_TABLES,…'` on every new connection, or (1) alone with a `// WEAKENED:` marker.
  (Changing the session's `sql_mode` needs no privilege; changing the server default is the host's.)

### Phase 0 results

- Local instance: `npm run db:local:*` manages MariaDB 10.11.19 (`~/mariadb1011`, SHA-256 checked
  against MariaDB's published sums) in `mariadb-data/` on port 3307. It mirrors the host: binary
  logging off, empty `sql_mode`, latin1 server default, `max_user_connections=18`, and an app user
  with no global privileges. Verified: as that user, a `BEGIN … END` trigger is created and its
  `SIGNAL` blocks a delete with `ERROR 1644 (45000)`.
- The local datadir must not start with a dot. MySQL 8.0 on Windows could not restart from one
  (`Can't create UNDO tablespace … already exists`), so the name avoids the dot for both engines.
- The earlier MySQL 8.0.46 trial (which hit `ERROR 1419` with binary logging on) has been removed.
  Target: MySQL 8.0.30+ (InnoDB, `utf8mb4_0900_ai_ci`). MariaDB is **not** a target: it lacks parts
  of what this plan relies on (`JSON_TABLE` before 10.6, a real JSON type, `SKIP LOCKED` before 10.6,
  the same CHECK and trigger semantics).

## 0. What was examined

- `prisma/schema.prisma` (2,380 lines, 61 models, 63 enums) read in full.
- All 9 migrations read. The baseline (2,183 lines) is pure Prisma-generated DDL: tables, enums,
  indexes, FKs, with no triggers, checks or extensions. Everything hand-written lives in
  `integrity_guards`, `case_purge_guard` and `import_file_and_search_indexes`. The other five are
  ordinary Prisma diffs.
- The whole tree (excluding `node_modules`, `.next`, `.pgdata`) was grepped for every pattern in the
  brief, plus several the brief did not list (see §2.4).
- **MySQL version could not be confirmed.** No `mysql` client on this machine and no route to the
  host from here. Assumed 8.0.30+; Phase 0 confirms it.

## 1. Files that will change

### Schema and migrations

| File                                    | Change                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                  | provider, 5 array fields, 6 trigram indexes, text-column sizing (§2.5), `PurgeToken` model |
| `prisma/migrations/**`                  | deleted; new `init` + hand-written `integrity_guards` migration                            |
| `prisma/migrations/migration_lock.toml` | regenerated (`provider = "mysql"`)                                                         |

### Raw SQL (every `$queryRaw*` / `$executeRaw*` in the repo)

| File:line                                               | Postgres construct                                                                          | Needs                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| `src/server/references.ts:33`                           | `INSERT … ON CONFLICT … RETURNING`, `now()`, `"…"` quoting                                  | rewrite (not in brief)           |
| `src/server/jobs/queue.ts:14`                           | `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *`, `now()`                | rewrite (not in brief)           |
| `src/server/services/case-workflow.ts:16`               | `"Case"` quoting                                                                            | backticks                        |
| `src/server/services/finance-workflow.ts:18`            | `$queryRawUnsafe` with `$1`, `"${table}"`                                                   | `?`, backticks, table allow-list |
| `src/server/services/finance-workflow.ts:263`           | `"Case"` quoting                                                                            | backticks                        |
| `src/server/services/permanent-deletion.ts:183`         | `set_config('sims.purge_case', …)`                                                          | purge token (§3.3)               |
| `src/server/statements/service.ts:287`                  | `unnest(flags)`                                                                             | `JSON_TABLE`                     |
| `src/server/statements/service.ts:577`                  | `::text`, `::int`, `::numeric`, `cardinality()`, `LEFT JOIN LATERAL`, `NULLS LAST`, `ANY()` | rewrite                          |
| `src/server/statements/service.ts:609`                  | `to_char`, casts, `ANY()`                                                                   | rewrite                          |
| `src/app/api/health/route.ts:7`                         | `SELECT 1`                                                                                  | **no change**                    |
| `scripts/load-test-data.ts:87,88,126,320`               | `DROP DATABASE … WITH (FORCE)`, `ON CONFLICT … RETURNING`, `ANALYZE`                        | rewrite                          |
| `tests/integration/global-setup.ts:13`                  | `DROP DATABASE … WITH (FORCE)`                                                              | rewrite                          |
| `tests/e2e-prod/prepare.ts:16`                          | `DROP DATABASE … WITH (FORCE)`                                                              | rewrite                          |
| `tests/integration/references-and-guards.test.ts:47,52` | `set_config`                                                                                | purge token                      |

### Array fields, Prisma filters and `mode: "insensitive"`

| File                                                                                                            | What                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/server/statements/service.ts`                                                                              | `flags: { has }` (327), `mode: "insensitive"` ×3 (333–335), JSON path filter `path: ["statementId"]` (291, which becomes `"$.statementId"` on MySQL; not in brief), `flags` write (261) and read (556) |
| `src/server/services/search.ts:26`                                                                              | `mode: "insensitive"` helper                                                                                                                                                                           |
| `src/server/resources/service.ts:117`                                                                           | `mode: "insensitive"`; `nulls: "last"` sort (134), to verify on MySQL                                                                                                                                  |
| `src/server/api/modules/admin.ts`                                                                               | `mode` ×3; `permissionDenials` read/sort (82, 90)                                                                                                                                                      |
| `src/server/api/modules/audit.ts`                                                                               | `mode` ×4                                                                                                                                                                                              |
| `src/server/api/modules/options.ts`                                                                             | `mode` ×2                                                                                                                                                                                              |
| `src/server/services/dashboard.ts:62,75`                                                                        | `nulls: "last"`, to verify on MySQL                                                                                                                                                                    |
| `src/server/auth/principal.ts:40`, `src/server/services/users.ts`, `src/server/services/access-requests.ts:146` | `permissionDenials` typed `string[]` → Json narrowing                                                                                                                                                  |
| `src/server/services/bulk.ts`                                                                                   | `recordIds`                                                                                                                                                                                            |
| `src/server/services/permanent-deletion.ts`                                                                     | `entityIds`                                                                                                                                                                                            |
| `src/server/imports/service.ts:661`                                                                             | `ImportRow.errors`                                                                                                                                                                                     |

### Application code (non-SQL)

| File                          | Why                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/server/db.ts`            | default transaction isolation (§3.4)                                                                    |
| `src/server/api/errors.ts:59` | extracts trigger messages from Postgres error text; MySQL `SIGNAL` text arrives in a different envelope |
| `src/server/env.ts`           | optional: reject non-`mysql://` URLs                                                                    |
| `prisma/seed.ts`              | no Postgres-specific code found. Changes only if Json fields lose their DB default (§2.1)               |

### Scripts, config, tests

`scripts/db-local.mjs` (drives `pg_ctl`), `scripts/setup-env.mjs`, `scripts/perf-env.ts` and
`tests/integration/test-db.ts` (admin DB `/postgres`), `docker-compose.yml` (postgres:17 service),
`.env.example`.

### Docs

`README.md`, `docs/DEPLOYMENT.md`, `docs/BACKUP-RESTORE.md`, `docs/FINANCIAL-CALCULATIONS.md:11`
(`numeric(18,2) in PostgreSQL`), `CLAUDE.md` (stack line and the "PostgreSQL allows 32,767" rule),
`PLAN.md`, `docs/entities.md` (regenerated by `npm run docs`). `docs/performance-results.md` and
`docs/VERIFICATION-REPORT.md` are historical Postgres results; I would mark them as such rather than
rewrite them. Comment in `src/server/rate-limit.ts:4`.

## 2. Postgres features → MySQL replacements and trade-offs

### 2.1 Array fields (`String[]`): consumer audit and decision

| Field                        | Consumers                                                                                                     | DB-side filtering?                                                                         | Decision               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| `User.permissionDenials`     | admin UI, `admin.ts`, `principal.ts`, `users.ts`, tests                                                       | none; read and written whole                                                               | **Json**               |
| `BulkActionBatch.recordIds`  | `bulk.ts` (write, iterate, `.length`)                                                                         | none                                                                                       | **Json**               |
| `DeletionRequest.entityIds`  | `permanent-deletion.ts`, admin UI                                                                             | none                                                                                       | **Json**               |
| `ImportRow.errors`           | `imports/service.ts`                                                                                          | none                                                                                       | **Json**               |
| `StatementTransaction.flags` | write per flag-combination (`updateMany`), `has` filter, `unnest` count, `cardinality` count, display, export | yes, always scoped to one statement (or one case's statements) via the `statementId` index | **Json** (recommended) |

For `flags` I considered three options:

- **A. Json (recommended).** `has` → `array_contains`; `unnest` → `JSON_TABLE`; `cardinality` →
  `JSON_LENGTH`. Every query is already narrowed by the `statementId` index, so the JSON predicate
  only scans one statement's rows. `analyseCase` keeps its "one `updateMany` per flag combination"
  write, which matters at the volumes in `load-test-data.ts`.
- **B. Join table** `StatementTransactionFlag(transactionId, flag)`. Indexed and relational, but
  re-analysis would delete and re-insert up to hundreds of thousands of rows per case instead of a
  handful of `updateMany`s, and every read would need mapping back to `string[]`.
- **C. Json plus a MySQL multi-valued index** (`CAST(flags AS CHAR(32) ARRAY)`). Prisma cannot
  express it, so it would live only in SQL and the next `migrate dev` would see drift. Rejected.

API response shapes do not change (still `string[]`), but Prisma types these columns as `JsonValue`,
so each consumer gets a small typed accessor.

**To verify in Phase 1:** Prisma's MySQL connector does not accept `@default("[]")` on `Json` (MySQL
only allows expression defaults on JSON). The plan is `Json` NOT NULL with no DB default, with every
create site supplying the value; TypeScript flags any site that doesn't. The alternative, `Json?`
with null read as `[]`, gives up the NOT NULL guarantee, so I don't recommend it.

### 2.2 Trigram GIN indexes (6)

`case_title_trgm`, `case_reference_trgm`, `party_name_trgm`, `invoice_customer_trgm`,
`invoice_number_trgm`, `txn_counterparty_trgm`.

The application never uses Postgres full-text search. It uses `contains` (`ILIKE '%q%'`), and the
trigram indexes only speed that up. On MySQL, `contains` becomes `LIKE '%q%'`, which **no MySQL
index can serve**. `@@fulltext` does not help unless the queries change to `MATCH … AGAINST`, and
that changes the results: word-based matching, a minimum token length, and stop-words, so a search
for `2026/00` would no longer find `SIMS/2026/0012`.

| Index          | Recommendation                                                                                                                          | Trade-off                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all 6          | **Remove.** Keep `contains` semantics. Keep the existing B-tree indexes (`Party.name`, `Invoice.customerName`, `Invoice.invoiceNumber`) | Same results; substring search becomes a scan. `txn_counterparty` is unaffected in practice (queries are scoped by `statementId`). Case, party and invoice global search scan their tables. Measure in Phase 6 with `npm run perf` |
| optional later | FULLTEXT `WITH PARSER ngram` + `MATCH … AGAINST (… IN BOOLEAN MODE)`                                                                    | Closest MySQL analogue to trigram substring search, but needs raw SQL, can't be declared in Prisma (drift), and depends on the server's `ngram_token_size`. Only worth doing if the perf numbers require it                        |

### 2.3 Integrity guards (PL/pgSQL → MySQL triggers)

| Guard                                                                                                                           | MySQL port                                                                     | Notes                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Append-only ×8 (`AuditLog`, `EvidenceAccess`, `CustodyEvent`, `EvidenceVersion`, `ManagementDecision`, case history ×3)         | `BEFORE UPDATE` + `BEFORE DELETE` trigger each, `SIGNAL SQLSTATE '45000'`      | MySQL has no `UPDATE OR DELETE` and no `TG_OP`/`TG_TABLE_NAME`, so 2 triggers per table with literal messages. Message text kept identical so `errors.ts` and tests still match |
| Reference immutability ×13                                                                                                      | `BEFORE UPDATE`, `NOT (NEW.reference <=> OLD.reference)`                       | direct                                                                                                                                                                          |
| Stored file, evidence, financial statement, party statement, recovery, court event, criminal milestone, report, case legal hold | split into `BEFORE UPDATE` / `BEFORE DELETE`                                   | `IS DISTINCT FROM` → `NOT (a <=> b)`. `<>` on NOT NULL columns kept as is                                                                                                       |
| 14 CHECK constraints incl. `case_period_order`                                                                                  | verbatim (backtick quoting)                                                    | Compatible. MySQL rejects CHECKs on columns used by FK referential actions; none of these touch FK columns. No `// WEAKENED:` expected                                          |
| Case purge exception                                                                                                            | purge-token table (§3.3)                                                       |                                                                                                                                                                                 |
| **New: `Case BEFORE DELETE` purge check**                                                                                       | blocks deleting a case that still has history rows unless a purge token exists | compensates for §3.1                                                                                                                                                            |
| **New: `User BEFORE DELETE`**                                                                                                   | blocks deleting a user referenced by `AuditLog`                                | compensates for §3.1                                                                                                                                                            |

### 2.4 Raw-SQL constructs

| Postgres                                                             | MySQL                                                                                                                                 | Trade-off / note                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"Identifier"` quoting                                               | backticks                                                                                                                             | `Case` and `key` are reserved words in MySQL                                                                                                                                                                |
| `$queryRawUnsafe(…$1…)`                                              | `?` placeholders; table names from a fixed allow-list                                                                                 | Prisma 6's MySQL connector is Prisma's own Rust driver, not mysql2. Placeholders are still `?`                                                                                                              |
| `INSERT … ON CONFLICT DO UPDATE … RETURNING value` (counters)        | `INSERT … VALUES (?, LAST_INSERT_ID(1), …) ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)`, then `SELECT LAST_INSERT_ID()` | Same row-lock serialisation. Both statements must run on one connection, so `nextSequence` wraps itself in a transaction when given the bare client (e.g. `requestDeletion` calls it outside a transaction) |
| `UPDATE … (SELECT … FOR UPDATE SKIP LOCKED) RETURNING *` (job claim) | in a transaction: `SELECT id … ORDER BY createdAt LIMIT 1 FOR UPDATE SKIP LOCKED`; `UPDATE`; re-read through Prisma                   | `SKIP LOCKED` exists since 8.0.1. Multi-worker safety is preserved                                                                                                                                          |
| `now()` in raw SQL                                                   | `UTC_TIMESTAMP(3)`                                                                                                                    | **Not cosmetic.** Prisma stores UTC; MySQL `NOW()` uses the server's time zone, which on a shared host is often not UTC. Job `runAfter` comparisons would be off by hours                                   |
| `unnest(flags)`                                                      | `JSON_TABLE(t.flags, '$[*]' COLUMNS (flag VARCHAR(32) PATH '$'))`                                                                     |                                                                                                                                                                                                             |
| `cardinality(flags) > 0`                                             | `JSON_LENGTH(t.flags) > 0`                                                                                                            |                                                                                                                                                                                                             |
| `= ANY(${ids})`                                                      | `IN (${Prisma.join(ids)})`                                                                                                            | `Prisma.join([])` throws, so an empty id list must short-circuit (Postgres returned no rows)                                                                                                                |
| `LEFT JOIN LATERAL (…) ON true`                                      | MySQL 8.0.14+ supports `LATERAL`, so it can stay                                                                                      | Recommend keeping it (fewest semantic changes). Fallback: correlated subquery                                                                                                                               |
| `ORDER BY "reviewedAt" ASC NULLS LAST`                               | `ORDER BY reviewedAt IS NULL, reviewedAt`                                                                                             | MySQL sorts NULLs first by default                                                                                                                                                                          |
| `::text` / `::int` / `::numeric`                                     | `CAST(… AS CHAR)`, `CAST(… AS DECIMAL(18,2))`; `minAmount IS NULL` branch built with `Prisma.sql` / `Prisma.empty`                    | Result typing differs: MySQL returns `COUNT`/`SUM` as `bigint`/`Decimal` and booleans (`debit > 0`) as `1`/`0`. Each result gets normalised in JS                                                           |
| `to_char(d,'YYYY-MM-DD')`                                            | `DATE_FORMAT(d, '%Y-%m-%d')`                                                                                                          |                                                                                                                                                                                                             |
| `DROP DATABASE … WITH (FORCE)`                                       | `DROP DATABASE IF EXISTS`                                                                                                             | No FORCE. Blocks if another session holds the DB, so stop `next dev` first (already a project rule)                                                                                                         |
| `ANALYZE`                                                            | `ANALYZE TABLE <each table>`                                                                                                          |                                                                                                                                                                                                             |
| admin DB `/postgres`                                                 | connect to `/mysql` (or no database)                                                                                                  |                                                                                                                                                                                                             |
| `CREATE EXTENSION pg_trgm`                                           | deleted                                                                                                                               |                                                                                                                                                                                                             |
| JSON filter `path: ["statementId"]`                                  | `path: "$.statementId"`                                                                                                               |                                                                                                                                                                                                             |

### 2.5 Schema issues the brief did not list

1. **`String` becomes `VARCHAR(191)` on MySQL.** Postgres `TEXT` is unbounded. Many fields accept far
   more: Zod limits of 1,000, 2,000, 5,000, 20,000 and 100,000 chars appear in the registry and
   modules. Without changes, long descriptions, allegations, findings, notes, statement summaries,
   `Job.lastError` (1,000), `Session.userAgent` and many more would fail or be truncated. Plan: every
   free-text field becomes `@db.Text` (or `@db.MediumText` above 65,535 bytes). Identifier,
   reference, enum-like and indexed fields stay `VARCHAR(191)`. Each size is checked against its Zod
   maximum. This is a necessary deviation from "keep all other fields as-is" and I'll list it field
   by field in Phase 1.
2. **Case- and accent-insensitive collation** (`utf8mb4_0900_ai_ci`): see §4.2.
3. **`skipDuplicates` → `INSERT IGNORE`** (`access-requests.ts:100`, `change-requests.ts:87`,
   `reminders.ts:181`, `statements/service.ts:266`). `IGNORE` also downgrades CHECK violations and
   over-long values to warnings and silently drops or truncates the row. See §4.4.
4. **`orderBy … nulls: "last"`** (`resources/service.ts:134`, `dashboard.ts:62,75`). I need to
   confirm in Phase 4 that Prisma emulates this on MySQL. If it doesn't, the sort changes (MySQL puts
   NULLs first).
5. **Windows dev and `lower_case_table_names`.** On Windows, MySQL lower-cases table names by default
   (`=1`), which makes Prisma report drift on PascalCase tables. The local dev instance must be
   initialised with `lower_case_table_names=2`. That can only be set at initialisation.

## 3. Guarantees that change shape but can be preserved

### 3.1 FK cascades do not fire MySQL triggers (not in brief)

MySQL documents that cascaded foreign-key actions **do not activate triggers**. Two existing
guarantees depend on cascades that Postgres does fire triggers for:

- `Case → CaseStatusHistory / CaseClosure / CaseReopening` are `ON DELETE CASCADE`. In Postgres,
  deleting a case outside a purge is blocked by the history triggers. In MySQL the cascade would
  **silently erase case history**.
- `User → AuditLog.actorId` is `ON DELETE SET NULL`. In Postgres, deleting a user who has audit rows
  is blocked, because the SET NULL is an UPDATE on `AuditLog`. In MySQL it would **silently rewrite
  the audit log**.

Preserved by the two new triggers in §2.3, which check before the parent row is deleted. The FK
definitions stay as they are.

### 3.2 Trigger creation privilege (possible blocker)

On MySQL with binary logging on and `log_bin_trust_function_creators = 0`, `CREATE TRIGGER` can fail
for non-SUPER users with error 1419. That is common on cPanel. If the host refuses triggers,
**every database-level guard in this document is lost** and only the application checks remain.
That would be a major weakening, so Phase 0 tests it on the real server before any work starts. If
it fails, I stop and report.

A related check: whether Prisma `migrate deploy` accepts `BEGIN … END` trigger bodies without a
`DELIMITER` directive (the server parses them; `DELIMITER` is a CLI-only construct). Phase 2
verifies this on local MySQL before writing all of them. If needed, each guard can be written as a
single-statement `IF … END IF` body.

### 3.3 Case purge exception: purge-token design (one deviation from the brief)

The brief asks for a token keyed by (case id, **transaction id**). MySQL has no trigger-readable
transaction id an unprivileged user can get: `information_schema.INNODB_TRX` needs `PROCESS`, and
InnoDB only assigns a real id at the first write. I propose keying by **`CONNECTION_ID()`**:

```
PurgeToken(caseId VARCHAR(191), connectionId BIGINT UNSIGNED, createdAt DATETIME(3),
           PRIMARY KEY (caseId, connectionId))
```

1. The purge transaction inserts `(caseId, CONNECTION_ID())`. A Prisma interactive transaction
   holds one connection throughout, so every later statement in it has the same `CONNECTION_ID()`.
2. The history `BEFORE DELETE` triggers and the new `Case BEFORE DELETE` trigger allow the delete
   only if `EXISTS (token WHERE caseId = OLD.caseId AND connectionId = CONNECTION_ID())`.
   `BEFORE UPDATE` always blocks, as now.
3. The purge deletes its token as the last statement before commit. MySQL has no on-commit hook.
   On rollback the insert disappears anyway.

Why this is as strong as the Postgres version:

- The token row is uncommitted, so no other session can see it, except one running READ
  UNCOMMITTED. Even that session has a different `CONNECTION_ID()`, so its deletes are still blocked.
- If a bug ever committed a stray token, it would be harmless: the case and all its history are
  deleted in the same transaction, and CUIDs are never reused.
- `PurgeToken` gets its own append-only exception: the app can only insert or delete its own
  connection's tokens.

Residual weakness, the same as today: a session with the app's DB credentials can insert its own
token, just as it can call `set_config` on Postgres or drop the trigger. Neither design defends
against someone holding the application's database password.

`PurgeToken` must be a Prisma model, or the next `migrate dev` would generate a `DROP TABLE`.

### 3.4 Isolation level and maker-checker

Postgres runs at READ COMMITTED; MySQL defaults to REPEATABLE READ. Every lock in
`finance-workflow.ts` (10 flows) and `case-workflow.ts` (4 flows) follows the same pattern:
`SELECT … FOR UPDATE`, then re-read inside the transaction, then `assertMakerChecker`. The checks
that run before the transaction (`guard`, `requireCaseAccess`) are not relied on for consistency.

**Recommendation:** set `transactionOptions: { isolationLevel: "ReadCommitted" }` on the
PrismaClient in `src/server/db.ts`. Every interactive transaction then has the same semantics it was
written and tested against: each statement sees the latest committed data, and the row lock
serialises approvers. Under REPEATABLE READ the flows also look correct, because the first
consistent read comes after the lock. But aggregate reads such as `verifyRecovery`'s sum of verified
recoveries would rest on snapshot timing instead of an explicit lock, and gap locks raise deadlock
risk. Precondition: MySQL refuses writes at READ COMMITTED when `binlog_format = STATEMENT`. Phase 0
checks this. Phase 3 still re-audits all 14 flows one by one and adds a concurrency test for each
maker-checker path.

## 4. Cannot be preserved

| #   | Lost on MySQL                                                                                                                                                                                                                                                                                                                           | Impact                                                                                                                                                                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **Transactional DDL.** A Postgres migration either applies completely or not at all. MySQL commits each DDL statement immediately                                                                                                                                                                                                       | A migration that fails half-way leaves the DB partly migrated and needs manual repair plus `prisma migrate resolve`                                                                                                                                                                                                                                       | Keep migrations small. Back up with `mysqldump` before every `migrate deploy` (goes into DEPLOYMENT.md). Rehearse each migration locally first                                                                                                                                                |
| 4.2 | **Case-sensitive, accent-sensitive equality.** Postgres compares `username`, `email`, `Department.name`, `Company.code` and `Branch.code` byte-for-byte while searching case-insensitively; one MySQL collation can't do both. Prisma can't declare per-column collations, so a binary collation on some columns would show up as drift | Unique constraints become case- and accent-insensitive (`José` = `jose`). Sign-in matching becomes case-insensitive (usernames and emails are already lower-cased at creation, so in practice only "Admin" now also signs in). Search becomes accent-insensitive. Hash, token and storage-key columns are lowercase hex, so no false matches are possible | Accept and document. Phase 1 checks that no existing data has case-only duplicates                                                                                                                                                                                                            |
| 4.3 | **Index-backed substring search** (pg_trgm)                                                                                                                                                                                                                                                                                             | Same results, slower on large tables                                                                                                                                                                                                                                                                                                                      | §2.2. Measure in Phase 6                                                                                                                                                                                                                                                                      |
| 4.4 | **Strict failure inside `skipDuplicates`.** `INSERT IGNORE` turns CHECK violations and over-long strings into warnings: the row is dropped or truncated with no error                                                                                                                                                                   | At 4 sites (§2.5.3), a bad row could be silently lost instead of failing the batch                                                                                                                                                                                                                                                                        | `// WEAKENED:` at each site. Mitigate by sizing columns ≥ Zod max and validating `score` in code before insert. Option, for your decision: drop `skipDuplicates`, pre-filter existing keys, and use a plain `createMany`, which preserves strictness at the cost of one extra query per batch |
| 4.5 | **Exact numbers inside JSON.** `jsonb` keeps arbitrary-precision numerics; MySQL JSON stores doubles                                                                                                                                                                                                                                    | Only matters if `audit()` before/after details or other JSON columns hold money as JSON numbers                                                                                                                                                                                                                                                           | Phase 3 audits what reaches JSON columns; money must already be strings (`toDbString`). Anything that isn't gets fixed                                                                                                                                                                        |
| 4.6 | **Guards depend on host configuration**                                                                                                                                                                                                                                                                                                 | If `sql_mode` lacks `STRICT_TRANS_TABLES`, MySQL truncates instead of failing. If triggers are refused (§3.2), all DB guards go                                                                                                                                                                                                                           | Phase 0 probes. The deploy preflight refuses to start if strict mode is off                                                                                                                                                                                                                   |

## 5. Decisions I need from you

1. Purge token keyed by `CONNECTION_ID()` instead of transaction id (§3.3).
2. Global `ReadCommitted` isolation (§3.4).
3. Remove all trigram indexes and keep `contains` semantics (§2.2, option A).
4. All five array fields → `Json` NOT NULL, including `flags` (§2.1).
5. `skipDuplicates`: keep with `// WEAKENED:`, or replace with pre-filter + strict insert (§4.4).
6. Local development: there is no MySQL on this machine. Should I rewrite `scripts/db-local.mjs` to
   run a project-local MySQL 8 instance (portable ZIP install, `mysqld --initialize-insecure
--lower_case_table_names=2`, port 3307, data in `.mysqldata/`) the way it does for Postgres now?
   And should `docker-compose.yml` switch its `db` service to `mysql:8.0` or be removed? It is an
   existing repo artefact, not part of the production path.

## 6. Phase plan

Each phase ends with a stop for your review. Tests are not expected to pass until Phase 4: every
create path allocates a reference through `references.ts`.

**Phase 0 — host probes and local MySQL (prerequisite).** Run on the cPanel server:

```sql
SELECT VERSION(), @@sql_mode, @@binlog_format, @@log_bin, @@log_bin_trust_function_creators,
       @@lower_case_table_names, @@transaction_isolation, @@time_zone, @@max_allowed_packet,
       @@max_user_connections, @@character_set_server, @@collation_server, @@ngram_token_size;
SHOW GRANTS;
-- trigger smoke test
CREATE TABLE t_probe (id INT PRIMARY KEY);
CREATE TRIGGER t_probe_guard BEFORE DELETE ON t_probe FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'probe';
DROP TABLE t_probe;
```

Then set up local MySQL 8 per decision 6. **Stop** if triggers are refused or `binlog_format` is
`STATEMENT` (READ COMMITTED would be refused).

**Phase 1 — schema and fresh `init` migration.** Provider; arrays → Json; trigram indexes removed;
`@db.Text` sizing table; `PurgeToken` model; delete `prisma/migrations`; `prisma migrate dev --name
init` against local MySQL; confirm table collation `utf8mb4_0900_ai_ci`; `prisma validate` and
`prisma generate`. TypeScript errors are expected to remain until Phases 3–4.

**Phase 2 — integrity guards.** `prisma migrate dev --create-only --name integrity_guards`,
hand-written: all triggers from §2.3 (including the two new cascade guards and the purge-token
checks), all 14 CHECKs. Applied to local MySQL and probed by hand: each guard rejects, each permitted
path succeeds. `errors.ts` message extraction adapted and checked against real MySQL error text.

**Phase 3 — raw SQL and transactions.** `references.ts`, `queue.ts`, both workflow lock helpers,
`permanent-deletion.ts` purge token, statement aggregate queries, `db.ts` isolation, the
maker-checker re-audit of all 14 flows, and the JSON-number audit (4.5).

**Phase 4 — Prisma API differences.** Remove `mode: "insensitive"` (6 files, 14 sites), `has` →
`array_contains`, JSON path syntax, Json typing for the five former arrays, `nulls: "last"`
verification, `skipDuplicates` per decision 5. `npm run typecheck` and `npm run lint` clean.

**Phase 5 — scripts, env and docs.** `db-local.mjs`, `setup-env.mjs`, `perf-env.ts`,
`load-test-data.ts`, `.env.example`, `docker-compose.yml`; README, DEPLOYMENT (including
`connection_limit` sized to `max_user_connections` and Passenger process count, and a
`mysqldump`-before-migrate step), BACKUP-RESTORE (`mysqldump --single-transaction --routines
--triggers`), FINANCIAL-CALCULATIONS, CLAUDE.md, PLAN.md; `npm run docs`.

**Phase 6 — tests.** Test DB setup files; `references-and-guards.test.ts` (purge token, plus new
tests for the two cascade guards); then the full `test:unit`, `test:integration`, `test:e2e`,
`build`, `test:e2e:prod`. Every skip documented. `npm run perf` compared with
`docs/performance-results.md`.

**Phase 7 — cPanel verification checklist.** Install, `prisma generate` (engine for the host's
OpenSSL), `migrate deploy`, build, Passenger start, and probes for sign-in + MFA, create case,
upload statement (parse job claimed), verify recovery (maker-checker refused for self), approve
expense, purge a case (history removed, audit row intact, direct `DELETE` of history refused), run a
search; plus direct-SQL guard probes on the production DB.
