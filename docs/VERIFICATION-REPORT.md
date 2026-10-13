# Verification report

> **Historical (PostgreSQL 17, 30 September 2026).** The database has since moved to MariaDB 10.11.
> Verification of the MariaDB version is recorded in [MYSQL-MIGRATION-PLAN.md](MYSQL-MIGRATION-PLAN.md).

Final checks for this delivery, run on 30 September 2026 on the development machine. Every command
below was actually run; results are as reported by the tool. Nothing was skipped silently — checks that
could not run are listed at the end with the reason.

## Environment

- Windows 10 Pro, Node.js 24.20.0, npm 11.19.0, Python 3.14.7 (pandas 3.0.6, openpyxl 3.1.5, pdfplumber 0.11.10)
- PostgreSQL 17 (project-local cluster on port 5433); Chromium via Playwright
- Next.js 16.3.7, React 19, Prisma 6.19.3; 54 tables, 7 migrations

## Quality gates

| #   | Command                                            | Result                                                                                                                  |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `npm run format:check`                             | Pass — all files use Prettier style                                                                                     |
| 2   | `npm run lint`                                     | Pass — 0 errors, 0 warnings                                                                                             |
| 3   | `npm run typecheck`                                | Pass — TypeScript strict, 0 errors                                                                                      |
| 4   | `npm run test:unit`                                | Pass — 14 files, **123 tests** (unit + component)                                                                       |
| 5   | `npm run test:integration`                         | Pass — 8 files, **77 tests** (Supertest API, database, security, MFA, CLI)                                              |
| 6   | `npm run build`                                    | Pass — production build, no warnings                                                                                    |
| 7   | `npm run test:e2e`                                 | Pass — **31 tests**: 24 workflows and account/security checks (21 tests on desktop) + 10 responsive/accessibility tests |
| 8   | `npm run test:e2e:prod`                            | Pass — **3 tests** against `next start` in production mode                                                              |
| 9   | `npm run load-data` then `npm run perf`            | Pass — 21 API scenarios and the background analysis job within budget                                                   |
| 10  | `npm audit`                                        | Pass — 0 vulnerabilities                                                                                                |
| 11  | `npx prisma validate`, `npx prisma migrate status` | Pass — schema valid, database up to date                                                                                |
| 12  | `npm run verify-storage` (development data)        | Pass — 6 stored files, all present with matching SHA-256                                                                |

## What the automated tests cover

**Unit and component (123):** permissions and case-access decisions, maker-checker, money arithmetic and
rounding, every financial formula (including the worked example in `FINANCIAL-CALCULATIONS.md`), reference
formats, case status rules and closure checklist, cheque warnings, reminders, masking, password policy and
log redaction, resource schemas, import mapping and duplicates, statement normalisation and pattern
detection, an equivalence test of the optimised analysis against the original algorithm on 600 random
datasets, the API router, demo-mode guard, and UI components (forms, tables, dialogs, badges).

**Integration (77):** sign-in, lockout, sessions and CSRF; role, scope, assignment and confidentiality
enforcement on every module; protected-record and legal-hold guards (application and database triggers);
case workflows, closure and reopening; evidence hashing, versions and custody; expenses, advances,
budgets, recoveries and write-offs with maker-checker; bulk import (validation, duplicates, partial/atomic,
idempotency); bulk actions and recycle bin; permanent deletion with re-authentication and a second
approver; statement upload, parsing, analysis and link review; exports and reports; TOTP enrolment,
verification, replay refusal, rate limiting and alerts, administrator reset; `create-admin` and
`verify-storage`; malware-signature rejection and storage-path traversal protection.

**End-to-end, development server (31):** workflows 1–24 of the specification in a real browser; theme,
text size and reduced-motion preferences; keyboard skip link and search; refused pages and API calls;
two-step verification enrolment and sign-in; Content Security Policy and security headers (Swagger UI
renders under it); axe WCAG 2.1 A/AA scans of key pages at 390, 820 and 1440 px, every case-file tab on a
phone, and the administration pages; colour contrast in all four themes; no horizontal page scrolling;
mobile navigation focus handling; operating-system reduced motion; keyboard-only work in a case file.

**End-to-end, production mode (3):** strict CSP with no `unsafe-eval`, no demo banner, `__Host-` `Secure`
`HttpOnly` session cookie, first administrator created by `npm run create-admin` must change the
temporary password and then set up two-step verification before any page or API call works, code required
at every sign-in, key pages render without console errors, and administrators cannot switch MFA off.

## Performance (fictional data in `sims_perf`)

5,005 cases, 100,030 invoices, 15,050 parties, 10,007 tasks, 100,019 statement transactions, 112,903 link
suggestions and 200,219 audit entries. All list, search, dashboard, statement and audit endpoints have a
p95 under 200 ms except money movement across 100,000 transactions (p95 1.1 s, budget 4 s) and bulk
exports (25,104 rows in 2.8 s). The background analysis of 100,019 transactions takes 26.6 s (budget
120 s). Full table: [performance-results.md](performance-results.md).

## Defects found by this verification and fixed

- Statement analysis was O(n²): at 100,000 transactions it did not finish. Rewritten (≈3 s compute,
  26.6 s including database writes) with identical results, proven by the equivalence test.
- Weak partial-name matches flooded the review queue (800,000 suggestions for 100,000 transactions);
  now only the best weak match is kept, and only when nothing stronger matches (112,889 suggestions).
- Money movement and the statement export failed with HTTP 500 above 32,767 transactions (PostgreSQL
  bind-parameter limit); money movement now aggregates in SQL (3.9 s → 1.0 s) with identical output.
- Findings could be submitted while recommendations were still saving; bulk-action results were never
  shown; suggested links did not refresh after background analysis; court-diary rows could not identify
  their matter; phones scrolled sideways on the case page; focus was lost after closing dialogs; scrolling
  tables were not keyboard-reachable; rapid preference changes could save out of order.
- `npm run worker` and `npm run reparse` did not load `.env`.
- No way existed to create the first administrator without demo mode (`npm run create-admin` added).
- Pages had no Content Security Policy (nonce-based CSP added).
- `uuid` (via exceljs) and `deepmerge-ts` (via the Prisma CLI) had advisories; patched with npm overrides.
- A message told users to configure an OCR variable that does nothing; the wording now states that OCR
  is not included.

## Checks that could not run, and limitations

- **Docker:** not installed on this machine. `Dockerfile` and `docker-compose.yml` (database, migrate, app,
  worker) were written but **not built or started**; `docker compose config` was not run.
- **Browsers:** end-to-end tests ran in Chromium only; Firefox and Safari were not tested.
- **Assistive technology:** axe scans and keyboard tests are automated; no manual screen-reader session
  (NVDA, JAWS, VoiceOver) was carried out.
- **Not implemented (integration points only):** OCR for scanned statement PDFs (they go to manual review)
  and Microsoft Entra ID sign-in. Malware scanning requires an external scanner at `MALWARE_SCAN_URL`;
  only the built-in EICAR test-signature rejection is tested, not a real scanner.
- **Performance** was measured in-process on one machine with the database local; network and TLS time
  are excluded, and no concurrent-user load test was run.
- **Backups:** the backup and restore procedure is documented; a full restore drill was not performed
  here (`verify-storage`, the post-restore check, was run and tested).
