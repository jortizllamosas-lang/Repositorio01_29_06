import { getDb } from "../database/connection";
import type { Alert } from "./alerts.types";
import type { MetricType } from "../health-metrics/metrics.types";
import type { TokenPayload } from "../auth/auth.types";
import { canAccessPatient } from "../patients/patients.access";

/**
 * Crea una alerta si el status calculado por checkMetricStatus() está fuera de rango
 * (warning o critical). No duplica la lógica de rangos: recibe el status ya calculado.
 * @param metricId ID de la métrica de salud recién creada.
 * @param patientId ID del paciente al que pertenece la métrica.
 * @param metricType Tipo de métrica registrada.
 * @param value Valor registrado.
 * @param status Status ya calculado por checkMetricStatus() en metrics.service.ts.
 * @returns La alerta creada, o null si el status es 'normal' y no se crea alerta.
 */
export function createAlertIfOutOfRange(
  metricId: number,
  patientId: number,
  metricType: MetricType,
  value: number,
  status: "normal" | "warning" | "critical",
): Alert | null {
  if (status === "normal") return null;

  const db = getDb();

  const result = db
    .prepare(
      `
    INSERT INTO alerts (patient_id, metric_id, metric_type, value, severity)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .run(patientId, metricId, metricType, value, status);

  return db
    .prepare("SELECT * FROM alerts WHERE id = ?")
    .get(result.lastInsertRowid) as Alert;
}

/**
 * Obtiene las alertas de un paciente aplicando control de acceso por rol.
 * @param patientId ID del paciente cuyas alertas se solicitan.
 * @param user Payload del token del usuario autenticado.
 * @returns Array de alertas (puede estar vacío), o null si el paciente no existe
 * o el usuario no tiene acceso (para que la ruta traduzca esto a 404 sin filtrar existencia).
 */
export function getAlertsByPatient(
  patientId: number,
  user: TokenPayload,
): Alert[] | null {
  if (!canAccessPatient(patientId, user)) return null;

  const db = getDb();

  return db
    .prepare(
      `
    SELECT al.*, u.name as patient_name
    FROM alerts al
    JOIN patients p ON al.patient_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE al.patient_id = ?
    ORDER BY al.created_at DESC
  `,
    )
    .all(patientId) as Alert[];
}

/**
 * Marca una alerta como reconocida (acknowledged), aplicando control de acceso por rol
 * resuelto vía el patient_id de la alerta.
 *
 * Nota de producto: `acknowledged` tiene semántica clínica (confirma que un profesional
 * revisó la alerta), por lo que un `patient` NUNCA puede reconocer una alerta, ni siquiera
 * la suya propia. La ruta (`alerts.routes.ts`) ya aplica `authorize('admin','doctor')`
 * antes de llegar aquí, pero se repite la verificación de rol en el service como defensa
 * en profundidad, por si esta función se invoca alguna vez desde otro punto de entrada.
 *
 * @param alertId ID de la alerta a reconocer.
 * @param user Payload del token del usuario autenticado.
 * @returns La alerta actualizada, o null si no existe, el usuario es un `patient`,
 * o el usuario no tiene acceso al paciente dueño de la alerta.
 */
export function acknowledgeAlert(
  alertId: number,
  user: TokenPayload,
): Alert | null {
  if (user.role === "patient") return null;

  const db = getDb();

  const alert = db.prepare("SELECT * FROM alerts WHERE id = ?").get(alertId) as
    Alert | undefined;
  if (!alert) return null;

  if (!canAccessPatient(alert.patient_id, user)) return null;

  db.prepare("UPDATE alerts SET acknowledged = 1 WHERE id = ?").run(alertId);

  return db
    .prepare(
      `
    SELECT al.*, u.name as patient_name
    FROM alerts al
    JOIN patients p ON al.patient_id = p.id
    JOIN users u ON p.user_id = u.id
    WHERE al.id = ?
  `,
    )
    .get(alertId) as Alert;
}
