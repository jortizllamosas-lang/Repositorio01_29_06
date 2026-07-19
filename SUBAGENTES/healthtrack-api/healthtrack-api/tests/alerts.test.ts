import { describe, it, expect } from "vitest";
import {
  createAlertIfOutOfRange,
  getAlertsByPatient,
  acknowledgeAlert,
} from "../src/alerts/alerts.service";
import {
  checkMetricStatus,
  createMetric,
} from "../src/health-metrics/metrics.service";
import { createTestUser, createTestPatient, createTestMetric } from "./setup";
import type { TokenPayload } from "../src/auth/auth.types";
import type { MetricType } from "../src/health-metrics/metrics.types";

describe("Alerts Service", () => {
  describe("createAlertIfOutOfRange", () => {
    it("should create an alert when status is warning or critical", () => {
      const patUser = createTestUser({
        email: "p1@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 1",
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({
        patientId,
        metricType: "glucose",
        value: 150,
        unit: "mg/dL",
      });

      const alert = createAlertIfOutOfRange(
        metricId,
        patientId,
        "glucose",
        150,
        "critical",
      );

      expect(alert).not.toBeNull();
      expect(alert!.severity).toBe("critical");
      expect(alert!.metric_type).toBe("glucose");
      expect(alert!.acknowledged).toBe(0);
    });

    it("should not create an alert when status is normal", () => {
      const patUser = createTestUser({
        email: "p2@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 2",
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({
        patientId,
        metricType: "glucose",
        value: 90,
        unit: "mg/dL",
      });

      const alert = createAlertIfOutOfRange(
        metricId,
        patientId,
        "glucose",
        90,
        "normal",
      );

      expect(alert).toBeNull();
    });
  });

  describe("getAlertsByPatient", () => {
    it("should return alerts for admin", () => {
      const adminUser = createTestUser({
        email: "admin@test.com",
        password: "pass",
        role: "admin",
        name: "Admin",
      });
      const patUser = createTestUser({
        email: "p3@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 3",
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({
        patientId,
        metricType: "heart_rate",
        value: 130,
        unit: "bpm",
      });
      createAlertIfOutOfRange(
        metricId,
        patientId,
        "heart_rate",
        130,
        "critical",
      );

      const adminPayload: TokenPayload = {
        userId: adminUser,
        email: "admin@test.com",
        role: "admin",
        name: "Admin",
      };
      const alerts = getAlertsByPatient(patientId, adminPayload);

      expect(alerts).not.toBeNull();
      expect(alerts).toHaveLength(1);
    });

    it("should return alerts for the assigned doctor", () => {
      const doctorUser = createTestUser({
        email: "doc@test.com",
        password: "pass",
        role: "doctor",
        name: "Doctor",
      });
      const patUser = createTestUser({
        email: "p4@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 4",
      });
      const patientId = createTestPatient({
        userId: patUser,
        doctorId: doctorUser,
      });
      const metricId = createTestMetric({
        patientId,
        metricType: "glucose",
        value: 150,
        unit: "mg/dL",
      });
      createAlertIfOutOfRange(metricId, patientId, "glucose", 150, "critical");

      const doctorPayload: TokenPayload = {
        userId: doctorUser,
        email: "doc@test.com",
        role: "doctor",
        name: "Doctor",
      };
      const alerts = getAlertsByPatient(patientId, doctorPayload);

      expect(alerts).not.toBeNull();
      expect(alerts).toHaveLength(1);
    });

    it("should return null for a doctor not assigned to the patient (IDOR protection)", () => {
      const doctorUser = createTestUser({
        email: "doc2@test.com",
        password: "pass",
        role: "doctor",
        name: "Doctor 2",
      });
      const otherDoctor = createTestUser({
        email: "doc3@test.com",
        password: "pass",
        role: "doctor",
        name: "Doctor 3",
      });
      const patUser = createTestUser({
        email: "p5@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 5",
      });
      const patientId = createTestPatient({
        userId: patUser,
        doctorId: otherDoctor,
      });

      const doctorPayload: TokenPayload = {
        userId: doctorUser,
        email: "doc2@test.com",
        role: "doctor",
        name: "Doctor 2",
      };
      const alerts = getAlertsByPatient(patientId, doctorPayload);

      expect(alerts).toBeNull();
    });

    it("should return null for a different patient (IDOR protection)", () => {
      const patUser1 = createTestUser({
        email: "p6@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 6",
      });
      const patUser2 = createTestUser({
        email: "p7@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 7",
      });
      const patientId1 = createTestPatient({ userId: patUser1 });

      const patient2Payload: TokenPayload = {
        userId: patUser2,
        email: "p7@test.com",
        role: "patient",
        name: "Pat 7",
      };
      const alerts = getAlertsByPatient(patientId1, patient2Payload);

      expect(alerts).toBeNull();
    });

    it("should return null for a non-existent patient", () => {
      const adminUser = createTestUser({
        email: "admin2@test.com",
        password: "pass",
        role: "admin",
        name: "Admin",
      });
      const adminPayload: TokenPayload = {
        userId: adminUser,
        email: "admin2@test.com",
        role: "admin",
        name: "Admin",
      };

      const alerts = getAlertsByPatient(99999, adminPayload);

      expect(alerts).toBeNull();
    });
  });

  describe("acknowledgeAlert", () => {
    // Product decision (2026-07-19, security finding #20): `acknowledged` has clinical
    // semantics (a professional reviewed the alert), so a patient can never acknowledge
    // it, not even their own. This replaces the old test that expected the opposite.
    it("should NOT allow a patient to acknowledge their own alert", () => {
      const patUser = createTestUser({
        email: "p8@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 8",
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({
        patientId,
        metricType: "temperature",
        value: 39,
        unit: "°C",
      });
      const created = createAlertIfOutOfRange(
        metricId,
        patientId,
        "temperature",
        39,
        "critical",
      )!;

      const patientPayload: TokenPayload = {
        userId: patUser,
        email: "p8@test.com",
        role: "patient",
        name: "Pat 8",
      };
      const result = acknowledgeAlert(created.id, patientPayload);

      expect(result).toBeNull();
    });

    it("should return null when the user has no access to the alert", () => {
      const patUser1 = createTestUser({
        email: "p9@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 9",
      });
      const patUser2 = createTestUser({
        email: "p10@test.com",
        password: "pass",
        role: "patient",
        name: "Pat 10",
      });
      const patientId = createTestPatient({ userId: patUser1 });
      const metricId = createTestMetric({
        patientId,
        metricType: "glucose",
        value: 150,
        unit: "mg/dL",
      });
      const created = createAlertIfOutOfRange(
        metricId,
        patientId,
        "glucose",
        150,
        "critical",
      )!;

      const otherPatientPayload: TokenPayload = {
        userId: patUser2,
        email: "p10@test.com",
        role: "patient",
        name: "Pat 10",
      };
      const result = acknowledgeAlert(created.id, otherPatientPayload);

      expect(result).toBeNull();
    });

    it("should return null for a non-existent alert", () => {
      const adminUser = createTestUser({
        email: "admin3@test.com",
        password: "pass",
        role: "admin",
        name: "Admin",
      });
      const adminPayload: TokenPayload = {
        userId: adminUser,
        email: "admin3@test.com",
        role: "admin",
        name: "Admin",
      };

      const result = acknowledgeAlert(99999, adminPayload);

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Boundary values: checkMetricStatus() (metrics.service.ts) is the actual
  // source of truth for warning/critical classification; createAlertIfOutOfRange()
  // only inserts based on the status it's given. Testing both together here
  // catches a `<` vs `<=` mistake in either function, at every exact limit from
  // the CLAUDE.md range table.
  // ---------------------------------------------------------------------
  describe("boundary values (checkMetricStatus + createAlertIfOutOfRange integration)", () => {
    let boundaryCounter = 0;

    function setupPatientWithMetric(
      metricType: MetricType,
      value: number,
      unit: string,
    ) {
      boundaryCounter++;
      const patUser = createTestUser({
        email: `boundary${boundaryCounter}@test.com`,
        password: "pass",
        role: "patient",
        name: `Boundary Patient ${boundaryCounter}`,
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({ patientId, metricType, value, unit });
      return { patientId, metricId };
    }

    const cases: [
      MetricType,
      number,
      "normal" | "warning" | "critical",
      string,
    ][] = [
      // glucose (mg/dL) — normal 70-100, warning 101-125 / <70, critical >125 / <54
      ["glucose", 100, "normal", "mg/dL"],
      ["glucose", 101, "warning", "mg/dL"],
      ["glucose", 70, "normal", "mg/dL"],
      ["glucose", 69, "warning", "mg/dL"],
      ["glucose", 125, "warning", "mg/dL"],
      ["glucose", 126, "critical", "mg/dL"],
      ["glucose", 54, "warning", "mg/dL"],
      ["glucose", 53, "critical", "mg/dL"],
      // blood_pressure (systolic, mmHg) — normal 90-120, warning 121-140 / <90, critical >140 / <80
      // NOTE: these cases call checkMetricStatus() with only the primary `value` (systolic),
      // i.e. no secondaryValue argument, so they exercise the systolic-only code path.
      // See the dedicated describe block below for diastolic (secondary_value) classification
      // and the combined systolic+diastolic "worst of the two" behavior.
      ["blood_pressure", 120, "normal", "mmHg"],
      ["blood_pressure", 121, "warning", "mmHg"],
      ["blood_pressure", 90, "normal", "mmHg"],
      ["blood_pressure", 89, "warning", "mmHg"],
      ["blood_pressure", 140, "warning", "mmHg"],
      ["blood_pressure", 141, "critical", "mmHg"],
      ["blood_pressure", 80, "warning", "mmHg"],
      ["blood_pressure", 79, "critical", "mmHg"],
      // heart_rate (bpm) — normal 60-100, warning 101-120 / 50-59, critical >120 / <50
      ["heart_rate", 100, "normal", "bpm"],
      ["heart_rate", 101, "warning", "bpm"],
      ["heart_rate", 60, "normal", "bpm"],
      ["heart_rate", 59, "warning", "bpm"],
      ["heart_rate", 120, "warning", "bpm"],
      ["heart_rate", 121, "critical", "bpm"],
      ["heart_rate", 50, "warning", "bpm"],
      ["heart_rate", 49, "critical", "bpm"],
      // temperature (°C) — normal 36.1-37.2, warning 37.3-38.0 / <36.0, critical >38.0 / <35.5
      ["temperature", 37.2, "normal", "°C"],
      ["temperature", 37.3, "warning", "°C"],
      ["temperature", 36.1, "normal", "°C"],
      ["temperature", 36.0, "warning", "°C"],
      ["temperature", 38.0, "warning", "°C"],
      ["temperature", 38.1, "critical", "°C"],
      ["temperature", 35.5, "warning", "°C"],
      ["temperature", 35.4, "critical", "°C"],
      // oxygen_saturation (%) — normal 95-100, warning 90-94, critical <90 (no upper critical/warning)
      ["oxygen_saturation", 95, "normal", "%"],
      ["oxygen_saturation", 94, "warning", "%"],
      ["oxygen_saturation", 100, "normal", "%"],
      ["oxygen_saturation", 90, "warning", "%"],
      ["oxygen_saturation", 89, "critical", "%"],
    ];

    it.each(cases)(
      "should classify %s value %f as %s and create/skip the alert accordingly",
      (metricType, value, expectedStatus, unit) => {
        const status = checkMetricStatus(metricType, value);
        expect(status).toBe(expectedStatus);

        const { patientId, metricId } = setupPatientWithMetric(
          metricType,
          value,
          unit,
        );
        const alert = createAlertIfOutOfRange(
          metricId,
          patientId,
          metricType,
          value,
          status,
        );

        if (expectedStatus === "normal") {
          expect(alert).toBeNull();
        } else {
          expect(alert).not.toBeNull();
          expect(alert!.severity).toBe(expectedStatus);
          expect(alert!.metric_type).toBe(metricType);
          expect(alert!.value).toBe(value);
          expect(alert!.acknowledged).toBe(0);
        }
      },
    );

    it("should never classify weight as warning/critical (weight never generates alerts)", () => {
      expect(checkMetricStatus("weight", 5)).toBe("normal");
      expect(checkMetricStatus("weight", 500)).toBe("normal");
      expect(checkMetricStatus("weight", -100)).toBe("normal");
    });

    it("should not insert an alert row for a normal weight metric even when explicitly attempted", () => {
      const { patientId, metricId } = setupPatientWithMetric(
        "weight",
        70,
        "kg",
      );
      const status = checkMetricStatus("weight", 70);
      const alert = createAlertIfOutOfRange(
        metricId,
        patientId,
        "weight",
        70,
        status,
      );
      expect(alert).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Regression test for a real patient-safety bug found while writing boundary
  // tests (2026-07-19): blood_pressure metrics store systolic in `value` and
  // diastolic in `secondary_value`, but checkMetricStatus()/createMetric() used
  // to only ever evaluate `value` (systolic), silently dropping dangerously
  // abnormal diastolic readings paired with a normal systolic. This has been
  // fixed: checkMetricStatus() now also evaluates secondary_value (diastolic)
  // and returns the worse of the two statuses.
  // ---------------------------------------------------------------------
  describe("Fix: createMetric() now evaluates diastolic (secondary_value) for blood_pressure alerts", () => {
    it("should create a critical alert when diastolic is critical but systolic is normal", () => {
      const patUser = createTestUser({
        email: "bp-diastolic@test.com",
        password: "pass",
        role: "patient",
        name: "BP Diastolic Patient",
      });
      const patientId = createTestPatient({ userId: patUser });

      // systolic 110 -> normal (90-120); diastolic 130 -> critical per CLAUDE.md (>90).
      createMetric(
        {
          patient_id: patientId,
          metric_type: "blood_pressure",
          value: 110,
          secondary_value: 130,
          unit: "mmHg",
          recorded_at: new Date().toISOString(),
        },
        patUser,
      );

      const patientPayload: TokenPayload = {
        userId: patUser,
        email: "bp-diastolic@test.com",
        role: "patient",
        name: "BP Diastolic Patient",
      };
      const alerts = getAlertsByPatient(patientId, patientPayload);

      expect(alerts).not.toBeNull();
      expect(alerts).toHaveLength(1);
      expect(alerts![0].severity).toBe("critical");
      expect(alerts![0].metric_type).toBe("blood_pressure");
    });

    it("should keep the systolic status when it is worse than the diastolic status", () => {
      // systolic 150 -> critical (>140); diastolic 70 -> normal (60-80).
      const status = checkMetricStatus("blood_pressure", 150, 70);
      expect(status).toBe("critical");
    });

    it("should fall back to systolic-only classification when no secondaryValue is provided", () => {
      expect(checkMetricStatus("blood_pressure", 110)).toBe("normal");
      expect(checkMetricStatus("blood_pressure", 150)).toBe("critical");
    });
  });

  // ---------------------------------------------------------------------
  // Diastolic-only boundary values for checkMetricStatus() — normal 60-80,
  // warning 81-90 / <60, critical >90 / <50 (systolic held fixed at 110, normal,
  // so the diastolic status is always the one that determines the outcome).
  // ---------------------------------------------------------------------
  describe("checkMetricStatus — diastolic (secondary_value) boundary values", () => {
    const diastolicCases: [number, "normal" | "warning" | "critical"][] = [
      [80, "normal"],
      [81, "warning"],
      [60, "normal"],
      [59, "warning"],
      [90, "warning"],
      [91, "critical"],
      [50, "warning"],
      [49, "critical"],
    ];

    it.each(diastolicCases)(
      "should classify diastolic value %f as %s (systolic fixed at 110, normal)",
      (diastolicValue, expectedStatus) => {
        expect(checkMetricStatus("blood_pressure", 110, diastolicValue)).toBe(
          expectedStatus,
        );
      },
    );

    it("should create an alert with the diastolic-derived status via the full createMetric() flow", () => {
      const patUser = createTestUser({
        email: "bp-diastolic-boundary@test.com",
        password: "pass",
        role: "patient",
        name: "BP Diastolic Boundary Patient",
      });
      const patientId = createTestPatient({ userId: patUser });

      createMetric(
        {
          patient_id: patientId,
          metric_type: "blood_pressure",
          value: 110,
          secondary_value: 91,
          unit: "mmHg",
          recorded_at: new Date().toISOString(),
        },
        patUser,
      );

      const patientPayload: TokenPayload = {
        userId: patUser,
        email: "bp-diastolic-boundary@test.com",
        role: "patient",
        name: "BP Diastolic Boundary Patient",
      };
      const alerts = getAlertsByPatient(patientId, patientPayload);

      expect(alerts).not.toBeNull();
      expect(alerts).toHaveLength(1);
      expect(alerts![0].severity).toBe("critical");
    });
  });

  describe("getAlertsByPatient — exhaustive authorization", () => {
    it("should let a patient view their own alerts", () => {
      const patUser = createTestUser({
        email: "own-alerts@test.com",
        password: "pass",
        role: "patient",
        name: "Own Alerts Patient",
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({
        patientId,
        metricType: "oxygen_saturation",
        value: 88,
        unit: "%",
      });
      createAlertIfOutOfRange(
        metricId,
        patientId,
        "oxygen_saturation",
        88,
        "critical",
      );

      const patientPayload: TokenPayload = {
        userId: patUser,
        email: "own-alerts@test.com",
        role: "patient",
        name: "Own Alerts Patient",
      };
      const alerts = getAlertsByPatient(patientId, patientPayload);

      expect(alerts).not.toBeNull();
      expect(alerts).toHaveLength(1);
      expect(alerts![0].metric_type).toBe("oxygen_saturation");
    });

    it("should return null for a doctor when the patient has no assigned doctor at all", () => {
      const doctorUser = createTestUser({
        email: "unassigned-doc@test.com",
        password: "pass",
        role: "doctor",
        name: "Unassigned Doctor",
      });
      const patUser = createTestUser({
        email: "no-doctor-patient@test.com",
        password: "pass",
        role: "patient",
        name: "No Doctor Patient",
      });
      // No doctorId passed -> assigned_doctor_id is NULL
      const patientId = createTestPatient({ userId: patUser });

      const doctorPayload: TokenPayload = {
        userId: doctorUser,
        email: "unassigned-doc@test.com",
        role: "doctor",
        name: "Unassigned Doctor",
      };
      const alerts = getAlertsByPatient(patientId, doctorPayload);

      expect(alerts).toBeNull();
    });

    it("should return an empty array (not null) for a patient that exists but has no alerts", () => {
      const adminUser = createTestUser({
        email: "admin-empty@test.com",
        password: "pass",
        role: "admin",
        name: "Admin Empty",
      });
      const patUser = createTestUser({
        email: "no-alerts-patient@test.com",
        password: "pass",
        role: "patient",
        name: "No Alerts Patient",
      });
      const patientId = createTestPatient({ userId: patUser });

      const adminPayload: TokenPayload = {
        userId: adminUser,
        email: "admin-empty@test.com",
        role: "admin",
        name: "Admin Empty",
      };
      const alerts = getAlertsByPatient(patientId, adminPayload);

      expect(alerts).not.toBeNull();
      expect(alerts).toEqual([]);
    });
  });

  describe("acknowledgeAlert — exhaustive authorization", () => {
    it("should let the assigned doctor acknowledge an alert", () => {
      const doctorUser = createTestUser({
        email: "ack-doc@test.com",
        password: "pass",
        role: "doctor",
        name: "Ack Doctor",
      });
      const patUser = createTestUser({
        email: "ack-patient@test.com",
        password: "pass",
        role: "patient",
        name: "Ack Patient",
      });
      const patientId = createTestPatient({
        userId: patUser,
        doctorId: doctorUser,
      });
      const metricId = createTestMetric({
        patientId,
        metricType: "heart_rate",
        value: 130,
        unit: "bpm",
      });
      const created = createAlertIfOutOfRange(
        metricId,
        patientId,
        "heart_rate",
        130,
        "critical",
      )!;

      const doctorPayload: TokenPayload = {
        userId: doctorUser,
        email: "ack-doc@test.com",
        role: "doctor",
        name: "Ack Doctor",
      };
      const result = acknowledgeAlert(created.id, doctorPayload);

      expect(result).not.toBeNull();
      expect(result!.acknowledged).toBe(1);
    });

    it("should return null when a doctor not assigned to the patient tries to acknowledge", () => {
      const assignedDoctor = createTestUser({
        email: "assigned-doc@test.com",
        password: "pass",
        role: "doctor",
        name: "Assigned Doctor",
      });
      const otherDoctor = createTestUser({
        email: "other-doc@test.com",
        password: "pass",
        role: "doctor",
        name: "Other Doctor",
      });
      const patUser = createTestUser({
        email: "ack-patient2@test.com",
        password: "pass",
        role: "patient",
        name: "Ack Patient 2",
      });
      const patientId = createTestPatient({
        userId: patUser,
        doctorId: assignedDoctor,
      });
      const metricId = createTestMetric({
        patientId,
        metricType: "glucose",
        value: 40,
        unit: "mg/dL",
      });
      const created = createAlertIfOutOfRange(
        metricId,
        patientId,
        "glucose",
        40,
        "critical",
      )!;

      const otherDoctorPayload: TokenPayload = {
        userId: otherDoctor,
        email: "other-doc@test.com",
        role: "doctor",
        name: "Other Doctor",
      };
      const result = acknowledgeAlert(created.id, otherDoctorPayload);

      expect(result).toBeNull();
    });

    it("should let an admin acknowledge any patient's alert", () => {
      const adminUser = createTestUser({
        email: "ack-admin@test.com",
        password: "pass",
        role: "admin",
        name: "Ack Admin",
      });
      const patUser = createTestUser({
        email: "ack-patient3@test.com",
        password: "pass",
        role: "patient",
        name: "Ack Patient 3",
      });
      const patientId = createTestPatient({ userId: patUser });
      const metricId = createTestMetric({
        patientId,
        metricType: "temperature",
        value: 35,
        unit: "°C",
      });
      const created = createAlertIfOutOfRange(
        metricId,
        patientId,
        "temperature",
        35,
        "critical",
      )!;

      const adminPayload: TokenPayload = {
        userId: adminUser,
        email: "ack-admin@test.com",
        role: "admin",
        name: "Ack Admin",
      };
      const result = acknowledgeAlert(created.id, adminPayload);

      expect(result).not.toBeNull();
      expect(result!.acknowledged).toBe(1);
    });

    it("should flip acknowledged from 0 to 1 (via the assigned doctor) and reflect it on a subsequent getAlertsByPatient query for the patient", () => {
      const doctorUser = createTestUser({
        email: "persist-ack-doc@test.com",
        password: "pass",
        role: "doctor",
        name: "Persist Ack Doctor",
      });
      const patUser = createTestUser({
        email: "persist-ack@test.com",
        password: "pass",
        role: "patient",
        name: "Persist Ack Patient",
      });
      const patientId = createTestPatient({
        userId: patUser,
        doctorId: doctorUser,
      });
      const metricId = createTestMetric({
        patientId,
        metricType: "glucose",
        value: 150,
        unit: "mg/dL",
      });
      const created = createAlertIfOutOfRange(
        metricId,
        patientId,
        "glucose",
        150,
        "critical",
      )!;
      expect(created.acknowledged).toBe(0);

      const patientPayload: TokenPayload = {
        userId: patUser,
        email: "persist-ack@test.com",
        role: "patient",
        name: "Persist Ack Patient",
      };
      const doctorPayload: TokenPayload = {
        userId: doctorUser,
        email: "persist-ack-doc@test.com",
        role: "doctor",
        name: "Persist Ack Doctor",
      };

      // The patient can still view their own (unacknowledged) alert.
      const beforeAck = getAlertsByPatient(patientId, patientPayload);
      expect(beforeAck).not.toBeNull();
      expect(beforeAck![0].acknowledged).toBe(0);

      // Only the assigned doctor (not the patient) can acknowledge it.
      const acknowledged = acknowledgeAlert(created.id, doctorPayload);
      expect(acknowledged).not.toBeNull();
      expect(acknowledged!.acknowledged).toBe(1);

      const afterAck = getAlertsByPatient(patientId, patientPayload);
      expect(afterAck).not.toBeNull();
      expect(afterAck).toHaveLength(1);
      expect(afterAck![0].acknowledged).toBe(1);
      expect(afterAck![0].id).toBe(created.id);
    });
  });
});
