#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) para el subagente safe-implementer.
# Bloquea SQL destructivo ejecutado directamente por Bash y el borrado/
# movimiento directo del archivo de base de datos, forzando a que las
# mutaciones de datos pasen por la capa de aplicación (servicios TS).

set -eu

INPUT=$(cat)

COMMAND=$(printf '%s' "$INPUT" | python -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("tool_input", {}).get("command", ""))
except Exception:
    print("")
')

if [ -z "$COMMAND" ]; then
  exit 0
fi

LOWER_CMD=$(printf '%s' "$COMMAND" | tr '[:upper:]' '[:lower:]')

# SQL de escritura/DDL: INSERT, UPDATE...SET, DELETE FROM, DROP, ALTER, TRUNCATE, CREATE TABLE
SQL_PATTERN='(insert[[:space:]]+into|update[[:space:]].*[[:space:]]set[[:space:]]|delete[[:space:]]+from|drop[[:space:]]+(table|database)|alter[[:space:]]+table|truncate[[:space:]]+table|create[[:space:]]+table)'

if printf '%s' "$LOWER_CMD" | grep -Eq "$SQL_PATTERN"; then
  echo "BLOQUEADO: el comando contiene SQL de escritura/DDL (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE)." >&2
  echo "safe-implementer solo puede modificar datos a través de la capa de aplicación (servicios TypeScript con better-sqlite3), no con SQL directo por Bash." >&2
  echo "Comando bloqueado: $COMMAND" >&2
  exit 2
fi

# Borrado o movimiento directo del archivo .db (fuera de npm run db:reset, que es un script documentado)
if printf '%s' "$LOWER_CMD" | grep -Eq '\b(rm|del|mv|move)\b[^&|;]*\.db\b'; then
  echo "BLOQUEADO: el comando intenta borrar o mover el archivo de base de datos directamente." >&2
  echo "Comando bloqueado: $COMMAND" >&2
  exit 2
fi

exit 0
