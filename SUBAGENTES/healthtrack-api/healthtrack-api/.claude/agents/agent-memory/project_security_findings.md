# Hallazgos de seguridad del proyecto

Registro de brechas de seguridad detectadas, cuándo se detectaron, y si fueron corregidas.

---

## Auditoría 2026-07-12 (security-auditor)

### Críticos

| #   | Hallazgo                                                                    | Archivo                                     | Corregido                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Registro público permite crear cuentas `admin` sin restricción              | `src/auth/auth.routes.ts:7-19`              | No                                                                                                                                                                                                                                                                                                                                            |
| 2   | JWT secret hardcodeado en el código fuente                                  | `src/config.ts:5`                           | No                                                                                                                                                                                                                                                                                                                                            |
| 3   | IDOR total en health-metrics (sin authorize ni verificación de pertenencia) | `src/health-metrics/metrics.routes.ts:9-46` | Sí (2026-07-19) — corregido SOLO en `POST /` (el que dispara alertas/notificaciones): se extrajo `canAccessPatient` a `src/patients/patients.access.ts` y se aplica antes de `createMetric`, devolviendo 404. `GET /:patientId` y `GET /:patientId/summary` siguen con el mismo IDOR, pendientes de otra tarea (fuera de alcance de este fix) |
| 4   | IDOR en pacientes: doctor accede/edita pacientes no asignados               | `src/patients/patients.service.ts:40-107`   | No                                                                                                                                                                                                                                                                                                                                            |
| 5   | Contraseñas en texto plano guardadas en audit_log                           | `src/middleware/audit-logger.ts:9-26`       | No                                                                                                                                                                                                                                                                                                                                            |
| 6   | XSS almacenado (innerHTML sin escapar) + JWT en localStorage                | `public/index.html`                         | No                                                                                                                                                                                                                                                                                                                                            |

### Altos

| #   | Hallazgo                                                                      | Archivo                                                     | Corregido |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| 7   | Mass assignment: paciente puede sobrescribir status/notes clínicas de su cita | `src/appointments/appointments.service.ts:91-112`           | No        |
| 8   | isDevelopment=true por defecto → fuga de stack traces/SQL en errores          | `src/middleware/error-handler.ts:17-27`, `src/config.ts:13` | No        |
| 9   | Sin política de contraseñas mínima                                            | `src/auth/auth.routes.ts:7-19`                              | No        |
| 10  | Rate limiting global insuficiente, sin límite estricto en login               | `src/middleware/rate-limiter.ts`                            | No        |

### Medios

| #   | Hallazgo                                                         | Archivo                                    | Corregido |
| --- | ---------------------------------------------------------------- | ------------------------------------------ | --------- |
| 11  | Sin cabeceras de seguridad HTTP (falta helmet/CSP)               | `src/index.ts`                             | No        |
| 12  | Sobre-registro de PHI sin redacción en audit_log                 | `src/middleware/audit-logger.ts:24`        | No        |
| 13  | Token JWT en localStorage (sin httpOnly)                         | `public/index.html:542-543`                | No        |
| 14  | Hard delete de pacientes (sin soft-delete, riesgo de compliance) | `src/patients/patients.service.ts:109-115` | No        |

### Bajos

| #   | Hallazgo                                                               | Archivo                                          | Corregido |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| 15  | Sin validación de formato de email en registro                         | `src/auth/auth.routes.ts:8-13`                   | No        |
| 16  | Validación incompleta de presión arterial (secondary_value no exigido) | `src/health-metrics/metrics.validation.ts:27-29` | No        |
| 17  | CORS con origen hardcodeado a localhost                                | `src/index.ts:18-21`                             | No        |

---

## Auditoría 2026-07-14 (security-auditor) — Sistema de alertas de salud

Alcance: `src/alerts/*` (nuevo), integración en `src/health-metrics/metrics.service.ts`, montaje en `src/index.ts`.

**Veredicto**: el control de acceso nuevo (`canAccessPatient` en `alerts.service.ts`) SÍ replica el patrón correcto (admin/doctor-asignado/paciente-propio) y NO repite el IDOR de `health-metrics`. Devuelve 404 uniforme (no 403) para no filtrar existencia. Sin inyección SQL (queries parametrizadas).

### Altos

| #   | Hallazgo                                                                                                                                                                                                                           | Archivo                                                                       | Corregido                                                                                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | El IDOR ya conocido de `POST /api/health-metrics` (#3) ahora también dispara `createAlertIfOutOfRange`, permitiendo inyectar alertas clínicas falsas (warning/critical) para pacientes ajenos sin ninguna relación con el atacante | `src/health-metrics/metrics.routes.ts` + `src/alerts/alerts.service.ts:38-61` | Sí (2026-07-19) — mismo fix que #3: `canAccessPatient` (reutilizada desde `src/patients/patients.access.ts`, ya no duplicada en `alerts.service.ts`) bloquea la creación de la métrica en `POST /` antes de que se llegue a `createAlertIfOutOfRange`/`createNotification`, eliminando la vía de inyección de alertas falsas |

### Medios

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                        | Archivo                                                                    | Corregido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | `audit-logger.ts` usa `req.path` (recortado por el prefijo del router) en vez de `req.originalUrl`, por lo que las mutaciones a rutas montadas (ej. `PATCH /api/alerts/:id/acknowledge`) quedan mal registradas: `resource` termina siendo el ID numérico y `resource_id` queda `null`. Afecta trazabilidad de compliance, no expone datos                      | `src/middleware/audit-logger.ts:19-21`                                     | Sí (2026-07-19) — ahora usa `req.originalUrl` (sin query string) para extraer `resource`/`resource_id`, con índices ajustados (`parts[1]`/`parts[2]`); también se actualizó `details.path` para usar `originalUrl`. Test nuevo en `tests/audit-logger.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 20  | `acknowledgeAlert` permite que el propio paciente reconozca sus alertas críticas (campo con semántica clínica, no de "visto" como en `notifications.read`). Un paciente podría ocultar una alerta crítica antes de que el doctor la revise si el panel filtra por `acknowledged=0`. Requiere decisión de producto: restringir a doctor/admin o separar el campo | `src/alerts/alerts.service.ts:99-124`, `src/alerts/alerts.routes.ts:27-48` | Sí (2026-07-19) — decisión de producto: restringido a `doctor` (asignado) y `admin`; un `patient` nunca puede reconocer alertas (ni siquiera las suyas), pero sigue pudiendo verlas vía `GET /api/alerts/:patientId` (sin cambios). Fix: `authorize("admin","doctor")` agregado a `PATCH /:id/acknowledge` en `alerts.routes.ts`, más chequeo redundante de `user.role === "patient"` en `acknowledgeAlert()` (defensa en profundidad, por si el service se invoca desde otro punto de entrada en el futuro). Tests actualizados en `tests/alerts.test.ts` (los dos que asumían que un paciente podía reconocer su propia alerta) y test nuevo `tests/auth.middleware.test.ts` cubriendo `authorize()` con los roles usados en esta ruta. |

### Bajos

| #   | Hallazgo                                                                                                                                                                                  | Archivo                            | Corregido |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| 21  | `parseInt` laxo en `:patientId`/`:id` de las rutas de alerts (acepta `"7abc"` → `7`); no explotable (queries parametrizadas) pero validación débil, consistente con el resto del proyecto | `src/alerts/alerts.routes.ts:9,31` | No        |

---

<!-- Al corregir un hallazgo, actualizar su fila a "Sí (YYYY-MM-DD)" y añadir una nota si aplica. -->
