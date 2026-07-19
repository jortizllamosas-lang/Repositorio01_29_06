---
name: alerts_endpoints_documented
description: 2 endpoints for alerts system documented (GET list, PATCH acknowledge); properly implements role-based authorization unlike health-metrics IDOR
metadata:
  type: project
---

**Completion date:** 2026-07-19

## Documentation Complete: Alerts API

Documented 2 new endpoints in `docs/api/alerts.md`:

1. **GET /api/alerts/:patientId** — List all alerts for a patient
   - Full role-based authorization implemented (admin, doctor with assignment check, patient self-only)
   - Returns 404 for both "not found" and "no access" to prevent information leakage
   - Includes auto-enriched `patient_name` field via JOIN

2. **PATCH /api/alerts/:id/acknowledge** — Mark alert as reviewed by doctor
   - Same authorization model as GET
   - Immutable except for `acknowledged` boolean field
   - Returns full alert object post-update

## Key Implementation Notes

- **Alert model:** Stores `metric_id` (FK to health_metrics), `metric_type` (redundant for fast queries), `value`, `severity` (warning|critical), `acknowledged` (0|1)

- **Auto-generation:** Alerts created automatically and **only forward** when metric recorded via `POST /api/health-metrics`
  - Leverages `checkMetricStatus()` from metrics.service.ts
  - For blood_pressure: evaluates BOTH systolic AND diastolic against separate ranges (recent fix — was systolic-only before)

- **Authorization implementation:** Function `canAccessPatient()` in alerts.service.ts exactly mirrors the patient authorization logic
  - ✅ Properly implemented (unlike health-metrics IDOR)

- **Known upstream vulnerability:** `POST /api/health-metrics` has IDOR flaw (anyone can POST for anyone), which means alerts can be generated falsely for other patients. This is documented but not in alerts module's scope to fix.

## Documentation Format

Follows consistent structure with health-metrics.md:

- Method + URL
- Plain language description
- Auth + authorization rules (explicit contrast: "✅ Implemented correctly" vs health-metrics "❌ IDOR")
- Path/body parameters with validation
- 200/201 success response with real example JSON
- Error responses (400, 401, 404 with reason, 500)
- curl examples
- Cross-role examples showing access control
- PII fields table
- Audit logging notes
- Complete workflow example with different roles
- Comparison table to health-metrics
- Future enhancement suggestions

Location: `docs/api/alerts.md` — ~600 lines, production-ready
