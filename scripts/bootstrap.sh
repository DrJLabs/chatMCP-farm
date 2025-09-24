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
prefix = service.upper().replace('-', '_')
if prefix and prefix[0].isdigit():
    prefix = f"_{prefix}"
dest = Path(os.environ['DEST_DIR'])
for path in dest.rglob('*'):
    if path.is_file():
        text = path.read_text()
        text = text.replace('__SERVICE_NAME__', service)
        text = text.replace('__SERVICE_ENV_PREFIX__', prefix)
        path.write_text(text)
PY

BOOTSTRAP_SERVICE_NAME="${SERVICE_NAME}" ROOT_DIR="${ROOT_DIR}" python3 - <<'PY'
import fnmatch
import json
import os
from pathlib import Path
service = os.environ['BOOTSTRAP_SERVICE_NAME']
root = Path(os.environ['ROOT_DIR'])
pkg_path = root / 'package.json'
if pkg_path.exists():
    data = json.loads(pkg_path.read_text())
    workspaces = data.get('workspaces')
    changed = False
    entry = f'services/{service}'
    def covered_by_glob(patterns, candidate):
        for pattern in patterns:
            if isinstance(pattern, str) and any(ch in pattern for ch in '*?['):
                if fnmatch.fnmatch(candidate, pattern):
                    return True
        return False
    if isinstance(workspaces, list):
        patterns = [p for p in workspaces if isinstance(p, str)]
        if entry not in patterns and not covered_by_glob(patterns, entry):
            workspaces.append(entry)
            changed = True
    elif isinstance(workspaces, dict):
        packages = workspaces.setdefault('packages', [])
        patterns = [p for p in packages if isinstance(p, str)]
        if entry not in patterns and not covered_by_glob(patterns, entry):
            packages.append(entry)
            changed = True
    elif workspaces is None:
        data['workspaces'] = [entry]
        changed = True
    else:
        data['workspaces'] = [workspaces, entry]
        changed = True
    if changed:
        pkg_path.write_text(json.dumps(data, indent=2) + '\n')
PY

cat <<NOTE
Created services/${SERVICE_NAME}.
Next steps:
  1. Copy services/${SERVICE_NAME}/.env.example to .env and set resource URLs + issuer.
  2. Update services/${SERVICE_NAME}/README.md and src/mcp.ts with real tools.
  3. Run the Express 5 baseline workflow:
       npm install --workspace services/${SERVICE_NAME}
       npm run lint --workspace services/${SERVICE_NAME}
       npm run test -- --coverage --workspace services/${SERVICE_NAME}
       npm run build --workspace services/${SERVICE_NAME}
       npm run smoke --workspace services/${SERVICE_NAME}
       npm run postbump:test
       npm ls express --workspace services/${SERVICE_NAME}
  4. Add the service to docker-compose.yml (templates/service/compose.yml shows labels).
NOTE
