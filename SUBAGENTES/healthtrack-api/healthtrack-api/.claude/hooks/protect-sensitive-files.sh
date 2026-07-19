#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) para el subagente safe-implementer.
# Bloquea escritura/edición directa de migraciones y archivos de
# configuración sensible (secretos), que deben cambiarse deliberadamente
# y no como efecto colateral de una tarea de implementación de features.

set -eu

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | python -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("file_path", ""))
except Exception:
    print("")
')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

NORMALIZED=$(printf '%s' "$FILE_PATH" | tr '\\' '/' | tr '[:upper:]' '[:lower:]')

BLOCK=0

# Migraciones: archivo principal y cualquier carpeta migrations/
printf '%s' "$NORMALIZED" | grep -Eq '(^|/)src/database/migrations\.ts$' && BLOCK=1
printf '%s' "$NORMALIZED" | grep -Eq '(^|/)migrations/' && BLOCK=1

# Secretos / configuración sensible
printf '%s' "$NORMALIZED" | grep -Eq '(^|/)\.env(\.local)?$' && BLOCK=1
printf '%s' "$NORMALIZED" | grep -Eq '(^|/)\.mcp\.json$' && BLOCK=1

if [ "$BLOCK" -eq 1 ]; then
  echo "BLOQUEADO: '$FILE_PATH' es un archivo protegido (migración o configuración sensible)." >&2
  echo "safe-implementer no puede editar migraciones ni secretos directamente." >&2
  echo "Si hace falta un cambio de esquema o de configuración, coordínalo explícitamente con el usuario." >&2
  exit 2
fi

exit 0
