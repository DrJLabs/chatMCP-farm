#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
COMPOSE_FILES=("${ROOT_DIR}/docker-compose.yml")

while IFS= read -r -d '' file; do
  COMPOSE_FILES+=("${file}")
done < <(find "${ROOT_DIR}/services" -mindepth 2 -maxdepth 2 -name compose.yml -print0 | sort -z)

if [[ ${#COMPOSE_FILES[@]} -eq 1 ]]; then
  echo "warning: no service compose.yml files found under services/*/" >&2
fi

COMPOSE_FILE=$(IFS=:; echo "${COMPOSE_FILES[*]}")
export COMPOSE_FILE

# Ensure services have a sane default build context without requiring callers to
# export MCP_BUILD_CONTEXT manually. Individual services can still override.
export MCP_BUILD_CONTEXT="${MCP_BUILD_CONTEXT:-${ROOT_DIR}}"

exec docker compose "$@"
