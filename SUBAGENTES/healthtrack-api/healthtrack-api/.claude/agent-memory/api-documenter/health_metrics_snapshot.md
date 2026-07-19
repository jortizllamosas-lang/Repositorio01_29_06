---
name: health_metrics_snapshot
description: API documentation snapshot of health-metrics module before new alerts system implementation
metadata:
  type: reference
  date: 2026-07-19
  file: docs/api/health-metrics.md
---

# Health Metrics Module — Snapshot (2026-07-19)

## Three Endpoints (all authenticated, no authorization)

1. **GET /api/health-metrics/:patientId** — List metrics with optional type/date filters
2. **GET /api/health-metrics/:patientId/summary** — Statistical summary (latest, avg, min, max, trend, status)
3. **POST /api/health-metrics** — Create new metric + auto-generate notification if warning/critical

## Security: IDOR Vulnerability (Known)

- ✅ `authenticate` middleware present on all endpoints
- ❌ NO `authorize()` role check
- ❌ NO verification that `patientId` belongs to authenticated user
- **Result:** Any authenticated user can read/write metrics for any patient

## Metric Classifications

All values auto-classified against ranges in `metrics.service.ts`:

| Type              | Normal    | Warning           | Critical         |
| ----------------- | --------- | ----------------- | ---------------- |
| blood_pressure    | 90–120    | 121–140 / <90     | >140 / <80       |
| glucose           | 70–100    | 101–125 / <70     | >125 / <54       |
| heart_rate        | 60–100    | 101–120 / 50–59   | >120 / <50       |
| temperature       | 36.1–37.2 | 37.3–38.0 / <36.0 | >38.0 / <35.5    |
| oxygen_saturation | 95–100    | 90–94             | <90              |
| weight            | —         | —                 | — (never alerts) |

## Key DEBT/FIXME Comments

1. **N+1 query in `getPatientSummary()`** — 6 separate queries, should use GROUP BY
2. **Missing `secondary_value` validation** — blood_pressure records can be created without diastolic
3. **Incomplete notification context** — Alert message says "Nivel de glucosa fuera de rango" instead of "Glucosa: 145 mg/dL (crítico)"

## When fixing IDOR or adding new alerts

[[health_metrics_snapshot]] should be read to understand current behavior for comparison.
