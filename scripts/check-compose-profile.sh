#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
SERVICE_ENV="${ROOT_DIR}/services/mcp-test-server/.env"
NEEDS_CLEANUP=false

if [[ ! -f "${SERVICE_ENV}" ]]; then
  cp "${ROOT_DIR}/services/mcp-test-server/.env.example" "${SERVICE_ENV}"
  NEEDS_CLEANUP=true
fi

trap 'if [[ "${NEEDS_CLEANUP}" == true ]]; then rm -f "${SERVICE_ENV}"; fi' EXIT

export MCP_NETWORK_EXTERNAL=${MCP_NETWORK_EXTERNAL:-traefik}
COMPOSE_PROFILES=mcp-test-server "${ROOT_DIR}/scripts/compose.sh" --profile mcp-test-server config >/dev/null
