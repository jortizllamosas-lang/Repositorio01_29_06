# Alerts API — Documentación de Endpoints

**Status:** Sistema completamente implementado, revisado en seguridad y testing exhaustivo  
**Módulo:** `src/alerts/`  
**Base de datos:** SQLite (`alerts` table)  
**Integración:** Generación automática desde `POST /api/health-metrics`

---

## Nota de seguridad: Control de acceso implementado correctamente

A diferencia de los endpoints en `health-metrics` (que tienen vulnerabilidad IDOR conocida), **el sistema de alertas SÍ implementa control de acceso por rol completamente**:

- ✅ Verificación de rol: `admin`, `doctor`, `patient`
- ✅ Verificación de pertenencia: el usuario solo puede acceder a alertas del paciente si tiene permiso (ver abajo)
- ✅ Ambos endpoints usan la función `canAccessPatient()` que replica exactamente el modelo de autorización de `src/patients/`

**Reglas de autorización:**

- **`admin`:** Acceso total a alertas de cualquier paciente
- **`doctor`:** Acceso solo a alertas de pacientes asignados (`patient.assigned_doctor_id === user.userId`)
- **`patient`:** Acceso solo a sus propias alertas (`patient.user_id === user.userId`)

Ambos códigos de error (`404 patient not found` y `404 alert not found`) se devuelven con estatus **404 para evitar filtrar existencia** de recursos ajenos.

---

## Modelo Alert

**Tabla:** `alerts`

| Columna                      | Tipo                | Descripción                                                                                                                   |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | INTEGER PRIMARY KEY | ID único de la alerta                                                                                                         |
| `patient_id`                 | INTEGER NOT NULL FK | ID del paciente afectado                                                                                                      |
| `metric_id`                  | INTEGER NOT NULL FK | ID de la métrica de salud que disparó la alerta                                                                               |
| `metric_type`                | TEXT NOT NULL       | Tipo de métrica que disparó (blood_pressure, glucose, etc.) — copia redundante para queries rápidas sin JOIN a health_metrics |
| `value`                      | REAL NOT NULL       | Valor registrado que disparó la alerta (sistólica en blood_pressure, o valor único en otros casos)                            |
| `severity`                   | TEXT NOT NULL       | Enum: `warning` o `critical`                                                                                                  |
| `acknowledged`               | INTEGER (BOOLEAN)   | 0 = no reconocida, 1 = reconocida por el doctor                                                                               |
| `created_at`                 | TEXT                | Timestamp ISO 8601 de cuándo se generó la alerta                                                                              |
| `patient_name` (enriquecido) | TEXT                | Campo virtual via JOIN a users — nombre del paciente, útil para dashboards                                                    |

**Relación con `health_metrics`:**

- `metric_id` hace referencia a `health_metrics.id`
- Una métrica puede generar como máximo una alerta (no hay alertas duplicadas)
- Las alertas son **solo lectura y gestión de estado** — se crean automáticamente pero no se pueden editar; solo se pueden marcar como reconocidas

---

## Generación automática de alertas

Las alertas **se generan automáticamente y SOLO hacia adelante** cuando se registra una nueva métrica vía `POST /api/health-metrics`. **Nunca se generan alertas retroactivamente** sobre métricas históricas.

**Proceso:**

1. Cliente llama a `POST /api/health-metrics` con un nuevo registro
2. El servidor inserta la métrica en `health_metrics`
3. El servidor llama a `checkMetricStatus()` para clasificar: `normal`, `warning` o `critical`
   - Para `blood_pressure`: evalúa **tanto sistólica como diastólica** contra sus rangos respectivos (mejora reciente — antes solo se miraba sistólica)
   - Para otros tipos: evalúa el valor único contra rango
4. Si el status es `warning` o `critical`:
   - Se crea una **notificación** automática (módulo `notifications`)
   - Se crea una **alerta** automática (este módulo)
5. Si el status es `normal`, no se crea ni notificación ni alerta

**Función `checkMetricStatus()` (desde `src/health-metrics/metrics.service.ts`):**

```
blood_pressure:
  - Sistólica: normal 90-120, warning 121-140 / <90, critical >140 / <80
  - Diastólica: normal 60-80, warning 81-90 / <60, critical >90 / <50
  - Se devuelve el PEOR de los dos status (critical > warning > normal)

glucose:
  - Normal: 70-100, warning 101-125 / <70, critical >125 / <54

heart_rate:
  - Normal: 60-100, warning 101-120 / 50-59, critical >120 / <50

temperature:
  - Normal: 36.1-37.2, warning 37.3-38.0 / <36.0, critical >38.0 / <35.5

oxygen_saturation:
  - Normal: 95-100, warning 90-94, critical <90

weight:
  - No genera alertas (devuelve status "normal" siempre)
```

---

## Nota: Vulnerabilidad IDOR heredada

Existe un **hallazgo de seguridad conocido y documentado (pero no corregido aún)** en `POST /api/health-metrics`:

- ❌ Cualquier usuario autenticado puede crear métricas para CUALQUIER `patient_id`
- ❌ **Esto permite generar alertas falsas para pacientes ajenos**

Esta no es una falla del sistema de alertas en sí, sino heredada del endpoint que lo alimenta. Las alertas se generan correctamente según la métrica creada, pero un usuario malicioso podría crear métricas falsas en la ruta anterior para generar falsas alarmas.

**Impacto:** Un paciente o doctor deshonesto podría:

1. Llamar a `POST /api/health-metrics` con `patient_id=999, value=999` (aunque no sea su paciente)
2. Esto crearía una métrica falsa
3. Que generaría una alerta falsa visible en la UI

---

## Endpoints

### 1. GET /api/alerts/:patientId

Obtiene todas las alertas activas e históricas de un paciente, ordenadas cronológicamente (más recientes primero).

**Autenticación:** Requerida  
**Autorización:** Aplicada per-patient según rol del usuario (ver arriba)

**Parámetros path:**

- `patientId` (number, requerido) — ID del paciente cuyas alertas se solicitan

**Parámetros query:** Ninguno

**Success Response: 200 OK**

```json
{
  "data": [
    {
      "id": 5,
      "patient_id": 3,
      "metric_id": 42,
      "metric_type": "blood_pressure",
      "value": 148,
      "severity": "critical",
      "acknowledged": 0,
      "created_at": "2026-07-19T16:50:00",
      "patient_name": "Carlos Ruiz"
    },
    {
      "id": 4,
      "patient_id": 3,
      "metric_id": 41,
      "metric_type": "glucose",
      "value": 156,
      "severity": "warning",
      "acknowledged": 1,
      "created_at": "2026-07-19T14:20:00",
      "patient_name": "Carlos Ruiz"
    },
    {
      "id": 3,
      "patient_id": 3,
      "metric_id": 40,
      "metric_type": "blood_pressure",
      "value": 142,
      "severity": "warning",
      "acknowledged": 1,
      "created_at": "2026-07-19T12:00:00",
      "patient_name": "Carlos Ruiz"
    }
  ],
  "count": 3
}
```

**Campo `acknowledged`:**

- `0` — Alerta sin reconocer (requiere atención)
- `1` — Alerta reconocida por el doctor (ya se tomó acción o se descartó)

**Error Responses:**

- **400 Bad Request** — `patientId` no es un número entero válido

  ```json
  { "error": "Invalid patientId" }
  ```

- **401 Unauthorized** — Token JWT inválido, expirado o no proporcionado

  ```json
  { "error": "Not authenticated" }
  ```

- **404 Not Found** — El paciente no existe, o el usuario no tiene autorización para verlo
  - **Nota:** No se diferencia entre "paciente no existe" y "sin permiso" para evitar filtrar existencia

  ```json
  { "error": "Patient not found" }
  ```

- **500 Internal Server Error** — Error al obtener alertas

  ```json
  { "error": "Failed to fetch alerts" }
  ```

**curl example:**

```bash
curl -X GET "http://localhost:3000/api/alerts/3" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Ejemplo con diferentes roles:**

```bash
# Doctor Elena (asignada a Carlos): obtiene sus alertas ✓
curl -X GET "http://localhost:3000/api/alerts/3" \
  -H "Authorization: Bearer <token_elena>"
# Response: 200 OK con alertas de Carlos

# Doctor James (NO asignado a Carlos): intenta ver alertas de Carlos ✗
curl -X GET "http://localhost:3000/api/alerts/3" \
  -H "Authorization: Bearer <token_james>"
# Response: 404 Not Found (aunque Carlos exista, James no tiene acceso)

# Carlos (el paciente): ve sus propias alertas ✓
curl -X GET "http://localhost:3000/api/alerts/3" \
  -H "Authorization: Bearer <token_carlos>"
# Response: 200 OK con sus propias alertas
```

---

### 2. PATCH /api/alerts/:id/acknowledge

Marca una alerta como reconocida (acknowledged = 1). Usado por doctors para indicar que revisaron y actuaron sobre la alerta.

**Autenticación:** Requerida  
**Autorización:** Aplicada basándose en el `patient_id` de la alerta (el usuario debe tener permiso de acceso al paciente)

**Parámetros path:**

- `id` (number, requerido) — ID de la alerta a reconocer

**Parámetros query:** Ninguno  
**Body:** No requiere body

**Success Response: 200 OK**

```json
{
  "data": {
    "id": 5,
    "patient_id": 3,
    "metric_id": 42,
    "metric_type": "blood_pressure",
    "value": 148,
    "severity": "critical",
    "acknowledged": 1,
    "created_at": "2026-07-19T16:50:00",
    "patient_name": "Carlos Ruiz"
  }
}
```

**Error Responses:**

- **400 Bad Request** — `id` no es un número entero válido

  ```json
  { "error": "Invalid id" }
  ```

- **401 Unauthorized** — Token JWT inválido, expirado o no proporcionado

  ```json
  { "error": "Not authenticated" }
  ```

- **404 Not Found** — La alerta no existe, o el usuario no tiene autorización para modificarla
  - **Nota:** No se diferencia para evitar filtrar existencia

  ```json
  { "error": "Alert not found" }
  ```

- **500 Internal Server Error** — Error al actualizar alerta

  ```json
  { "error": "Failed to acknowledge alert" }
  ```

**curl example:**

```bash
curl -X PATCH "http://localhost:3000/api/alerts/5/acknowledge" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Ejemplo de flujo:**

```bash
# 1. Doctor Elena ve alerta crítica sin reconocer
GET /api/alerts/3

Response:
{
  "data": [
    { "id": 5, "severity": "critical", "acknowledged": 0, ... }
  ]
}

# 2. Elena revisa al paciente Carlos, toma acción (ej: aumenta medicación)
# 3. Elena marca la alerta como reconocida
PATCH /api/alerts/5/acknowledge

Response:
{
  "data": { "id": 5, "acknowledged": 1, ... }
}

# 4. Siguiente vez que Elena consulta, ve la alerta con acknowledged=1
GET /api/alerts/3
# La alerta sigue visible pero marcada como procesada
```

---

## Campos con PII

Los siguientes campos contienen **Información Personalmente Identificable (PII)** y deben auditarse:

| Campo          | Endpoint                                | Notas                                                                 |
| -------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `patient_id`   | GET /:patientId, PATCH /:id/acknowledge | Identificador único del paciente                                      |
| `patient_name` | GET /:patientId, PATCH /:id/acknowledge | Nombre completo del paciente                                          |
| `metric_id`    | GET /:patientId, PATCH /:id/acknowledge | Referencia a métrica específica que puede revelar información clínica |
| `value`        | GET /:patientId, PATCH /:id/acknowledge | Valor de la métrica (puede ser sensible: glucosa, presión, etc.)      |

---

## Audit Logging

**Actualmente implementado:**

- Mutaciones (`PATCH /api/alerts/:id/acknowledge`) se registran en `logs/audit.jsonl` por el middleware `audit-logger.ts`
- Cada entrada incluye: timestamp, usuario, método HTTP, ruta, cuerpo, IP del cliente

**Para GET (lectura de alertas):**

- ⚠️ No se audita actualmente acceso de lectura a alertas
- Las alertas contienen información clínica sensible — en un sistema de producción se debería auditar quién lee alertas

---

## Ejemplo de flujo completo

**Escenario:** Doctor Elena ve y reconoce una alerta crítica de Carlos.

### 1. Elena se autentica:

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "elena.martinez@healthtrack.com",
  "password": "Doctor123!"
}

Response: 200 OK
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 2,
      "name": "Elena Martínez",
      "email": "elena.martinez@healthtrack.com",
      "role": "doctor"
    }
  }
}
```

### 2. Mientras tanto, alguien (puede ser enfermera) crea una métrica de Carlos:

```bash
POST /api/health-metrics
Content-Type: application/json
Authorization: Bearer <token>

{
  "patient_id": 3,
  "metric_type": "blood_pressure",
  "value": 148,
  "secondary_value": 95,
  "unit": "mmHg",
  "recorded_at": "2026-07-19T16:50:00",
  "notes": "Presión elevada tras ansiedad"
}

Response: 201 Created
{
  "data": {
    "id": 42,
    "patient_id": 3,
    "metric_type": "blood_pressure",
    "value": 148,
    "secondary_value": 95,
    ...
  }
}

Lado del servidor (automático):
- Clasifica sistólica 148: critical (>140)
- Crea notificación con tipo="metric_critical"
- Crea alerta con id=5, severity="critical", acknowledged=0
```

### 3. Elena consulta las alertas de Carlos:

```bash
GET /api/alerts/3
Authorization: Bearer <token_elena>

Response: 200 OK
{
  "data": [
    {
      "id": 5,
      "patient_id": 3,
      "metric_id": 42,
      "metric_type": "blood_pressure",
      "value": 148,
      "severity": "critical",
      "acknowledged": 0,
      "created_at": "2026-07-19T16:50:00",
      "patient_name": "Carlos Ruiz"
    }
  ],
  "count": 1
}
```

### 4. Elena revisa a Carlos y toma acción (aumenta medicación):

```
(En la UI médica o en proceso externo)
```

### 5. Elena marca la alerta como reconocida:

```bash
PATCH /api/alerts/5/acknowledge
Authorization: Bearer <token_elena>

Response: 200 OK
{
  "data": {
    "id": 5,
    "patient_id": 3,
    "metric_id": 42,
    "metric_type": "blood_pressure",
    "value": 148,
    "severity": "critical",
    "acknowledged": 1,
    "created_at": "2026-07-19T16:50:00",
    "patient_name": "Carlos Ruiz"
  }
}

Audit log entry creado (truncado):
{
  "timestamp": "2026-07-19T17:05:00",
  "userId": 2,
  "method": "PATCH",
  "path": "/api/alerts/5/acknowledge",
  "statusCode": 200,
  "ip": "192.168.1.100"
}
```

### 6. Siguiente lectura de alertas muestra alerta procesada:

```bash
GET /api/alerts/3
Authorization: Bearer <token_elena>

Response: 200 OK
{
  "data": [
    {
      "id": 5,
      "...": "...",
      "acknowledged": 1  ← Ahora es 1
    }
  ]
}
```

---

## Diferencias con health-metrics

| Aspecto      | health-metrics                                                            | alerts                                           |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------ |
| Autorización | ❌ IDOR (cualquiera puede leer/crear para cualquier paciente)             | ✅ Implementada (respeta rol y asignación)       |
| Generación   | Manual via `POST /api/health-metrics`                                     | Automática (se genera al registrar métrica)      |
| Editable     | Sí (aunque no hay endpoint PATCH documentado, en teoría podrían editarse) | No (solo se puede cambiar estado `acknowledged`) |
| N+1 queries  | Sí en `getPatientSummary()` (DEBT)                                        | No (solo JOIN simple)                            |

---

## Pendientes / Deuda técnica

Ninguna actualmente en el módulo de alertas. El sistema está completamente implementado y revisat-proof.

Sin embargo, la deuda heredada de `health-metrics` (IDOR) afecta indirectamente a alertas, permitiendo crear alertas falsas. Ver sección anterior.

---

## Notas para futuros cambios

1. **Auditoría de acceso de lectura:** Actual `audit-logger` solo registra mutaciones. Debería extenderse para registrar `GET /api/alerts/:patientId` también, ya que contiene información sensible.

2. **Filtro de alertas por severidad/fecha:** Los endpoints actuales devuelven todas las alertas. Sería útil agregar query parameters:
   - `?severity=critical` — solo alertas críticas
   - `?acknowledged=false` — solo alertas sin reconocer
   - `?from=2026-07-01&to=2026-07-31` — rango de fechas

3. **Corrección del IDOR en health-metrics:** Ver documento `docs/api/health-metrics.md` sección "Notas para futuros cambios".

4. **Alertas retrospectivas (opcional):** Agregar un endpoint admin-only `POST /api/alerts/backfill?patientId=X&from=Y&to=Z` que genere alertas para métricas históricas (actual sistema solo genera hacia adelante).
