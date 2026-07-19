# Health Metrics API — Documentación de Endpoints

**Status:** Snapshot del código actual (antes de implementar nuevo sistema de alertas)  
**Módulo:** `src/health-metrics/`  
**Base de datos:** SQLite (`health_metrics` table)

---

## Nota de seguridad: IDOR vulnerabilidad conocida

Los tres endpoints de este módulo actualmente **verifican autenticación pero NO verifican autorización**:

- ❌ No hay `authorize()` middleware validando rol
- ❌ No hay verificación de que `patientId` pertenezca al usuario autenticado
- ⚠️ **Cualquier usuario autenticado puede leer/escribir métricas de cualquier paciente**

Esta es una vulnerabilidad **Insecure Direct Object Reference (IDOR)** intencional, documentada para el ejercicio del curso.

---

## Rangos normales de métricas de salud

Referencia desde `CLAUDE.md`. Las métricas se clasifican automáticamente en estados:

| Métrica           | Unidad | Normal    | Warning           | Critical              |
| ----------------- | ------ | --------- | ----------------- | --------------------- |
| Presión sistólica | mmHg   | 90–120    | 121–140 / <90     | >140 / <80            |
| Glucosa (ayunas)  | mg/dL  | 70–100    | 101–125 / <70     | >125 / <54            |
| Ritmo cardíaco    | bpm    | 60–100    | 101–120 / 50–59   | >120 / <50            |
| Temperatura       | °C     | 36.1–37.2 | 37.3–38.0 / <36.0 | >38.0 / <35.5         |
| Saturación O₂     | %      | 95–100    | 90–94             | <90                   |
| Peso              | kg     | —         | —                 | — (no genera alertas) |

---

## Endpoints

### 1. GET /api/health-metrics/:patientId

Obtiene todas las métricas de un paciente, con filtros opcionales por tipo de métrica y rango de fechas.

**Autenticación:** Requerida (cualquier rol autenticado)  
**Verificación de pertenencia:** ❌ NO (IDOR — usuario puede acceder a métricas de cualquier paciente)

**Parámetros path:**

- `patientId` (number, requerido) — ID del paciente cuyas métricas se solicitan

**Parámetros query:**

- `type` (string, opcional) — Filtrar por tipo de métrica. Valores válidos: `blood_pressure`, `glucose`, `weight`, `heart_rate`, `temperature`, `oxygen_saturation`
- `dateFrom` (string, opcional) — Fecha mínima ISO 8601 para filtrar (ej: `2026-01-01T00:00`)
- `dateTo` (string, opcional) — Fecha máxima ISO 8601 para filtrar

**Success Response: 200 OK**

```json
{
  "data": [
    {
      "id": 1,
      "patient_id": 3,
      "metric_type": "blood_pressure",
      "value": 135,
      "secondary_value": 85,
      "unit": "mmHg",
      "recorded_at": "2026-07-19T14:30:00",
      "recorded_by": 2,
      "notes": "Medición en consultorio",
      "created_at": "2026-07-19T14:30:00",
      "recorded_by_name": "Elena Martínez"
    },
    {
      "id": 2,
      "patient_id": 3,
      "metric_type": "glucose",
      "value": 110,
      "secondary_value": null,
      "unit": "mg/dL",
      "recorded_at": "2026-07-19T09:15:00",
      "recorded_by": 1,
      "notes": null,
      "created_at": "2026-07-19T09:15:00",
      "recorded_by_name": "Admin User"
    }
  ],
  "count": 2
}
```

**Error Responses:**

- **400 Bad Request** — `patientId` no es un número entero válido

  ```json
  { "error": "Invalid patientId" }
  ```

- **401 Unauthorized** — Token JWT inválido, expirado o no proporcionado

  ```json
  { "error": "Not authenticated" }
  ```

- **500 Internal Server Error** — Error al obtener métricas
  ```json
  { "error": "Failed to fetch metrics" }
  ```

**curl example:**

```bash
curl -X GET "http://localhost:3000/api/health-metrics/3?type=blood_pressure&dateFrom=2026-07-01T00:00" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 2. GET /api/health-metrics/:patientId/summary

Obtiene un resumen estadístico de todas las métricas de un paciente: últimos valores, promedio, min/max, tendencia y estado actual.

**Autenticación:** Requerida (cualquier rol autenticado)  
**Verificación de pertenencia:** ❌ NO (IDOR — usuario puede acceder a resumen de cualquier paciente)

**Parámetros path:**

- `patientId` (number, requerido) — ID del paciente

**Parámetros query:** Ninguno

**Success Response: 200 OK**

```json
{
  "data": [
    {
      "metric_type": "blood_pressure",
      "latest_value": 135,
      "latest_secondary_value": 85,
      "latest_recorded_at": "2026-07-19T14:30:00",
      "avg_value": 128.5,
      "min_value": 120,
      "max_value": 142,
      "count": 6,
      "trend": "rising",
      "status": "warning"
    },
    {
      "metric_type": "glucose",
      "latest_value": 110,
      "latest_secondary_value": null,
      "latest_recorded_at": "2026-07-19T09:15:00",
      "avg_value": 98.3,
      "min_value": 78,
      "max_value": 118,
      "count": 5,
      "trend": "stable",
      "status": "normal"
    },
    {
      "metric_type": "heart_rate",
      "latest_value": 72,
      "latest_secondary_value": null,
      "latest_recorded_at": "2026-07-18T10:00:00",
      "avg_value": 74.2,
      "min_value": 68,
      "max_value": 82,
      "count": 4,
      "trend": "falling",
      "status": "normal"
    }
  ]
}
```

**Campo `trend`:** Calcula comparando los últimos 3 registros vs los 3 anteriores. Se marca como `rising` o `falling` si la diferencia es mayor a 3% del promedio anterior; en caso contrario es `stable`.

**Campo `status`:** Clasificación basada en el último valor registrado y los rangos normales definidos arriba:

- `normal` — Dentro del rango normal
- `warning` — Fuera del rango normal pero no crítico
- `critical` — Valor crítico, requiere atención urgente

**Error Responses:**

- **400 Bad Request** — `patientId` no es válido

  ```json
  { "error": "Invalid patientId" }
  ```

- **401 Unauthorized** — Token no proporcionado o inválido

  ```json
  { "error": "Not authenticated" }
  ```

- **500 Internal Server Error** — Error al obtener resumen
  ```json
  { "error": "Failed to fetch summary" }
  ```

**Nota interna:** Este endpoint ejecuta una **N+1 query** (comentado como `DEBT:` en el código). Para cada tipo de métrica se hace una SELECT separada, lo que degradará rendimiento con muchos pacientes. Debería usar `GROUP BY` en una sola consulta.

**curl example:**

```bash
curl -X GET "http://localhost:3000/api/health-metrics/3/summary" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 3. POST /api/health-metrics

Crea un nuevo registro de métrica de salud para un paciente. Valida automáticamente el rango y genera notificaciones si detecta una anomalía (warning o critical).

**Autenticación:** Requerida (cualquier rol autenticado)  
**Verificación de pertenencia:** ❌ NO (IDOR — usuario puede registrar métricas para cualquier paciente)

**Body (JSON):**

```json
{
  "patient_id": 3,
  "metric_type": "blood_pressure",
  "value": 142,
  "secondary_value": 92,
  "unit": "mmHg",
  "recorded_at": "2026-07-19T16:45:00",
  "notes": "Presión después de ejercicio"
}
```

**Parámetros:**

| Campo             | Tipo   | Requerido | Validación                                                                                    |
| ----------------- | ------ | --------- | --------------------------------------------------------------------------------------------- |
| `patient_id`      | number | Sí        | Entero positivo, ID debe existir en base de datos                                             |
| `metric_type`     | string | Sí        | Enum: `blood_pressure`, `glucose`, `weight`, `heart_rate`, `temperature`, `oxygen_saturation` |
| `value`           | number | Sí        | Número positivo, no puede ser negativo                                                        |
| `secondary_value` | number | No        | Número positivo (usado para presión diastólica en blood_pressure)                             |
| `unit`            | string | Sí        | Debe coincidir con la unidad esperada para el tipo (mmHg, mg/dL, kg, bpm, °C, %)              |
| `recorded_at`     | string | Sí        | Formato ISO 8601 (ej: `2026-07-19T14:30:00`)                                                  |
| `notes`           | string | No        | Texto libre, máx 255 caracteres                                                               |

**Validación especial (DEBT):**

- ⚠️ Cuando `metric_type` es `blood_pressure`, **no se valida que `secondary_value` exista**. Médicamente, una presión sin diastólica (secondary_value) no tiene sentido, pero la API lo acepta sin error.
- Todas las demás métricas permiten `secondary_value` = null

**Success Response: 201 Created**

```json
{
  "data": {
    "id": 42,
    "patient_id": 3,
    "metric_type": "blood_pressure",
    "value": 142,
    "secondary_value": 92,
    "unit": "mmHg",
    "recorded_at": "2026-07-19T16:45:00",
    "recorded_by": 2,
    "notes": "Presión después de ejercicio",
    "created_at": "2026-07-19T16:45:00",
    "recorded_by_name": "Elena Martínez"
  }
}
```

**Comportamiento automático:**

1. Clasifica el valor usando `checkMetricStatus()` contra los rangos normales
2. Si la clasificación es `warning` o `critical`, **crea automáticamente una notificación** en la tabla `notifications`:
   - Tipo: `metric_warning` o `metric_critical`
   - Título: "presión arterial advertencia" / "glucosa crítico" (etc.)
   - Severidad: `warning` o `critical`
   - Vinculada al metric ID que se acaba de crear (campo `related_metric_id`)

**Nota interna (DEBT):** El título de la notificación no incluye el valor actual. Debería decir "Glucosa: 145 mg/dL (crítico)" en vez de solo "Nivel de glucosa fuera de rango".

**Error Responses:**

- **400 Bad Request** — Validación fallida

  ```json
  {
    "error": "metric_type must be one of: blood_pressure, glucose, weight, heart_rate, temperature, oxygen_saturation"
  }
  ```

  Otros posibles errores de validación:
  - `patient_id is required`
  - `metric_type is required`
  - `value is required`
  - `value must be a number`
  - `value must be positive`
  - `unit is required`
  - `recorded_at is required`
  - `recorded_at must be ISO 8601 format`

- **401 Unauthorized** — Token no proporcionado o inválido

  ```json
  { "error": "Not authenticated" }
  ```

- **500 Internal Server Error** — Error al crear la métrica (ej: patient_id no existe, error de BD)
  ```json
  { "error": "Patient not found" }
  ```

**curl example:**

```bash
curl -X POST "http://localhost:3000/api/health-metrics" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "patient_id": 3,
    "metric_type": "blood_pressure",
    "value": 142,
    "secondary_value": 92,
    "unit": "mmHg",
    "recorded_at": "2026-07-19T16:45:00",
    "notes": "Presión después de ejercicio"
  }'
```

---

## Campos con PII

Los siguientes campos contienen **Información Personalmente Identificable (PII)** y deben auditarse:

| Campo                              | Endpoint                                         | Notas                                                                         |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `patient_id`                       | GET /:patientId, GET /:patientId/summary, POST / | Identificador único del paciente                                              |
| `recorded_by` / `recorded_by_name` | GET /:patientId, GET /:patientId/summary, POST / | Profesional que registró la métrica (puede revelar quién atiende al paciente) |
| `notes`                            | GET /:patientId, POST /                          | Pueden contener información sensible sobre el paciente                        |

---

## Audit Logging

**Actualmente implementado:**

- El middleware `audit-logger.ts` registra todas las mutaciones (POST, PUT, DELETE) en `logs/audit.jsonl`
- Cada entrada incluye: timestamp, usuario, método HTTP, ruta, cuerpo, IP del cliente

**Para GET (lectura de datos sensibles):**

- ⚠️ No se audita actualmente si un usuario accede a métricas de un paciente que no es suyo
- Con la vulnerabilidad IDOR, esto es especialmente crítico: un auditor no sabrá si hubo acceso no autorizado

---

## Ejemplo de flujo completo

**1. Usuario (doctor Elena Martínez, ID 2) se autentica:**

```bash
POST /api/auth/login
{ "email": "elena.martinez@healthtrack.com", "password": "Doctor123!" }

Response:
{ "data": { "token": "eyJh...", "user": { "id": 2, "role": "doctor", ... } } }
```

**2. Elena crea una métrica para su paciente Carlos (patient_id = 3):**

```bash
POST /api/health-metrics
{ "patient_id": 3, "metric_type": "blood_pressure", "value": 142, "secondary_value": 92, ... }

Response (201):
{ "data": { "id": 42, ... } }

Lado del servidor:
- Inserta registro en health_metrics
- Clasifica: status = "critical" (>140)
- Crea notificación en notifications table con type="metric_critical"
```

**3. Elena consulta resumen de métricas de Carlos:**

```bash
GET /api/health-metrics/3/summary

Response (200):
{ "data": [
  { "metric_type": "blood_pressure", "latest_value": 142, "status": "critical", "trend": "rising", ... },
  ...
] }
```

**4. (VULNERABILIDAD IDOR)** Otro usuario, aunque sea un paciente sin permisos, podría hacer:

```bash
GET /api/health-metrics/3
GET /api/health-metrics/3/summary

Y accedería a todas las métricas de Carlos sin restricción alguna.
```

---

## Pendientes / Deuda técnica (DEBT comments in code)

1. **N+1 Query en `getPatientSummary()`** — Hace una SELECT por cada tipo de métrica (6 queries). Debería usar `GROUP BY` para traer todo en una consulta.

2. **Validación incompleta en `validateCreateMetric()`** — Cuando `metric_type` es `blood_pressure`, no se valida que `secondary_value` sea requerido.

3. **Notificación sin valor completo** — El título de la notificación generada en `createMetric()` no incluye el valor numérico. Debería ser "Glucosa: 145 mg/dL (crítico)" en lugar de solo "Nivel de glucosa fuera de rango".

---

## Notas para futuros cambios

Este documento es un **snapshot** antes de implementar un nuevo sistema de alertas. Cambios previstos:

- Corregir la vulnerabilidad IDOR agregando verificación de rol y pertenencia del paciente
- Implementar autorización granular (doctor ve sus pacientes, paciente ve solo sus datos)
- Mejorar auditoría para capturar acceso a datos sensibles, no solo mutaciones
- Optimizar queries N+1
- Enriquecer notificaciones con contexto completo
