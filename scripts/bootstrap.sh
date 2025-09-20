#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd "${SCRIPT_DIR}/.." && pwd)
TEMPLATE_DIR="${ROOT_DIR}/templates/service"
SERVICES_DIR="${ROOT_DIR}/services"

usage() {
  cat <<USAGE
Usage: $(basename "$0") <service-name>

Scaffolds a new MCP service inside services/<service-name> using templates/service.
Service name should contain lowercase letters, numbers, or dashes.
USAGE
}

if [[ ${1:-} == "" ]]; then
  usage
  exit 1
fi

SERVICE_NAME="$1"
if [[ ! ${SERVICE_NAME} =~ ^[a-z0-9-]+$ ]]; then
  echo "error: service name must match ^[a-z0-9-]+$" >&2
  exit 1
fi

if [[ ! -d "${TEMPLATE_DIR}" ]]; then
  echo "error: template directory ${TEMPLATE_DIR} not found" >&2
  exit 1
fi

DEST_DIR="${SERVICES_DIR}/${SERVICE_NAME}"
if [[ -e "${DEST_DIR}" ]]; then
  echo "error: destination ${DEST_DIR} already exists" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"
cp -R "${TEMPLATE_DIR}/." "${DEST_DIR}"/

BOOTSTRAP_SERVICE_NAME="${SERVICE_NAME}" DEST_DIR="${DEST_DIR}" python3 - <<'PY'
import os
from pathlib import Path
service = os.environ['BOOTSTRAP_SERVICE_NAME']
dest = Path(os.environ['DEST_DIR'])
for path in dest.rglob('*'):
    if path.is_file():
        text = path.read_text()
        text = text.replace('__SERVICE_NAME__', service)
        path.write_text(text)
PY

cat <<NOTE
Created services/${SERVICE_NAME}.
Next steps:
  1. Copy services/${SERVICE_NAME}/.env.example to .env and set resource URLs + issuer.
  2. Update services/${SERVICE_NAME}/README.md and src/mcp.ts with real tools.
  3. Run npm install --workspace services/${SERVICE_NAME} and npm run build --workspace services/${SERVICE_NAME}.
  4. Add the service to docker-compose.yml (templates/service/compose.snippet.yml shows labels).
NOTE
