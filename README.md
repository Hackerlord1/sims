# SIMS — Savemore Investigation Management System

**Track. Investigate. Resolve.**

SIMS manages internal investigations end to end: case files and sub-files, parties, invoices, bad
cheques, interviews and signed statements, an evidence vault with chain of custody, findings and
management decisions, criminal, civil and disciplinary pathways, write-offs, investigation costs,
advances, budgets and recoveries, bank and M-Pesa statement analysis with money-movement mapping,
bulk data administration, a recycle bin with controlled permanent deletion, reports, dashboards and
a full audit trail.

It is a single Next.js 16 application (React 19, TypeScript strict) with a REST API at `/api/v1`,
MariaDB 10.11 through Prisma (MySQL connector with the MariaDB driver adapter), a background worker
and an optional Python/pandas statement parser. The database moved from PostgreSQL to MariaDB in
October 2026 because the production host offers only MariaDB; see
[docs/MYSQL-MIGRATION-PLAN.md](docs/MYSQL-MIGRATION-PLAN.md) for what changed and what that cost.
See [PLAN.md](PLAN.md) for the architecture decisions and [docs/](docs) for reference material.

## Quick start (Windows or Linux, without Docker)

Requirements: Node.js 24, npm, the MariaDB 10.11 Windows/Linux ZIP extracted to `~/mariadb1011`, and
optionally Python 3.11+.

```bash
npm install
npm run setup:env                          # creates .env with random secrets (git-ignored)
npm run db:local:init                      # project-local MariaDB in ./mariadb-data, port 3307
npx prisma migrate deploy                  # schema, integrity triggers and checks
npm run db:seed                            # organisation data; with DEMO_MODE=true also fictional demo data
pip install -r parsers/requirements.txt    # optional: pandas statement parser (otherwise the Node parser is used)
npm run dev                                # http://localhost:3000
```

`db:local:init` uses the portable MariaDB binaries in `~/mariadb1011/bin` (override with `MARIADB_BIN`)
and configures the instance like the production host (binary logging off, empty server `sql_mode`;
the app makes its own connections strict). After a reboot start the database with
`npm run db:local:start`.

With Docker: `docker compose up -d db` for the database only, or `docker compose --profile app up -d --build`
for the whole stack (database, migrations, app and worker). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Accounts

With `DEMO_MODE=true` (development only) the seed creates clearly labelled fictional data:

| Username                                                                                                                                                      | Role                 | Password                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `felix`                                                                                                                                                       | System Administrator | `DEMO_ADMIN_PASSWORD` from `.env` — temporary, changed at first sign-in |
| `lead.demo`, `investigator.demo`, `audit.demo`, `compliance.demo`, `legal.demo`, `hr.demo`, `finance.demo`, `manager.demo`, `executive.demo`, `advocate.demo` | one per role         | `DEMO_USERS_PASSWORD` from `.env`                                       |

Demo accounts are refused outside demo mode, and the app will not start with `DEMO_MODE=true` when
`NODE_ENV=production`. For a real installation create the first administrator with:

```bash
npm run create-admin -- --username jdoe --email j.doe@example.co.ke --name "Jane Doe"
```

It prints a one-time temporary password. Production administrators must set up two-step verification
(any TOTP authenticator app) at first sign-in; other users can enable it from the account menu.

## Everyday commands

| Command                       | What it does                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                 | Development server with background jobs running in-process                         |
| `npm run build` / `npm start` | Production build / start (with a preflight safety check)                           |
| `npm run worker`              | Background worker (statement parsing, large imports, reminders) as its own process |
| `npm run db:migrate`          | Create and apply a new migration in development                                    |
| `npm run db:seed`             | Seed organisation data (and demo data in demo mode)                                |
| `npm run samples`             | Regenerate the fictional sample statements and import files in `samples/`          |
| `npm run templates`           | Write every bulk-import template (CSV and Excel) to `samples/templates/`           |
| `npm run create-admin`        | Create a System Administrator from the command line                                |
| `npm run verify-storage`      | Re-hash every stored file and report anything missing or altered                   |
| `npm run reparse`             | Queue every statement for parsing again (after a parser upgrade)                   |
| `npm run docs`                | Regenerate the role matrix, entity summary and OpenAPI file in `docs/`             |

The API is documented at `/api-docs` (Swagger UI, administrators) and in [docs/openapi.json](docs/openapi.json).

## Quality gates

```bash
npm run format:check       # Prettier
npm run lint               # ESLint (Next.js core-web-vitals + TypeScript rules)
npm run typecheck          # TypeScript strict
npm run test:unit          # unit and component tests (Vitest, Testing Library)
npm run test:integration   # API (Supertest) and database tests against sims_test
npm run test:e2e           # Playwright: 24 workflows, responsive layouts, axe accessibility
npm run build              # production build
npm run check              # lint + typecheck + all Vitest tests + build
```

Integration and end-to-end tests create, migrate and seed a separate `sims_test` database; they never
touch development data. Install the Playwright browser once with `npx playwright install chromium`.

### Performance test

```bash
npm run load-data          # ~5,000 cases, 100,000 invoices, 100,000 statement transactions, 200,000 audit rows
npm run perf               # measures API response times against budgets → docs/performance-results.md
npm run verify-db          # checks the connected database's integrity guarantees (read-only)
```

Both use their own `sims_perf` database and storage folder. See [docs/performance-results.md](docs/performance-results.md).

## Documentation

- [docs/FINANCIAL-CALCULATIONS.md](docs/FINANCIAL-CALCULATIONS.md) — every financial formula, with a worked example
- [docs/role-permission-matrix.md](docs/role-permission-matrix.md) — roles, actions and access rules (generated)
- [docs/entities.md](docs/entities.md) — tables and enumerations (generated)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — configuration, production start, Docker, monitoring
- [docs/BACKUP-RESTORE.md](docs/BACKUP-RESTORE.md) — backing up and restoring the database, files and keys
- [docs/VERIFICATION-REPORT.md](docs/VERIFICATION-REPORT.md) — every check run for this delivery and its result
- [samples/README.md](samples/README.md) — fictional sample statements and import files

## Security summary

- Argon2id passwords; 256-bit session tokens stored only as HMACs; HttpOnly, SameSite cookies with
  idle and absolute timeouts; account lockout and rate limiting; optional TOTP two-step verification
  (required for production administrators); re-authentication for sensitive actions.
- Every API call is authorised on the server by role × module × action, company/branch scope, case
  assignment and confidentiality level. Maker-checker applies to approvals and verifications.
- CSRF protection (custom header plus Origin check), strict JSON and upload size limits, upload
  allow-lists with content sniffing, random storage names, read-only originals, SHA-256 hashes and an
  optional malware-scanning hook.
- Database triggers keep the audit log append-only, make references immutable and protect evidence,
  signed statements, original statements, court orders, judgments, final reports, verified recoveries
  and legal holds. Permanent deletion needs a separate permission, checks, re-authentication and a
  second person's approval, and is itself audited.
- Automated statement analysis is labelled everywhere as an investigative lead, not proof.
