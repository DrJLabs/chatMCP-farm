#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") --resource <https://host/mcp> [options]

Ensures the Keycloak client scope and protocol mapper required for MCP servers exist,
attaches the scope to default/client assignments, and updates the Trusted Hosts policy.

Options:
  --realm <name>                 Realm to target (default: \\${KC_REALM:-OMA})
  --scope-name <name>            Client scope name (default: mcp-resource)
  --mapper-name <name>           Protocol mapper name (default: mcp-audience)
  --trusted-policy-alias <name>  Trusted Hosts policy alias (default: "Trusted Hosts")
  --client <clientId>            Attach scope to client (repeatable). Defaults to none.
  --no-default-clients           Historical flag (no-op; kept for compatibility).
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
    --no-default-clients)
      CLIENTS=(); shift 1;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 2;;
  esac
 done

if [[ -z "${RESOURCE}" ]]; then
  echo "error: --resource is required" >&2
  usage
  exit 2
fi

initialize_keycloak_client
require python3

echo "== Ensuring client scope '${SCOPE_NAME}' in realm '${REALM}'"
SCOPE_ID=$(find_client_scope_id "${REALM}" "${SCOPE_NAME}")
if [[ -z "${SCOPE_ID}" ]]; then
  kc_api_no_content POST "${REALM}/client-scopes" "$(jq -n --arg name "${SCOPE_NAME}" '{name: $name, description: "MCP resource audience", protocol: "openid-connect"}')"
  SCOPE_ID=$(find_client_scope_id "${REALM}" "${SCOPE_NAME}")
  echo "  created scope (${SCOPE_ID})"
else
  echo "  scope already exists (${SCOPE_ID})"
fi

MAPPER_PAYLOAD=$(jq -n \
  --arg name "${MAPPER_NAME}" \
  --arg resource "${RESOURCE}" \
  '{
    name: $name,
    protocol: "openid-connect",
    protocolMapper: "oidc-audience-mapper",
    consentRequired: false,
    config: {
      "access.token.claim": "true",
      "id.token.claim": "false",
      "introspection.token.claim": "false",
      "userinfo.token.claim": "false",
      "included.client.audience": "",
      "included.custom.audience": $resource
    }
  }')

echo "== Ensuring protocol mapper '${MAPPER_NAME}'"
MAPPER_ID=$(find_protocol_mapper_id "${REALM}" "${SCOPE_ID}" "${MAPPER_NAME}")
if [[ -z "${MAPPER_ID}" ]]; then
  kc_api_no_content POST "${REALM}/client-scopes/${SCOPE_ID}/protocol-mappers/models" "${MAPPER_PAYLOAD}"
  echo "  mapper created"
else
  kc_api_no_content PUT "${REALM}/client-scopes/${SCOPE_ID}/protocol-mappers/models/${MAPPER_ID}" "${MAPPER_PAYLOAD}"
  echo "  mapper updated"
fi

echo "== Ensuring scope is a realm default"
DEFAULT_IDS=$(kc_api_json GET "${REALM}/default-default-client-scopes" | jq -r '.[].id')
if echo "${DEFAULT_IDS}" | grep -Fxq "${SCOPE_ID}"; then
  echo "  already present in realm default scopes"
else
  kc_api_no_content PUT "${REALM}/default-default-client-scopes/${SCOPE_ID}"
  echo "  added to realm default scopes"
fi

if [[ ${#CLIENTS[@]} -gt 0 ]]; then
  declare -A seen_client=()
  declare -a unique_clients=()
  for cid in "${CLIENTS[@]}"; do
    [[ -z "${cid}" ]] && continue
    if [[ -z "${seen_client[${cid}]:-}" ]]; then
      seen_client["${cid}"]=1
      unique_clients+=("${cid}")
    fi
  done
  CLIENTS=("${unique_clients[@]}")

  if [[ ${#CLIENTS[@]} -gt 0 ]]; then
    echo "== Attaching scope to clients"
    for client_id in "${CLIENTS[@]}"; do
      CLIENT_UUID=$(find_client_uuid "${REALM}" "${client_id}")
      if [[ -z "${CLIENT_UUID}" ]]; then
        echo "  warning: client '${client_id}' not found" >&2
        continue
      fi
      ASSIGNED=$(kc_api_json GET "${REALM}/clients/${CLIENT_UUID}/default-client-scopes" | jq -r '.[].id')
      if echo "${ASSIGNED}" | grep -Fxq "${SCOPE_ID}"; then
        echo "  ${client_id}: already configured"
      else
        kc_api_no_content PUT "${REALM}/clients/${CLIENT_UUID}/default-client-scopes/${SCOPE_ID}"
        echo "  ${client_id}: scope attached"
      fi
    done
  fi
fi

RESOURCE_HOST=$(python3 -c 'from urllib.parse import urlparse; import sys
url = urlparse(sys.argv[1])
if not url.scheme or not url.netloc:
    raise SystemExit("invalid resource URL")
if not url.hostname:
    raise SystemExit("resource URL missing hostname")
print(url.hostname)
' "${RESOURCE}")

echo "== Ensuring Trusted Hosts includes '${RESOURCE_HOST}'"
TRUSTED_COMPONENT=$(get_trusted_hosts_component "${REALM}" "${TRUSTED_POLICY_ALIAS}")
if [[ -z "${TRUSTED_COMPONENT}" ]]; then
  echo "  warning: trusted hosts policy '${TRUSTED_POLICY_ALIAS}' not found in realm '${REALM}'" >&2
else
  COMPONENT_ID=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.id')
  COMPONENT_NAME=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.name')
  UPDATED_COMPONENT=$(printf '%s' "${TRUSTED_COMPONENT}" | jq --arg host "${RESOURCE_HOST}" '
    .config."trusted-hosts" = ((.config."trusted-hosts" // [])
      | map(select(. != null))
      | map(tostring)
      | if map(. | ascii_downcase) | index($host | ascii_downcase) then . else . + [$host] end)
  ' )
  if [[ $(printf '%s' "${UPDATED_COMPONENT}" | jq -r --arg host "${RESOURCE_HOST}" '.config."trusted-hosts" | map(ascii_downcase) | index($host | ascii_downcase)') != "null" ]]; then
    if [[ "${UPDATED_COMPONENT}" == "${TRUSTED_COMPONENT}" ]]; then
      echo "  policy '${COMPONENT_NAME}' already includes host"
    else
      kc_api_no_content PUT "${REALM}/components/${COMPONENT_ID}" "${UPDATED_COMPONENT}"
      echo "  updated policy '${COMPONENT_NAME}'"
    fi
  fi
fi

echo "Done."
