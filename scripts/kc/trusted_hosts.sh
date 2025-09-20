#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}" )" && pwd)
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--list|--add host|--remove host] [options]

Manages the Keycloak Trusted Hosts client-registration policy via service-account REST calls.
Defaults to listing the current entries. Use --add/--remove for idempotent updates.

Options:
  --realm <name>                 Realm to target (default: \${KC_REALM:-OMA})
  --alias <name>                 Trusted Hosts policy alias (default: "Trusted Hosts")
  --list                         List current hosts (default if no action provided).
  --add <host>                   Ensure host is present.
  --remove <host>                Remove host if present.
  -h, --help                     Show this help.
USAGE
}

REALM=${KC_REALM:-OMA}
ALIAS="Trusted Hosts"
ACTION="list"
TARGET_HOST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --realm)
      REALM="$2"; shift 2;;
    --alias)
      ALIAS="$2"; shift 2;;
    --list)
      ACTION="list"; shift 1;;
    --add)
      ACTION="add"; TARGET_HOST="$2"; shift 2;;
    --remove)
      ACTION="remove"; TARGET_HOST="$2"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 2;;
  esac
 done

if [[ "${ACTION}" != "list" && -z "${TARGET_HOST}" ]]; then
  echo "error: --add/--remove require a host value" >&2
  exit 2
fi

initialize_keycloak_client

TRUSTED_COMPONENT=$(get_trusted_hosts_component "${REALM}")
if [[ -z "${TRUSTED_COMPONENT}" ]]; then
  echo "error: trusted hosts policy not found in realm '${REALM}'" >&2
  exit 4
fi

COMPONENT_ID=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.id')
COMPONENT_NAME=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.name')
CONFIG_HOSTS=$(printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.config."trusted-hosts" // [] | map(tostring)')

case "${ACTION}" in
  list)
    echo "Trusted Hosts policy: ${COMPONENT_NAME} (${COMPONENT_ID})"
    printf '%s' "${TRUSTED_COMPONENT}" | jq -r '.config."trusted-hosts"[]? | " - " + .' || echo " (no hosts configured)"
    ;;
  add)
    UPDATED=$(printf '%s' "${TRUSTED_COMPONENT}" | jq --arg host "${TARGET_HOST}" '
      .config."trusted-hosts" = ((.config."trusted-hosts" // [])
        | map(select(. != null))
        | map(tostring)
        | if map(. | ascii_downcase) | index($host | ascii_downcase) then . else . + [$host] end)
    ')
    if [[ "${UPDATED}" == "${TRUSTED_COMPONENT}" ]]; then
      echo "host already present"
    else
      kc_api_no_content PUT "${REALM}/components/${COMPONENT_ID}" "${UPDATED}"
      echo "host added"
    fi
    ;;
  remove)
    UPDATED=$(printf '%s' "${TRUSTED_COMPONENT}" | jq --arg host "${TARGET_HOST}" '
      .config."trusted-hosts" = ((.config."trusted-hosts" // [])
        | map(select(. != null))
        | map(tostring)
        | map(select(. | ascii_downcase != ($host | ascii_downcase))))
    ')
    if [[ "${UPDATED}" == "${TRUSTED_COMPONENT}" ]]; then
      echo "host not present"
    else
      kc_api_no_content PUT "${REALM}/components/${COMPONENT_ID}" "${UPDATED}"
      echo "host removed"
    fi
    ;;
esac
