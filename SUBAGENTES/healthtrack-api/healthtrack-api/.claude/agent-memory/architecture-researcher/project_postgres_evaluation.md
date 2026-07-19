---
name: project-postgres-evaluation
description: Evaluación en curso SQLite vs Postgres para HealthTrack API; mi ángulo asignado es "ventajas de Postgres"
metadata:
  type: project
---

El equipo está evaluando migrar de SQLite (`better-sqlite3`) a PostgreSQL. El trabajo
se dividió en tres ángulos entre subagentes: impacto en código, ventajas reales de
Postgres (mi asignación, 2026-07-19), y abogado del diablo. Se espera una ronda de
discusión conjunta tras entregar los tres reportes.

**Hallazgos clave de mi investigación (ventajas Postgres):**
- No existe verificación de double-booking en `appointments.service.ts` (`createAppointment`,
  líneas 99-121) ni uso de `db.transaction()` en todo `src/` — grep confirmó cero resultados
  para overlap/conflict/transaction. La ventaja de MVCC de Postgres para concurrencia es
  hoy especulativa: better-sqlite3 es síncrono y Node es single-threaded, así que no hay
  ventana de carrera dentro de un solo proceso. Solo aplicaría si se escala a múltiples
  instancias del API.
- `patients.allergies` (`patients.types.ts:7`) y `audit_log.details` (`audit-logger.ts:40`)
  son las únicas columnas con contenido JSON, pero se tratan como blobs opacos
  (`JSON.stringify`/parse sin queries sobre su contenido) — no hay caso de uso real para
  JSONB todavía, aunque es el ejemplo más cercano a "ya casi es JSON" en el esquema.
- No existe ninguna funcionalidad de búsqueda de texto (`LIKE`, FTS) en todo el código —
  grep sin resultados. Full-text search de Postgres es 100% especulativo hoy.
- `getDb()` en `connection.ts:10` ya usa `journal_mode = WAL`, lo cual mitiga (no elimina)
  el problema de escritor único de SQLite incluso hoy.

**Por qué importa:** si se retoma esta evaluación en el futuro, estos hallazgos siguen
siendo válidos mientras el esquema (`migrations.ts`) y los servicios no cambien
sustancialmente — verificar antes de reusar si ha pasado mucho tiempo.

**Cómo aplicar:** al comparar mis hallazgos con los de [[architecture-code-impact]] o
[[architecture-devils-advocate]] (si existen esas memorias), priorizar evidencia con
archivo:línea sobre argumentos genéricos de marketing de tecnología.
