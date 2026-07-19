---
name: project-dashboard-patterns
description: Patrones concretos ya usados en public/index.html para modales de edición/creación por fila de tabla (ej. pacientes) — referencia para replicar en otras entidades (appointments, metrics)
metadata:
  type: project
---

En `public/index.html` el patrón "editar recurso desde fila de tabla" ya se implementó
para Patients (2026-07-19) y puede replicarse para otras secciones (appointments, etc.):

- Botón de acción en la fila: `event.stopPropagation()` + `onclick="openEdit...Modal(id)"`,
  visible condicionalmente evaluando `currentUser.role` dentro del `.map()` del render
  (patrón `const canEdit = currentUser && currentUser.role !== "patient"` seguido de
  `${canEdit ? "<button ...>" : ""}` dentro del template string de la fila).
- Modal de edición separado del modal de creación (`modal-edit-<recurso>` vs
  `modal-<recurso>`), con campos de solo lectura (nombre/email de un `<p>`, no `<input>`)
  para datos que pertenecen a otra tabla (ej. `users`) y que el endpoint PUT no actualiza.
  Esto evita que la UI sugiera que esos campos son editables cuando el backend los ignora.
- Pre-carga de datos: primero busca en el array cacheado en memoria (`allPatients`), y si
  no está (ej. venido de otra sección) hace fallback a `GET /api/<recurso>/:id`.
- Variable global tipo `editingPatientId` para guardar qué recurso se está editando entre
  `openEdit...Modal` y `submit...`.
- Validación de campo único obligatorio en edición: arrays `EDIT_..._REQUIRED_FIELDS`
  separados del array de creación (`..._REQUIRED_FIELDS`), cada uno con su propio listener
  `input` para `clearMissingField`. No reutilizar el array de creación porque los campos
  obligatorios de crear vs editar difieren (ej. nombre/email/password no aplican en editar).
- Al guardar con éxito: cerrar modal, `showToast(..., "success")`, refrescar la lista
  (`loadPatients()`), y si el panel de detalle del mismo recurso está abierto (chequear
  `!classList.contains("hidden")`), refrescarlo también con la misma función que lo pobló
  originalmente (ej. `showPatientDetail(id)`).
- Campos opcionales tipo `<select>` (gender, blood_type): en el body del PUT solo se
  incluyen si el usuario seleccionó un valor no vacío (`if (gender) body.gender = gender`).
  Limitación conocida: esto significa que la UI no permite "borrar" explícitamente un
  gender/blood_type ya asignado (volver a null) porque el backend `updatePatient` no
  distingue "campo no enviado" de "campo enviado vacío" de forma consistente con `create`
  (ver `src/patients/patients.service.ts` — `create` normaliza `""` a `null` con `|| null`,
  pero `update` no lo hace, solo chequea `!== undefined`). Si se pide soporte de "clear"
  explícito, hay que reportarlo como bloqueo para `safe-implementer` (backend), no
  parchearlo desde el frontend.
- Campos de texto libre (`allergies`, `emergency_contact`, `emergency_phone`) sí se envían
  siempre (incluso vacíos) en el PUT de edición, a diferencia del formulario de creación,
  porque en edición vaciar el campo es una forma legítima de "borrar" ese dato.
