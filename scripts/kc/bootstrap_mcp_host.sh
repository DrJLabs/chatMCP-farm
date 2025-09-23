#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)
CREATE_SCOPE_SCRIPT="${SCRIPT_DIR}/create_mcp_scope.sh"
STATUS_SCRIPT="${SCRIPT_DIR}/status.sh"
DEFAULT_TRUSTED_ALIAS="Trusted Hosts"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--resource <https://host/mcp>] [--env-file <path>] [options]

Derives an MCP-specific audience scope/mapper name from the target host, ensures the
scope exists, attaches it to default scopes and clients, and updates the Trusted Hosts policy.

Options:
  --resource <url>            Fully-qualified MCP resource URL (e.g. https://svc.example.com/mcp).
  --env-file <path>           Service env file containing MCP_PUBLIC_BASE_URL / PRM_RESOURCE_URL.
  --scope-name <name>         Override the generated client scope name.
  --mapper-name <name>        Override the generated protocol mapper name.
  --attach-client <clientId>  Attach the new scope to a Keycloak client (repeatable).
  --trusted-policy-alias <name> Trusted Hosts policy alias (default: "${DEFAULT_TRUSTED_ALIAS}").
  --verify                    Run status check after applying changes.
  -h, --help                  Show this help.

Notes:
  - Either --resource or --env-file is required. When both are provided, --resource wins.
  - Env files are sourced in a subshell; ensure they do not execute side effects.
USAGE
}

RESOURCE=""
ENV_FILE=""
SCOPE_NAME=""
MAPPER_NAME=""
ATTACH_CLIENTS=()
TRUSTED_ALIAS="${DEFAULT_TRUSTED_ALIAS}"
RUN_VERIFY=false

dedupe_client_ids() {
  python3 - "$@" <<'PY'
import sys
seen = set()
for value in sys.argv[1:]:
    if value and value not in seen:
        seen.add(value)
        print(value)
PY
}

add_unique_clients_to_cmd() {
  local -n cmd_array=$1
  shift
  if [[ $# -eq 0 ]]; then
    return
  fi
  while IFS= read -r cid; do
    [[ -z "${cid}" ]] && continue
    cmd_array+=("--client" "${cid}")
  done < <(dedupe_client_ids "$@")
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource)
      RESOURCE="$2"; shift 2;;
    --env-file)
      ENV_FILE="$2"; shift 2;;
    --scope-name)
      SCOPE_NAME="$2"; shift 2;;
    --mapper-name)
      MAPPER_NAME="$2"; shift 2;;
    --attach-client)
      ATTACH_CLIENTS+=("$2"); shift 2;;
    --trusted-policy-alias)
      TRUSTED_ALIAS="$2"; shift 2;;
    --verify)
      RUN_VERIFY=true; shift 1;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 2;;
  esac
done

if [[ -z "${RESOURCE}" && -n "${ENV_FILE}" ]]; then
  if [[ ! -f "${ENV_FILE}" ]]; then
    echo "error: env file '${ENV_FILE}' not found" >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  RESOURCE=$( \
    set -a
    source "${ENV_FILE}"
    set +a
    printf '%s' "${MCP_PUBLIC_BASE_URL:-${PRM_RESOURCE_URL:-}}"
  )
fi

if [[ -z "${RESOURCE}" ]]; then
  echo "error: --resource or --env-file is required" >&2
  usage
  exit 2
fi

if [[ ! ${RESOURCE} =~ ^https?:// ]]; then
  echo "error: resource '${RESOURCE}' must include protocol (http/https)" >&2
  exit 2
fi

RESOURCE_CLEAN=${RESOURCE%/}
RESOURCE_HOST=$(python3 - "$RESOURCE_CLEAN" <<'PY'
import sys
from urllib.parse import urlparse
url = urlparse(sys.argv[1])
if not url.scheme or not url.netloc:
    raise SystemExit("invalid resource URL")
if not url.hostname:
    raise SystemExit("resource URL missing hostname")
print(url.hostname.lower())
PY
)

slugify() {
  python3 - "$1" <<'PY'
import re, sys
value = sys.argv[1].lower()
slug = re.sub(r'[^a-z0-9]+', '-', value).strip('-')
print(slug or 'mcp-resource')
PY
}

HOST_SLUG_FULL=$(slugify "${RESOURCE_HOST}")

normalize_base() {
  local value=$1
  if [[ $value == mcp-* ]]; then
    printf '%s' "$value"
  else
    printf 'mcp-%s' "$value"
  fi
}

BASE_FULL=$(normalize_base "${HOST_SLUG_FULL}")

if [[ -z "${SCOPE_NAME}" ]]; then
  SCOPE_NAME="${BASE_FULL}-resource"
fi

if [[ -z "${MAPPER_NAME}" ]]; then
  if [[ "${SCOPE_NAME}" == "${BASE_FULL}-resource" ]]; then
    MAPPER_NAME="${BASE_FULL}-audience"
  else
    MAPPER_NAME="${SCOPE_NAME%-resource}-audience"
  fi
fi

CMD=("${CREATE_SCOPE_SCRIPT}" "--resource" "${RESOURCE_CLEAN}" "--scope-name" "${SCOPE_NAME}" "--mapper-name" "${MAPPER_NAME}" "--trusted-policy-alias" "${TRUSTED_ALIAS}")

if [[ ${#ATTACH_CLIENTS[@]} -gt 0 ]]; then
  add_unique_clients_to_cmd CMD "${ATTACH_CLIENTS[@]}"
fi

echo "[bootstrap] ensuring scope '${SCOPE_NAME}' for resource '${RESOURCE_CLEAN}' (mapper '${MAPPER_NAME}')"
"${CMD[@]}"

echo "[bootstrap] scope + trusted host completed"

if [[ ${RUN_VERIFY} == true ]]; then
  STATUS_CMD=("${STATUS_SCRIPT}" "--resource" "${RESOURCE_CLEAN}" "--scope-name" "${SCOPE_NAME}" "--mapper-name" "${MAPPER_NAME}" "--trusted-policy-alias" "${TRUSTED_ALIAS}")
  if [[ ${#ATTACH_CLIENTS[@]} -gt 0 ]]; then
    add_unique_clients_to_cmd STATUS_CMD "${ATTACH_CLIENTS[@]}"
  fi
  echo "[bootstrap] running verification"
  "${STATUS_CMD[@]}"
fi
