#!/usr/bin/env bash
# Shared helpers for Keycloak automation scripts using service-account (client credentials) auth.
set -euo pipefail

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "error: missing dependency '$1'" >&2; exit 1; }
}

load_env_files() {
  local script_dir root_dir top_dir
  script_dir=$(cd "$(dirname "${BASH_SOURCE[1]}" )" && pwd)
  root_dir=$(cd "${script_dir}/../.." && pwd)
  top_dir=$(cd "${root_dir}/.." && pwd)
  for env_file in \
    "${root_dir}/.env" \
    "${root_dir}/.keycloak-env" \
    "${top_dir}/.env" \
    "${top_dir}/.keycloak-env"; do
    if [[ -f "${env_file}" ]]; then
      set -a
      # shellcheck disable=SC1090
      source "${env_file}"
      set +a
    fi
  done
}

initialize_keycloak_client() {
  load_env_files
  require curl
  require jq

  : "${KC_SERVER:?Set KC_SERVER in .keycloak-env}"
  : "${KC_REALM:?Set KC_REALM in .keycloak-env}"
  : "${KC_CLIENT_ID:?Set KC_CLIENT_ID in .keycloak-env}"
  : "${KC_CLIENT_SECRET:?Set KC_CLIENT_SECRET in .keycloak-env}"

  KC_ADMIN_REALM=${KC_ADMIN_REALM:-${KC_REALM}}
  KC_TOKEN_ENDPOINT=${KC_TOKEN_ENDPOINT:-${KC_SERVER%/}/realms/${KC_ADMIN_REALM}/protocol/openid-connect/token}
  KC_BASE_API="${KC_SERVER%/}/admin/realms"

  KC_ACCESS_TOKEN=$(curl -sS -X POST "${KC_TOKEN_ENDPOINT}" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "grant_type=client_credentials&client_id=${KC_CLIENT_ID}&client_secret=${KC_CLIENT_SECRET}" | \
    jq -er '.access_token') || {
    echo "error: failed to obtain access token from ${KC_TOKEN_ENDPOINT}" >&2
    exit 10
  }
}

kc_api() {
  local method=$1
  local path=$2
  local body=${3:-}
  local url="${KC_BASE_API}/${path}"
  local args=("-sS" "-H" "Authorization: Bearer ${KC_ACCESS_TOKEN}")

  if [[ "${method}" != "GET" ]]; then
    args+=("-H" "Content-Type: application/json")
    if [[ -n "${body}" ]]; then
      args+=("--data" "${body}")
    else
      args+=("--data" "{}")
    fi
  fi

  curl "${args[@]}" -X "${method}" "${url}"
}

kc_api_json() {
  local method=$1
  local path=$2
  local body=${3:-}
  kc_api "${method}" "${path}" "${body}" | jq -e '.'
}

kc_api_no_content() {
  local method=$1
  local path=$2
  local body=${3:-}
  local url="${KC_BASE_API}/${path}"
  local args=("-sS" "-o" "/dev/null" "-w" "%{http_code}" "-H" "Authorization: Bearer ${KC_ACCESS_TOKEN}")
  if [[ "${method}" != "GET" ]]; then
    args+=("-H" "Content-Type: application/json")
    if [[ -n "${body}" ]]; then
      args+=("--data" "${body}")
    fi
  fi
  local status
  status=$(curl "${args[@]}" -X "${method}" "${url}")
  if [[ ! "${status}" =~ ^20[0-9]$ ]]; then
    echo "error: request ${method} ${url} returned status ${status}" >&2
    exit 11
  fi
}

find_client_scope_id() {
  local realm=$1
  local scope_name=$2
  kc_api_json GET "${realm}/client-scopes" | jq -r --arg name "${scope_name}" 'map(select(.name == $name)) | .[0].id // empty'
}

find_protocol_mapper_id() {
  local realm=$1
  local scope_id=$2
  local mapper_name=$3
  kc_api_json GET "${realm}/client-scopes/${scope_id}/protocol-mappers/models" | jq -r --arg name "${mapper_name}" 'map(select(.name == $name)) | .[0].id // empty'
}

find_client_uuid() {
  local realm=$1
  local client_id=$2
  kc_api_json GET "${realm}/clients?clientId=${client_id}" | jq -r '.[0].id // empty'
}

get_trusted_hosts_component() {
  local realm=$1
  local alias=${2:-}

  if [[ -n "${alias}" ]]; then
    kc_api_json GET "${realm}/components?providerType=org.keycloak.policy.ClientRegistrationPolicy" \
      | jq -r --arg alias "${alias}" '
        map(select(.providerId == "trusted-hosts"))
        | map(select((.name // "") | ascii_downcase == ($alias | ascii_downcase)))
        | .[0] // empty
      '
  else
    kc_api_json GET "${realm}/components?providerType=org.keycloak.policy.ClientRegistrationPolicy" \
      | jq -r 'map(select(.providerId == "trusted-hosts")) | .[0] // empty'
  fi
}
