import { describe, it, expect } from "vitest";
import { canAccessPatient } from "../src/patients/patients.access";
import {
  createMetric,
  getMetricsByPatient,
} from "../src/health-metrics/metrics.service";
import { createTestUser, createTestPatient } from "./setup";
import type { TokenPayload } from "../src/auth/auth.types";
import type { CreateMetricDTO } from "../src/health-metrics/metrics.types";

/**
 * Simula el flujo real de POST /api/health-metrics (metrics.routes.ts):
 * primero verifica canAccessPatient() y, solo si retorna true, llama a createMetric().
 * Esto reproduce a nivel de servicio la protección IDOR aplicada en la ruta, sin
 * necesitar un servidor HTTP levantado (los demás tests del proyecto siguen el
 * mismo patrón de probar a nivel de servicio).
 */
function submitMetric(
  dto: CreateMetricDTO,
  user: TokenPayload,
):
  | { ok: true; metric: ReturnType<typeof createMetric> }
  | { ok: false; status: 404 } {
  if (!canAccessPatient(dto.patient_id, user)) {
    return { ok: false, status: 404 };
  }
  return { ok: true, metric: createMetric(dto, user.userId) };
}

describe("Health Metrics — IDOR protection on POST /api/health-metrics", () => {
  it("should NOT allow a patient to create a metric for another patient's patient_id", () => {
    const patUser1 = createTestUser({
      email: "victim@test.com",
      password: "pass",
      role: "patient",
      name: "Victim Patient",
    });
    const patUser2 = createTestUser({
      email: "attacker@test.com",
      password: "pass",
      role: "patient",
      name: "Attacker Patient",
    });
    const victimPatientId = createTestPatient({ userId: patUser1 });
    createTestPatient({ userId: patUser2 });

    const attackerPayload: TokenPayload = {
      userId: patUser2,
      email: "attacker@test.com",
      role: "patient",
      name: "Attacker Patient",
    };

    expect(canAccessPatient(victimPatientId, attackerPayload)).toBe(false);

    const result = submitMetric(
      {
        patient_id: victimPatientId,
        metric_type: "glucose",
        value: 150,
        unit: "mg/dL",
        recorded_at: new Date().toISOString(),
      },
      attackerPayload,
    );

    expect(result.ok).toBe(false);

    // Confirmar que no se insertó ninguna métrica ni se disparó una alerta falsa
    // a nombre del paciente víctima.
    const metrics = getMetricsByPatient(victimPatientId, {});
    expect(metrics).toHaveLength(0);
  });

  it("should allow an assigned doctor to create a metric for their own assigned patient", () => {
    const doctorUser = createTestUser({
      email: "assigned-doc@test.com",
      password: "pass",
      role: "doctor",
      name: "Assigned Doctor",
    });
    const patUser = createTestUser({
      email: "doc-patient@test.com",
      password: "pass",
      role: "patient",
      name: "Doctor's Patient",
    });
    const patientId = createTestPatient({
      userId: patUser,
      doctorId: doctorUser,
    });

    const doctorPayload: TokenPayload = {
      userId: doctorUser,
      email: "assigned-doc@test.com",
      role: "doctor",
      name: "Assigned Doctor",
    };

    expect(canAccessPatient(patientId, doctorPayload)).toBe(true);

    const result = submitMetric(
      {
        patient_id: patientId,
        metric_type: "heart_rate",
        value: 75,
        unit: "bpm",
        recorded_at: new Date().toISOString(),
      },
      doctorPayload,
    );

    expect(result.ok).toBe(true);
    const metrics = getMetricsByPatient(patientId, {});
    expect(metrics).toHaveLength(1);
  });

  it("should NOT allow a doctor who is not assigned to the patient to create a metric for them", () => {
    const assignedDoctor = createTestUser({
      email: "real-doc@test.com",
      password: "pass",
      role: "doctor",
      name: "Real Doctor",
    });
    const otherDoctor = createTestUser({
      email: "other-doc@test.com",
      password: "pass",
      role: "doctor",
      name: "Other Doctor",
    });
    const patUser = createTestUser({
      email: "not-your-patient@test.com",
      password: "pass",
      role: "patient",
      name: "Not Your Patient",
    });
    const patientId = createTestPatient({
      userId: patUser,
      doctorId: assignedDoctor,
    });

    const otherDoctorPayload: TokenPayload = {
      userId: otherDoctor,
      email: "other-doc@test.com",
      role: "doctor",
      name: "Other Doctor",
    };

    expect(canAccessPatient(patientId, otherDoctorPayload)).toBe(false);

    const result = submitMetric(
      {
        patient_id: patientId,
        metric_type: "weight",
        value: 70,
        unit: "kg",
        recorded_at: new Date().toISOString(),
      },
      otherDoctorPayload,
    );

    expect(result.ok).toBe(false);
    const metrics = getMetricsByPatient(patientId, {});
    expect(metrics).toHaveLength(0);
  });

  it("should allow an admin to create a metric for any patient", () => {
    const adminUser = createTestUser({
      email: "admin-metrics@test.com",
      password: "pass",
      role: "admin",
      name: "Admin",
    });
    const patUser = createTestUser({
      email: "admin-target-patient@test.com",
      password: "pass",
      role: "patient",
      name: "Admin Target Patient",
    });
    const patientId = createTestPatient({ userId: patUser });

    const adminPayload: TokenPayload = {
      userId: adminUser,
      email: "admin-metrics@test.com",
      role: "admin",
      name: "Admin",
    };

    expect(canAccessPatient(patientId, adminPayload)).toBe(true);

    const result = submitMetric(
      {
        patient_id: patientId,
        metric_type: "oxygen_saturation",
        value: 97,
        unit: "%",
        recorded_at: new Date().toISOString(),
      },
      adminPayload,
    );

    expect(result.ok).toBe(true);
    const metrics = getMetricsByPatient(patientId, {});
    expect(metrics).toHaveLength(1);
  });

  it("should allow a patient to create a metric for themselves (legitimate self-tracking use case)", () => {
    const patUser = createTestUser({
      email: "self-tracking@test.com",
      password: "pass",
      role: "patient",
      name: "Self Tracking Patient",
    });
    const patientId = createTestPatient({ userId: patUser });

    const patientPayload: TokenPayload = {
      userId: patUser,
      email: "self-tracking@test.com",
      role: "patient",
      name: "Self Tracking Patient",
    };

    expect(canAccessPatient(patientId, patientPayload)).toBe(true);

    const result = submitMetric(
      {
        patient_id: patientId,
        metric_type: "temperature",
        value: 36.8,
        unit: "°C",
        recorded_at: new Date().toISOString(),
      },
      patientPayload,
    );

    expect(result.ok).toBe(true);
    const metrics = getMetricsByPatient(patientId, {});
    expect(metrics).toHaveLength(1);
    expect(metrics[0].metric_type).toBe("temperature");
  });

  it("should return false (and not leak existence) for a non-existent patient_id", () => {
    const patUser = createTestUser({
      email: "nonexistent-target@test.com",
      password: "pass",
      role: "patient",
      name: "Some Patient",
    });
    const patientPayload: TokenPayload = {
      userId: patUser,
      email: "nonexistent-target@test.com",
      role: "patient",
      name: "Some Patient",
    };

    expect(canAccessPatient(99999, patientPayload)).toBe(false);
  });
});
