# SIMS — Savemore Investigation Management System — Implementation Plan

This plan tracks the build against the full SIMS specification (30 modules). Each phase ends with
formatting, lint, type check, tests and a production build; failures are fixed before moving on.

## Environment (verified 2026-09-30)

- Windows 10, Node 24.20, npm 11.19, Python 3.14.
- Docker is **not installed** on this machine. `docker-compose.yml` and `Dockerfile` are provided and
  documented, but Docker Compose startup cannot be verified here. Local development uses a
  project-local PostgreSQL 17 cluster (`npm run db:local:*`, port 5433).
- **Update 2026-10-07:** the database is now MariaDB 10.11 (the only engine the production cPanel
  host allows). Local development uses a project-local MariaDB instance (`npm run db:local:*`,
  port 3307). Rationale, trade-offs and results: [docs/MYSQL-MIGRATION-PLAN.md](docs/MYSQL-MIGRATION-PLAN.md).
  References to PostgreSQL below describe the original design.
- Package manager: **npm** (the repository already used npm with a lockfile).

## Architecture decision: keep the existing Next.js modular monolith

The repository already contained a working Next.js 16 + Prisma + PostgreSQL foundation (auth,
RBAC, audit, integrity triggers, tests) and an `AGENTS.md` that mandates Next.js. The spec allows
keeping an existing suitable architecture, so SIMS stays a single deployable modular monolith:

| Spec item                        | How it is delivered                                                                                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React + TypeScript + Vite        | React 19 + TypeScript (strict) compiled by Next.js 16 / Turbopack. Route-level code splitting is automatic                                                                                                                                                        |
| NestJS / Express modular backend | Framework-free REST router at `/api/v1` (`src/server/api`) with modules per domain, mounted by one catch-all route handler. The same router is exercised by Supertest through a Node HTTP adapter                                                                 |
| OpenAPI / Swagger                | OpenAPI 3.1 generated from the route registry + Zod schemas (`/api/v1/openapi.json`), rendered with Swagger UI at `/api-docs`                                                                                                                                     |
| TanStack Query                   | All data screens fetch the REST API through TanStack Query (caching, request cancellation via AbortSignal, debounced search)                                                                                                                                      |
| Python + pandas parser           | `StatementParser` interface; `PythonPandasParser` (child process, `parsers/statement_parser.py`) when Python + pandas are available, otherwise the built-in `NodeStatementParser`. Parsing runs in the background job worker, never in the browser or the request |
| Background jobs                  | `Job` table claimed with `FOR UPDATE SKIP LOCKED`; worker runs in-process (dev) or as a separate `npm run worker` process (production / Docker)                                                                                                                   |

Other decisions:

- **Money**: `Decimal(18,2)` columns, `decimal.js` in code, strings over JSON. Currency per case, default KES (configurable in Settings).
- **Soft deletion**: every business table carries `isDeleted, deletedAt, deletedById, deletionReason, deletionBatchId, restoredAt, restoredById, restorationReason` plus `archivedAt`. Lists exclude deleted rows by default.
- **Protected records**: audit logs, evidence originals, signed statements, original financial statements, court orders/judgments, approved final reports, verified recovery receipts, file hashes, custody records and anything under legal hold cannot be soft- or hard-deleted through ordinary actions; DB triggers back this up.
- **Permanent deletion**: request → automated checks (retention, dependencies, legal hold, protection) → password re-authentication → approval by a _different_ user with the separate permission → execution in a transaction → audit record that survives.
- **Authorization**: permission = role grant (module × action) ∩ case scope (company/branch, assignment, confidentiality). Enforced in every API handler; the UI only hides what the server would refuse.
- **Automated financial analysis** is labelled everywhere as _an investigative lead requiring human verification, not proof_.
- **Seed data** is fictional, flagged `isDemo`, and badged **DEMO DATA** in the UI.

## Phases

### Phase 1 — Foundation (complete)

Auth (Argon2id, sessions, lockout, forced password change), RBAC policy, audit log, reference counters, money helpers, integrity triggers, local Postgres scripts, tests.

### Phase 2 — Schema v2 and platform (complete)

- [x] Rebuild Prisma schema for all 30 modules, soft-delete columns, indexes, check constraints, partial indexes, protection triggers (fresh baseline migration)
- [x] Permissions v2: granular actions (view, create, edit, approve, export, bulk upload, archive, soft delete, restore, request/approve permanent deletion, manage users, manage settings, view audit logs)
- [x] API platform: router, request IDs, consistent envelopes/errors, pagination/sort/filter validation, CSRF origin check, rate limits, session from request, audit context
- [x] Money/recovery/budget calculation library with zero-safe ratios

### Phase 3 — Case management core (complete)

- [x] Resource registry (fields, Zod schemas, list columns, filters, duplicate keys, protection rules) driving CRUD API, tables, forms, import templates
- [x] App shell: sidebar, 5 themes, font scale, reduced motion, high contrast, skip link, Manrope/Inter/IBM Plex Mono
- [x] Cases (status machine, reopening history), sub-files, parties, invoices, cheques (+warnings), interviews, statements, work-done log (+task generation), tasks (+reminders)

### Phase 4 — Evidence, findings, legal pathways (complete)

- [x] Evidence vault: SHA-256, read-only original, working copies + versions, access/download history, custody, legal hold
- [x] Findings, recommendations, management decisions (maker-checker)
- [x] Criminal (milestones), civil (court events), disciplinary (restricted), write-offs (finance → management → board)
- [x] Case closure and reopening (transactional)

### Phase 5 — Costs and recovery (complete)

- [x] Expenses (approval workflow, transactional), advances/imprests, budgets, recoveries (posting + verification)
- [x] Financial summary per case and portfolio

### Phase 6 — Statement analysis (complete)

- [x] Upload (hash, original preserved), background parsing (Python/pandas or Node), transaction review
- [x] Link suggestions (6 classes) with confirm/reject, pattern detection flags
- [x] Money-movement network (Cytoscape), transfer matrix, timeline, counterparty summary, schedule export — each with a table alternative

### Phase 7 — Data administration (complete)

- [x] Bulk upload (templates, drag and drop, mapping, validation, duplicates with 5 strategies, preview, error report, idempotency, atomic/partial, history)
- [x] Bulk admin actions (select page/all filtered, archive, soft delete, restore, reassign, change status, export)
- [x] Recycle Bin (individual + batch restore), permanent-deletion workflow

### Phase 8 — Insight and administration (complete)

- [x] Role dashboards (investigator, management, finance, legal, admin) with chart + table alternatives
- [x] Global/advanced search, reminders/notifications
- [x] 19 reports in PDF/DOCX/XLSX/CSV
- [x] Audit log viewer, users and roles admin, system settings, user preferences
- [x] OpenAPI + Swagger UI

### Phase 9 — Verification and delivery (complete)

- [x] Unit, component, API (Supertest), DB integration, permission, security, Playwright (24 workflows), axe accessibility, performance with large fictional data
- [x] README, CLAUDE.md, role matrix, entity summary, deployment, backup/restore, import templates, sample statements, final verification report

## Progress log

- 2026-09-30: Phase 1 complete (previous session). Plan rewritten for the full specification.
- 2026-09-30: Phases 2–8 built: schema v2 (54 tables, integrity triggers), REST API with OpenAPI, all 30
  modules, statement parsing and analysis, data administration, dashboards, reports, administration.
- 2026-09-30: Phase 9 verification:
  - Playwright: 24 workflows, responsive layouts at phone/tablet/desktop widths, axe (WCAG 2.1 A/AA) on
    key pages, every case tab and the admin pages, contrast in all four themes, reduced motion, keyboard use.
    Found and fixed: submit/save race in findings, bulk-result dialog unmounting, suggested links not
    refreshing after analysis, court diary unable to identify matters, horizontal overflow on phones from
    visually hidden text, lost focus after closing dialogs, non-focusable scrolling tables, preference
    saves racing.
  - Added TOTP two-step verification (required for production administrators), `create-admin`,
    `verify-storage`, a nonce-based Content Security Policy, Dockerfile and full Compose stack.
  - Performance with 5,000 cases / 100,000 invoices / 100,000 transactions / 200,000 audit rows:
    statement analysis was O(n²) (did not finish) — rewritten to n·log n with an equivalence test against
    the original; weak name-overlap suggestions limited (800k → 113k leads); money movement crashed above
    32,767 transactions (Prisma bind limit) and now aggregates in SQL (3.9 s → 0.9 s). All budgets met.
  - Dependency audit: patched `uuid` (via exceljs) and `deepmerge-ts` (via the Prisma CLI) with npm overrides.

## Known limitations

- Docker is not installed on the build machine, so the Dockerfile and Compose stack were written but not built or run here.
- OCR for scanned statement PDFs and Microsoft Entra ID sign-in are integration points only (not implemented);
  scanned statements go to manual review.
- Malware scanning needs an external scanner (`MALWARE_SCAN_URL`); without it uploads are recorded as not scanned.
