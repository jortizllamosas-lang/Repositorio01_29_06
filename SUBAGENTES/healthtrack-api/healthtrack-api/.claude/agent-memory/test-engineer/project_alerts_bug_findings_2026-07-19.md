---
name: project-alerts-bug-findings-2026-07-19
description: Real bugs/gaps found while writing exhaustive boundary tests for the alerts module — reported, not fixed, per instructions
metadata:
  type: project
---

While expanding `tests/alerts.test.ts` from 10 smoke tests to 57 tests (2026-07-19), covering exact
boundary values for `checkMetricStatus()` (`src/health-metrics/metrics.service.ts`) feeding
`createAlertIfOutOfRange()` (`src/alerts/alerts.service.ts`), two things were found worth flagging
to whoever owns implementation (per the task, these were reported but deliberately NOT fixed by the
test-engineer subagent):

1. **[CORREGIDO 2026-07-19] `blood_pressure` alerts/notifications ignored diastolic entirely (real
   bug, not just a test gap).** `health_metrics.secondary_value` holds diastolic for
   `blood_pressure` rows (confirmed via `metrics.types.ts` and `metrics.service.ts createMetric()`
   which stores `dto.secondary_value` but used to never read it back for status checks).
   `checkMetricStatus()` used to only evaluate the single `value` (systolic) against the systolic
   range (90-120 normal / 121-140 warn / >140 or <80 critical), with no separate diastolic range
   check (60-80 normal / 81-90 warn / >90 or <50 critical per CLAUDE.md). Net effect: a metric
   recorded with systolic=110 (normal) and diastolic=130 (critical per spec) used to produce
   **zero alert and zero notification** — a patient-safety-relevant gap.
   **Fix applied:** `checkMetricStatus(metricType, value, secondaryValue?)` in
   `src/health-metrics/metrics.service.ts` now accepts an optional `secondaryValue`. For
   `blood_pressure` it classifies systolic and diastolic independently (`classifySystolic`,
   `classifyDiastolic` helpers) and returns the worse of the two statuses. Both call sites
   (`getPatientSummary()` and `createMetric()`) now pass `secondary_value`/`latest.secondary_value`
   through. `tests/alerts.test.ts` was updated: the test that used to document the bug
   (`Integration gap: createMetric() ignores diastolic...`) now asserts the fixed behavior
   (`Fix: createMetric() now evaluates diastolic...`), plus new diastolic boundary-value cases
   (60/59, 80/81, 90/91, 50/49) were added following the existing `it.each` pattern. All 78 tests
   pass (`npm test`), and `npm run build` compiles cleanly. `alerts.value` still stores only the
   systolic value, unchanged (no schema/migration change was needed or made).

2. **Dead config in `METRIC_RANGES` (minor, maintainability only, not currently causing incorrect
   behavior).** Each entry in `METRIC_RANGES` (`metrics.service.ts`) defines `warningMin`,
   `warningMax`, `criticalMin`, `criticalMax`, but `checkMetricStatus()` never reads those fields —
   every warning/critical branch is a hardcoded literal comparison per metric type (e.g.
   `if (value > 125 || value < 54) return "critical"` for glucose, duplicating `warningMax: 125` /
   `warningMin: 54` as separate literals). Verified by hand that every hardcoded literal currently
   matches its corresponding config field and matches the CLAUDE.md table exactly — so this is not
   presently a correctness bug, just a footgun: editing `METRIC_RANGES.glucose.warningMax` alone
   would have zero effect on behavior since the literal `125` in the `if` branch is what actually
   governs it.
   **How to apply:** if `safe-implementer` refactors this file to read from the config object instead
   of hardcoded literals, no test changes should be needed since the boundary-value test table in
   `tests/alerts.test.ts` asserts on the CLAUDE.md-documented values directly (not on whatever the
   function currently returns), so it will still pass/fail correctly against the real spec.

See [[test_patterns_that_work]] for the `it.each` boundary-table pattern used to write these tests
efficiently.
