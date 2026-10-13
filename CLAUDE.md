@AGENTS.md

# SIMS — working notes for AI assistants

## Stack and layout

- Next.js 16 App Router (Turbopack, `src/proxy.ts` instead of middleware, async `params`/`cookies`),
  React 19, TypeScript strict, Prisma 6 + MariaDB 10.11 (MySQL connector + `@prisma/adapter-mariadb`),
  npm. Read `node_modules/next/dist/docs/`
  before using a Next.js API you have not checked in this version.
- `src/app` — pages. `(app)` is the signed-in shell, `(auth)` the login, password and MFA screens.
  All data screens call the REST API through TanStack Query; pages do not query the database.
- `src/server/api` — the framework-free REST router mounted at `/api/v1` by
  `src/app/api/v1/[...path]/route.ts`. Modules in `src/server/api/modules` register routes with Zod
  schemas; OpenAPI is generated from them.
- `src/lib/resources/registry.ts` — one definition per record type drives validation, generic CRUD,
  tables, forms, imports and exports. Add fields there, not in ad-hoc forms.
- `src/lib` holds pure, unit-tested domain code (permissions, money, finance, statements analysis,
  references). `src/server` holds everything that touches the database or files.

## Rules that must not be broken

- **Money** is `Decimal(18,2)` in the database and `decimal.js` in code (`src/lib/money.ts`). Never use
  JavaScript numbers for amounts. Ratios use `percentage()`, which returns null for a zero denominator.
  Formulas are documented in `docs/FINANCIAL-CALCULATIONS.md`; keep that file and `src/lib/finance.ts` in step.
- **Authorisation** is enforced on the server in every handler (`requirePermission`,
  `requireCaseAccess`, `caseVisibilityWhere`). Hiding a button is never the control.
  Check the permission before validating input (403 before 422).
- **Maker-checker**: nobody approves, verifies or decides their own request (`assertMakerChecker`).
- **Protected records** (audit log, evidence originals, signed statements, original statements, court
  orders, judgments, final reports, verified recoveries, hashes, custody, legal holds) are also guarded
  by database triggers. Do not weaken or drop those migrations.
- **Soft delete** by default; permanent deletion only through the deletion-request workflow.
- **Automated statement analysis** is always labelled as an investigative lead, not proof.
- **Audit** every state change with `audit()`; never log passwords, tokens, secrets or statement contents.
- Demo data is fictional and flagged `isDemo`; `DEMO_MODE=true` is refused in production.
- Do not suppress TypeScript, lint or test errors, and do not weaken tests to make them pass.
- Large data: avoid O(n²) loops and array spreads inside loops over transactions or imports, and never
  `include` a relation for an unbounded list (Prisma binds one parameter per row; MariaDB allows 65,535).

## MariaDB rules (the database moved from PostgreSQL; see `docs/MYSQL-MIGRATION-PLAN.md`)

- Build every `PrismaClient` with `createPrismaClient()` (`src/server/prisma-client.ts`): it makes each
  connection strict and UTC and sets READ COMMITTED. The host's server `sql_mode` is empty, so a bare
  client would silently truncate. Scripts must `$disconnect()`: the driver pool keeps Node running.
- Raw SQL: backtick identifiers (`` `Case` ``, `` `key` `` are reserved), `?` placeholders in
  `$queryRawUnsafe`, `UTC_TIMESTAMP(3)` instead of `NOW()`, `CAST(x AS DECIMAL(18,2))` for money
  parameters. No `RETURNING`, `LATERAL`, `ON CONFLICT`, `::casts`, `unnest`, `ANY()`.
- No `mode: "insensitive"`: text columns use `utf8mb4_unicode_ci`, so `contains` already ignores case
  (and accents, and trailing spaces in comparisons).
- `String` is `VARCHAR(191)` unless annotated: give every free-text field `@db.VarChar(n)`, `@db.Text` or
  `@db.MediumText` at least as large as its validation limit.
- Lists of strings are `Json` columns: read them with `stringArray()` (`src/lib/string-array.ts`) and
  filter with `array_contains`. Do not use `createMany({ skipDuplicates })` (it is INSERT IGNORE and
  silently drops bad rows); filter known duplicates first, as `createNotifications()` does.
- Foreign-key cascades do not fire MariaDB triggers: a new guard on a child table may need a matching
  check on the parent (see `case_guard_bd` and `user_audit_guard_bd` in the guards migration).

## Commands

- Database: `npm run db:local:start` (project-local MariaDB in `mariadb-data/`, port 3307), `npm run db:migrate`,
  `npm run db:seed`.
  `prisma migrate reset` on the development database needs the user's explicit consent.
- Checks: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:unit`,
  `npm run test:integration`, `npm run test:e2e`, `npm run build`, `npm run test:e2e:prod` (after a build).
- Tests use their own databases (`sims_test`, `sims_e2e_prod`, `sims_perf`); stop any `next dev` on
  the same folder before running Playwright.
- `npm run docs` regenerates the role matrix, entity summary and OpenAPI file after changing
  permissions, the schema or routes.
