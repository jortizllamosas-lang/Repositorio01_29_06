import type { MetricType } from "../health-metrics/metrics.types";

export interface Alert {
  id: number;
  patient_id: number;
  metric_id: number;
  metric_type: MetricType;
  value: number;
  severity: "warning" | "critical";
  acknowledged: number;
  created_at: string;
  // Campo enriquecido vía JOIN, útil para el doctor
  patient_name?: string;
}
