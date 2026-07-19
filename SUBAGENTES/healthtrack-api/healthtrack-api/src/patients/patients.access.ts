import { getDb } from "../database/connection";
import type { TokenPayload } from "../auth/auth.types";

/**
 * Verifica si el paciente indicado existe y si el usuario dado tiene acceso a sus datos,
 * siguiendo el mismo control de acceso por rol usado en patients.service.ts:
 * - admin: acceso total.
 * - doctor: solo si el paciente tiene assigned_doctor_id === user.userId.
 * - patient: solo si el paciente es él mismo (patients.user_id === user.userId).
 *
 * Módulo compartido: usado por alerts.service.ts y por el endpoint de creación de
 * health-metrics para evitar duplicar esta lógica de control de acceso (y el riesgo
 * de que ambas copias diverjan).
 *
 * @param patientId ID del paciente a verificar.
 * @param user Payload del token del usuario autenticado.
 * @returns true si el usuario tiene acceso al paciente, false si no existe o no tiene acceso.
 */
export function canAccessPatient(
  patientId: number,
  user: TokenPayload,
): boolean {
  const db = getDb();

  const patient = db
    .prepare("SELECT user_id, assigned_doctor_id FROM patients WHERE id = ?")
    .get(patientId) as
    { user_id: number; assigned_doctor_id: number | null } | undefined;

  if (!patient) return false;

  if (user.role === "admin") return true;
  if (user.role === "doctor") return patient.assigned_doctor_id === user.userId;
  return patient.user_id === user.userId;
}
