# Memoria de uso de subagentes

Registro de cada vez que se invoca un subagente en este proyecto: cuándo, cuál, y qué se le pidió.

---

## security-auditor

### 2026-07-12 — primera invocación

- **Qué se le indicó**: Auditoría de seguridad completa del código (inyección SQL, JWT, control de acceso por rol, contraseñas, validación de inputs, rate limiting, manejo de errores, audit-logger, config, CORS/headers y XSS en public/index.html).
- **Resultado**: 6 hallazgos críticos, 4 altos, 4 medios, 3 bajos. Ver detalle en `project_security_findings.md`.

### 2026-07-14 — revisión del nuevo sistema de alertas de salud

- **Qué se le indicó**: Auditar específicamente el código nuevo del sistema de alertas (`src/alerts/*`, integración en `metrics.service.ts`, montaje en `index.ts`), enfocándose en si el control de acceso replica correctamente el patrón bueno (no el IDOR conocido de health-metrics), fuga de datos entre pacientes, manejo de errores 403 vs 404, audit logging y validación de inputs.
- **Resultado**: veredicto positivo — el control de acceso de `/api/alerts` (`canAccessPatient`) SÍ está bien implementado y no repite el IDOR. Encontró 1 hallazgo alto (el IDOR ya conocido de `POST /api/health-metrics` ahora amplifica su impacto porque alimenta la creación automática de alertas falsas), 2 medios (bug en `audit-logger.ts` que pierde el nombre del recurso en rutas montadas con prefijo — usa `req.path` en vez de `req.originalUrl`; y decisión de producto pendiente sobre si un paciente debería poder auto-reconocer sus propias alertas críticas), 1 bajo (parseInt laxo en params). Ver detalle en `project_security_findings.md`.
