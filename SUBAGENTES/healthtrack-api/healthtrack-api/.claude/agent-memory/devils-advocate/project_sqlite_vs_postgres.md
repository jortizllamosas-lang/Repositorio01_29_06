---
name: project-sqlite-vs-postgres
description: Evidence gathered against migrating HealthTrack API from SQLite (better-sqlite3) to PostgreSQL
metadata:
  type: project
---

El equipo evaluó (2026-07-19) migrar HealthTrack API de SQLite a PostgreSQL. Until proven otherwise, verify this is still under discussion before reusing conclusions — a migration may have happened since.

**Why:** HealthTrack API es el proyecto troncal del Módulo 8 de un curso de Claude Code (ver `CLAUDE.md`), no un sistema en producción real. Su propósito es que alumnos construyan subagentes (security-auditor, test-writer, db-analyst, doc-generator, code-reviewer) sobre una base de código estable y legible.

**Evidencia clave recogida (verificar que sigue vigente antes de reusar):**
- Toda la capa de datos es 100% síncrona: `bcrypt.hashSync`/`compareSync` en `src/auth/auth.service.ts:23,51`; cero `async`/`await` en `src/patients/patients.service.ts`; 51 llamadas `.prepare()/.exec()/.transaction()` repartidas en 10 archivos de `src/`.
- Tests usan SQLite `:memory:` vía `setDb()` en `tests/setup.ts` — instantáneo, sin contenedores. Migrar a Postgres exigiría testcontainers o equivalente en CI.
- Fechas guardadas como `TEXT` vía `datetime('now')` en las 7 tablas de `src/database/migrations.ts` — orden lexicográfico ISO funciona igual en ambos motores hoy, pero una migración real normalmente cambiaría a tipos `TIMESTAMP`/`timestamptz`, introduciendo riesgo de timezone en `recorded_at` (usado para detección de anomalías en `metrics.service.ts`).
- Deploy actual: archivo único `healthtrack.db` + `DB_PATH` env var (`src/config.ts:7`), sin servidor, sin credenciales, sin pooling.

**How to apply:** Si se retoma esta discusión, no repetir toda la investigación — releer `CLAUDE.md`, `package.json`, `src/database/connection.ts` y `tests/setup.ts` para confirmar que los números anteriores siguen vigentes, y partir del caso ya construido (sobre-ingeniería para el propósito del repo, coste de reescritura async en cascada, sin evidencia medida de un problema real de escala/concurrencia).

Ver también [[feedback_devils_advocate_style]] si existe.
