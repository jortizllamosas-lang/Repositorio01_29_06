---
name: project-coverage-gaps-2026-07-14
description: Snapshot of test coverage by module — which modules have zero tests (updated 2026-07-19 after alerts module test expansion)
metadata:
  type: project
---

Baseline from `npm run test:coverage` (v8 provider) on 2026-07-14: only `tests/auth.test.ts` (5) and
`tests/patients.test.ts` (5) existed, both service-level only (see [[test_patterns_that_work]]).
Overall was 14.14% stmts/lines.

**Update 2026-07-19:** `tests/alerts.test.ts` was expanded from 10 smoke tests to 57 tests (full
suite now 67 tests across 3 files, all passing). This was in scope for a new `src/alerts/*` module
(alerts.service.ts, alerts.routes.ts, alerts.types.ts) that didn't exist on 2026-07-14, plus it
exercises `checkMetricStatus()` in `src/health-metrics/metrics.service.ts` far more thoroughly via
exhaustive boundary-value tests (see [[project_alerts_bug_findings_2026-07-19]] for a real bug this
surfaced). New coverage after this work:

- `src/alerts/alerts.service.ts` — **100%** stmts/branch/funcs/lines.
- `src/alerts/alerts.routes.ts` — still 0% (only service-level tests exist per repo convention; no
  supertest dependency in this repo, confirmed 2026-07-19).
- `src/health-metrics/metrics.service.ts` — jumped to 55.51% stmts/lines, **90.62% branch** (up from
  untested), 50% funcs. `checkMetricStatus()`'s branches are now exhaustively covered; still
  uncovered: `getMetricsByPatient`, `getPatientSummary` (trend calculation, N+1 DEBT), and parts of
  `createMetric()` (lines ~123-187, 228-242 per report) — the notification-creation side effect and
  filter-building logic in `getMetricsByPatient` remain untested.
- Overall suite: 17.95% stmts/lines, 70.65% branch, 39.02% funcs (up from 14.14%/41.86%/33.33%).

**How to apply:** treat these as current gaps until refreshed again. Priority order if picking up
more work:

1. **0% coverage, no tests at all (unchanged from 2026-07-14 except alerts):**
   - `src/appointments/*` (routes, service ~122 lines, validation) — entire module untested.
   - `src/notifications/*` — still ~7-9% only (incidentally touched by nothing in the alerts work;
     `createNotification` itself is not called by any test even though `metrics.service.createMetric()`
     calls it — the notification side-effect of `createMetric()` remains untested).
   - `src/middleware/*` (`audit-logger.ts`, `error-handler.ts`, `rate-limiter.ts`) — untested.
   - `src/auth/auth.middleware.ts` (`authenticate()`/`authorize()`) — untested.
   - All `*.routes.ts` files across every module — 0%, no test issues real HTTP requests.
   - `src/index.ts`, `src/database/seed.ts` — 0% (expected/low priority).
2. `src/health-metrics/metrics.service.ts` remaining gaps: `getMetricsByPatient` filters,
   `getPatientSummary` trend logic (rising/falling/stable + the N+1 `// DEBT:`), and the
   `createNotification()` call inside `createMetric()` (cross-module integration test, still open).
3. `src/patients/patients.service.ts` — 60.35% stmts, 50% branch — cross-doctor access leakage still
   flagged by the file's own `// DEBT:` comment, still not covered.
4. Auth/role middleware (`authenticate`, `authorize`) — still zero coverage.
