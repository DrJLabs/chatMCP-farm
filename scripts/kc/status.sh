#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") --resource <https://host/mcp> [options]

Summarises Keycloak configuration relevant to MCP servers:
  - Verifies the MCP client scope and mapper
  - Confirms realm default scopes and specified client assignments
  - Lists Trusted Hosts policy entries and highlights the MCP host

Options:
  --realm <name>                 Realm to target (default: \${KC_REALM:-OMA})
  --scope-name <name>            Client scope name to inspect (default: mcp-resource)
  --mapper-name <name>           Protocol mapper name (default: mcp-audience)
  --trusted-policy-alias <name>  Trusted Hosts policy alias (default: "Trusted Hosts")
  --resource <https://host/mcp>  MCP resource URL (highlights audience + host)
  --client <clientId>            Verify client default scopes (repeatable). Defaults to none.
  -h, --help                     Show this help.
USAGE
}

REALM=${KC_REALM:-OMA}
SCOPE_NAME="mcp-resource"
MAPPER_NAME="mcp-audience"
TRUSTED_POLICY_ALIAS="Trusted Hosts"
RESOURCE=""
CLIENTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --realm)
      REALM="$2"; shift 2;;
    --scope-name)
      SCOPE_NAME="$2"; shift 2;;
    --mapper-name)
      MAPPER_NAME="$2"; shift 2;;
    --trusted-policy-alias)
      TRUSTED_POLICY_ALIAS="$2"; shift 2;;
    --resource)
      RESOURCE="$2"; shift 2;;
    --client)
      CLIENTS+=("$2"); shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 2;;
  esac
 done

initialize_keycloak_client

echo "== Scope & mapper =="
SCOPE_ID=$(find_client_scope_id "${REALM}" "${SCOPE_NAME}")
if [[ -z "${SCOPE_ID}" ]]; then
  echo "missing scope '${SCOPE_NAME}'"
  exit 4
fi
echo "scope id: ${SCOPE_ID}"
SCOPE_DESCRIPTION=$(kc_api_json GET "${REALM}/client-scopes/${SCOPE_ID}" | jq -r '.description // ""')
echo "description: ${SCOPE_DESCRIPTION}"

MAPPER_DATA=$(kc_api_json GET "${REALM}/client-scopes/${SCOPE_ID}/protocol-mappers/models" | jq -c --arg name "${MAPPER_NAME}" 'map(select(.name == $name)) | .[0] // null')
if [[ "${MAPPER_DATA}" == "null" ]]; then
  echo "mapper '${MAPPER_NAME}' not found"
else
  echo "mapper present"
  if [[ -n "${RESOURCE}" ]]; then
    AUDIENCE=$(printf '%s' "${MAPPER_DATA}" | jq -r '.config."included.custom.audience" // ""')
    if [[ "${AUDIENCE}" == "${RESOURCE}" ]]; then
      echo "audience matches resource"
    else
      echo "audience mismatch -> ${AUDIENCE}"
    fi
  fi
fi

echo "\n== Realm default scopes =="
DEFAULT_IDS=$(kc_api_json GET "${REALM}/default-default-client-scopes" | jq -r '.[].id')
if echo "${DEFAULT_IDS}" | grep -q "${SCOPE_ID}"; then
  echo "scope '${SCOPE_NAME}' assigned to default scopes"
else
  echo "scope '${SCOPE_NAME}' missing from realm defaults"
fi

if [[ ${#CLIENTS[@]} -gt 0 ]]; then
  declare -A seen=()
  declare -a uniq=()
  for cid in "${CLIENTS[@]}"; do
    [[ -z "${cid}" ]] && continue
    if [[ -z "${seen[${cid}]:-}" ]]; then
      seen["${cid}"]=1
      uniq+=("${cid}")
    fi
  done
  CLIENTS=("${uniq[@]}")
fi

if [[ ${#CLIENTS[@]} -gt 0 ]]; then
  echo "\n== Client default scopes =="
  for client_id in "${CLIENTS[@]}"; do
    CLIENT_UUID=$(find_client_uuid "${REALM}" "${client_id}")
    if [[ -z "${CLIENT_UUID}" ]]; then
      echo "${client_id}: not found"
      continue
    fi
    HAS_SCOPE=$(kc_api_json GET "${REALM}/clients/${CLIENT_UUID}/default-client-scopes" | jq -r '.[].id')
    if echo "${HAS_SCOPE}" | grep -q "${SCOPE_ID}"; then
      echo "${client_id}: scope attached"
    else
      echo "${client_id}: scope missing"
    fi
  done
fi

echo "\n== Trusted Hosts policy =="
TRUSTED_COMPONENT=$(get_trusted_hosts_component "${REALM}")
if [[ -z "${TRUSTED_COMPONENT}" ]]; then
  echo "trusted hosts policy not found"
else
  COMPONENT_NAME=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.name')
  echo "policy: ${COMPONENT_NAME}"
  HOSTS=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.config."trusted-hosts"[]?')
  if [[ -z "${HOSTS}" ]]; then
    echo " (no hosts configured)"
  else
    RESOURCE_HOST=""
    if [[ -n "${RESOURCE}" ]]; then
      RESOURCE_HOST=$(python3 -c 'from urllib.parse import urlparse; import sys
url = urlparse(sys.argv[1])
print((url.hostname or "").lower())
' "${RESOURCE}" || true)
    fi
    while IFS= read -r host; do
      marker=""
      if [[ -n "${RESOURCE_HOST}" && "${RESOURCE_HOST}" == "${host,,}" ]]; then
        marker=" <-- matches resource"
      fi
      echo " - ${host}${marker}"
    done <<< "${HOSTS}"
  fi
fi

echo "\nDone."
