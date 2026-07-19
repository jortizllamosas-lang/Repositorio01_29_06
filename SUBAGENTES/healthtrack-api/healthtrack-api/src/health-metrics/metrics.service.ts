import { getDb } from "../database/connection";
import type {
  HealthMetric,
  CreateMetricDTO,
  MetricSummary,
  MetricType,
  MetricRange,
} from "./metrics.types";
import { createNotification } from "../notifications/notifications.service";
import { createAlertIfOutOfRange } from "../alerts/alerts.service";

// Rangos normales de métricas de salud
const METRIC_RANGES: Partial<Record<MetricType, MetricRange>> = {
  blood_pressure: {
    normalMin: 90,
    normalMax: 120,
    warningMin: 80,
    warningMax: 140,
    criticalMin: 0,
    criticalMax: 999,
  },
  glucose: {
    normalMin: 70,
    normalMax: 100,
    warningMin: 54,
    warningMax: 125,
    criticalMin: 0,
    criticalMax: 999,
  },
  heart_rate: {
    normalMin: 60,
    normalMax: 100,
    warningMin: 50,
    warningMax: 120,
    criticalMin: 0,
    criticalMax: 999,
  },
  temperature: {
    normalMin: 36.1,
    normalMax: 37.2,
    warningMin: 35.5,
    warningMax: 38.0,
    criticalMin: 0,
    criticalMax: 999,
  },
  oxygen_saturation: {
    normalMin: 95,
    normalMax: 100,
    warningMin: 90,
    warningMax: 100,
    criticalMin: 0,
    criticalMax: 999,
  },
};

type MetricStatus = "normal" | "warning" | "critical";

/** Ranking de severidad usado para quedarnos con el peor de dos status (ej. sistólica vs diastólica). */
const SEVERITY_RANK: Record<MetricStatus, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

/**
 * Clasifica una presión sistólica según los rangos de CLAUDE.md:
 * normal 90-120, warning 121-140 / <90, critical >140 / <80.
 * @param value Valor de presión sistólica en mmHg.
 * @returns Status de la sistólica.
 */
function classifySystolic(value: number): MetricStatus {
  if (value >= 90 && value <= 120) return "normal";
  if (value > 140 || value < 80) return "critical";
  return "warning";
}

/**
 * Clasifica una presión diastólica según los rangos de CLAUDE.md:
 * normal 60-80, warning 81-90 / <60, critical >90 / <50.
 * @param value Valor de presión diastólica en mmHg.
 * @returns Status de la diastólica.
 */
function classifyDiastolic(value: number): MetricStatus {
  if (value >= 60 && value <= 80) return "normal";
  if (value > 90 || value < 50) return "critical";
  return "warning";
}

/**
 * Determina el status (normal/warning/critical) de una métrica de salud según los
 * rangos documentados en CLAUDE.md.
 *
 * Para `blood_pressure`, `value` es la sistólica y `secondaryValue` (opcional) es la
 * diastólica; se evalúan ambas contra sus rangos respectivos y se devuelve el peor de
 * los dos status (critical > warning > normal). Si no se provee `secondaryValue`, solo
 * se evalúa la sistólica (comportamiento retrocompatible).
 *
 * @param metricType Tipo de métrica registrada.
 * @param value Valor principal de la métrica (sistólica en el caso de blood_pressure).
 * @param secondaryValue Valor secundario opcional (diastólica en el caso de blood_pressure).
 * @returns Status calculado: 'normal', 'warning' o 'critical'.
 */
export function checkMetricStatus(
  metricType: MetricType,
  value: number,
  secondaryValue?: number,
): MetricStatus {
  if (metricType === "blood_pressure") {
    const systolicStatus = classifySystolic(value);
    if (secondaryValue === undefined) return systolicStatus;

    const diastolicStatus = classifyDiastolic(secondaryValue);
    return SEVERITY_RANK[diastolicStatus] > SEVERITY_RANK[systolicStatus]
      ? diastolicStatus
      : systolicStatus;
  }

  const range = METRIC_RANGES[metricType];
  if (!range) return "normal"; // weight no genera alertas

  if (value >= range.normalMin && value <= range.normalMax) return "normal";

  // Verificar critical
  if (metricType === "glucose") {
    if (value > 125 || value < 54) return "critical";
    return "warning";
  }
  if (metricType === "heart_rate") {
    if (value > 120 || value < 50) return "critical";
    return "warning";
  }
  if (metricType === "temperature") {
    if (value > 38.0 || value < 35.5) return "critical";
    return "warning";
  }
  if (metricType === "oxygen_saturation") {
    if (value < 90) return "critical";
    return "warning";
  }

  return "normal";
}

export function getMetricsByPatient(
  patientId: number,
  filters: { type?: string; dateFrom?: string; dateTo?: string },
): HealthMetric[] {
  const db = getDb();

  let query = `
    SELECT hm.*, u.name as recorded_by_name
    FROM health_metrics hm
    LEFT JOIN users u ON hm.recorded_by = u.id
    WHERE hm.patient_id = ?
  `;
  const params: unknown[] = [patientId];

  if (filters.type) {
    query += " AND hm.metric_type = ?";
    params.push(filters.type);
  }
  if (filters.dateFrom) {
    query += " AND hm.recorded_at >= ?";
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    query += " AND hm.recorded_at <= ?";
    params.push(filters.dateTo);
  }

  query += " ORDER BY hm.recorded_at DESC";

  return db.prepare(query).all(...params) as HealthMetric[];
}

export function getPatientSummary(patientId: number): MetricSummary[] {
  const db = getDb();
  const metricTypes: MetricType[] = [
    "blood_pressure",
    "glucose",
    "weight",
    "heart_rate",
    "temperature",
    "oxygen_saturation",
  ];
  const summaries: MetricSummary[] = [];

  // DEBT: N+1 query — se hace una query por cada tipo de métrica en lugar de
  // usar GROUP BY para obtener todos los resúmenes en una sola consulta.
  // Con muchos pacientes esto degradará el rendimiento notablemente.
  for (const metricType of metricTypes) {
    const metrics = db
      .prepare(
        `
      SELECT value, secondary_value, recorded_at
      FROM health_metrics
      WHERE patient_id = ? AND metric_type = ?
      ORDER BY recorded_at DESC
    `,
      )
      .all(patientId, metricType) as {
      value: number;
      secondary_value: number | null;
      recorded_at: string;
    }[];

    if (metrics.length === 0) continue;

    const values = metrics.map((m) => m.value);
    const latest = metrics[0];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calcular tendencia (comparar últimos 3 vs anteriores 3)
    let trend: "rising" | "falling" | "stable" = "stable";
    if (metrics.length >= 6) {
      const recent = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
      const older = values.slice(3, 6).reduce((a, b) => a + b, 0) / 3;
      const diff = recent - older;
      if (Math.abs(diff) > older * 0.03) {
        trend = diff > 0 ? "rising" : "falling";
      }
    }

    summaries.push({
      metric_type: metricType,
      latest_value: latest.value,
      latest_secondary_value: latest.secondary_value,
      latest_recorded_at: latest.recorded_at,
      avg_value: Math.round(avg * 10) / 10,
      min_value: min,
      max_value: max,
      count: metrics.length,
      trend,
      status: checkMetricStatus(
        metricType,
        latest.value,
        latest.secondary_value ?? undefined,
      ),
    });
  }

  return summaries;
}

export function createMetric(
  dto: CreateMetricDTO,
  recordedByUserId: number,
): HealthMetric {
  const db = getDb();

  // Métrica, notificación y alerta deben confirmarse juntas: sin transacción,
  // un fallo intermedio dejaría una métrica anómala sin su alerta asociada.
  const createMetricTx = db.transaction((): HealthMetric => {
    const result = db
      .prepare(
        `
      INSERT INTO health_metrics (patient_id, metric_type, value, secondary_value, unit, recorded_at, recorded_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        dto.patient_id,
        dto.metric_type,
        dto.value,
        dto.secondary_value ?? null,
        dto.unit,
        dto.recorded_at,
        recordedByUserId,
        dto.notes ?? null,
      );

    const metricId = result.lastInsertRowid as number;
    const metric = db
      .prepare(
        `
      SELECT hm.*, u.name as recorded_by_name
      FROM health_metrics hm
      LEFT JOIN users u ON hm.recorded_by = u.id
      WHERE hm.id = ?
    `,
      )
      .get(metricId) as HealthMetric;

    // Generar notificación automática si hay anomalía
    const status = checkMetricStatus(
      dto.metric_type,
      dto.value,
      dto.secondary_value,
    );
    if (status === "warning" || status === "critical") {
      const metricLabel = dto.metric_type.replace(/_/g, " ");
      const severityLabel = status === "critical" ? "crítico" : "advertencia";

      // DEBT: El mensaje de notificación no incluye el valor que disparó la alerta,
      // solo describe el tipo. Debería decir "Glucosa: 145 mg/dL (crítico)" en vez de
      // solo "Nivel de glucosa fuera de rango".
      createNotification({
        patient_id: dto.patient_id,
        type: status === "critical" ? "metric_critical" : "metric_warning",
        title: `${metricLabel} ${severityLabel}`,
        message: `Nivel de ${metricLabel} fuera de rango normal`,
        severity: status,
        related_metric_id: metricId,
      });
    }

    // Generar alerta si la métrica está fuera de rango (reutiliza el mismo status)
    createAlertIfOutOfRange(
      metricId,
      dto.patient_id,
      dto.metric_type,
      dto.value,
      status,
    );

    return metric;
  });

  return createMetricTx();
}
