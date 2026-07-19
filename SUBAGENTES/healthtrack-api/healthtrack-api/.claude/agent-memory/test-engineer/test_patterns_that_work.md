---
name: test-patterns-that-work
description: Test structure/conventions already validated in this repo's existing suite — reuse these when adding new tests
metadata:
  type: feedback
---

The existing `tests/auth.test.ts` and `tests/patients.test.ts` establish patterns worth reusing
for any new module tests (appointments, health-metrics, notifications):

- **In-memory DB per test run, not mocked.** `tests/setup.ts` creates a real `better-sqlite3`
  `:memory:` DB in `beforeAll`, runs `runMigrations(testDb)`, and swaps it in via `setDb(testDb)`.
  `beforeEach` truncates all tables (`DELETE FROM ...` for audit_log, notifications,
  health_metrics, appointments, patients, users, plus `sqlite_sequence` to reset autoincrement).
  This matches the project rule "never mock the database for integration tests" — extend this same
  `setup.ts`/`testDb` rather than introducing mocks or a second DB helper.
- **Tests call service functions directly, not HTTP routes.** e.g. `registerUser`/`loginUser` from
  `auth.service.ts`, `getPatients`/`createPatient`/`deletePatient` from `patients.service.ts`. There
  is no `supertest` dependency and no test currently exercises `*.routes.ts`, `auth.middleware.ts`,
  or `middleware/*.ts` — those files show 0% coverage as a direct result. If route/middleware
  behavior needs testing (auth guards, role checks, rate limiting, error-handler formatting), either
  add `supertest` + spin up the Express app, or explicitly note that only service-layer logic is
  covered.
- **`createTestUser({ email, password, role, name })` and `createTestPatient({ userId, doctorId? })`**
  helpers in `tests/setup.ts` insert directly into the DB (bypassing the service layer) for fast
  fixture setup — `createTestUser` hashes with `bcrypt.hashSync(password, 1)` (rounds=1) specifically
  to keep tests fast; keep using rounds=1 in any new fixture helpers rather than the production
  bcrypt cost factor.
- **`TokenPayload` objects are constructed by hand** for service calls that take an auth payload
  (`{ userId, email, role, name }`) rather than generating a real JWT and decoding it — fine for
  service-level tests since `verifyToken` isn't the thing under test in those files.
- Existing test files have `// DEBT:` comments at the top listing intentionally-missing cases
  (e.g. auth: wrong password/duplicate email/expired tokens/invalid roles; patients: cross-doctor
  access leakage, SQL injection-shaped input, invalid DOB, pagination). Check these comments first
  before assuming a gap is undiscovered — they're the course's intentional exercise markers per
  [[project_coverage_gaps_2026-07-14]].
- **`it.each` boundary-value tables work well for range/threshold logic** (validated 2026-07-19
  expanding `tests/alerts.test.ts` for `checkMetricStatus()`'s warning/critical thresholds). Pattern:
  build a `[metricType, value, expectedStatus, unit][]` array with every exact limit named in
  CLAUDE.md's metric range table (e.g. glucose 100/101, 70/69, 125/126, 54/53), then in the single
  `it.each` callback assert the _expected_ status (hardcoded from the spec) rather than re-deriving
  it from the function under test — this is what actually catches an off-by-one `<` vs `<=` bug
  instead of just re-asserting the function agrees with itself. Chaining the boundary check straight
  into `createAlertIfOutOfRange()` in the same test (asserting `null` for normal, a populated alert
  row for warning/critical) covers both "boundary classification" and "no-alert-on-normal" concerns
  in one pass without a separate describe block. See [[project_alerts_bug_findings_2026-07-19]] for
  what this style of test surfaced (a real diastolic-blood-pressure alerting gap).
- **`createTestMetric()` helper (`tests/setup.ts`) needs a fresh/unique user email per call** inside
  loops (`it.each`, or a `describe`-scoped counter) since `beforeEach` truncates tables but a
  `boundaryCounter`-style closure variable is not DB state — increment it per test to keep
  `users.email` unique across many generated fixtures in the same file.
