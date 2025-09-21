#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/healthcheck.sh --base-url <https://host/mcp> --issuer <https://keycloak/.../realms/REALM> \
        --client-id <id> [--client-secret <secret>] [--resource-url <url>] [--manifest-url <url>] \
        [--prm-url <url>] [--schema <version>] [--sse] [--help]

Environment variable fallbacks:
  MCP_TRANSPORT_URL, MCP_BASE_URL, MCP_PUBLIC_BASE_URL, KC_ISSUER, CLIENT_ID,
  CLIENT_SECRET, MCP_RESOURCE_URL, PRM_RESOURCE_URL, MCP_MANIFEST_URL,
  MCP_PRM_URL, MCP_SCHEMA.

The script validates:
  1. MCP manifest availability and schema version.
  2. OAuth protected resource metadata.
  3. Token acquisition via client credentials.
  4. Streamable HTTP initialize call using the issued token.
  5. Optional SSE HEAD probe when --sse is supplied.

Requires: curl, jq.
USAGE
}

log() { printf '\033[1m[healthcheck]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[healthcheck][ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v jq >/dev/null || fail "jq is required"

readonly CURL_OPTS=(
  --show-error
  --silent
  --location
  --retry 2
  --retry-delay 1
  --connect-timeout 5
  --max-time 20
)

BASE_URL=${MCP_BASE_URL:-${MCP_TRANSPORT_URL:-}}
if [[ -z "${BASE_URL}" && -n "${MCP_PUBLIC_BASE_URL:-}" ]]; then
  BASE_URL="${MCP_PUBLIC_BASE_URL%/}/mcp"
fi
ISSUER=${KC_ISSUER:-}
CLIENT_ID=${CLIENT_ID:-}
CLIENT_SECRET=${CLIENT_SECRET:-}
RESOURCE_URL=${MCP_RESOURCE_URL:-${PRM_RESOURCE_URL:-${MCP_PUBLIC_BASE_URL:-${BASE_URL:-}}}}
MANIFEST_URL=${MCP_MANIFEST_URL:-}
PRM_URL=${MCP_PRM_URL:-}
SCHEMA_VERSION=${MCP_SCHEMA:-2025-06-18}
CHECK_SSE=false
SECRET_FROM_FLAG=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL=$2; shift 2 ;;
    --issuer) ISSUER=$2; shift 2 ;;
    --client-id) CLIENT_ID=$2; shift 2 ;;
    --client-secret) CLIENT_SECRET=$2; SECRET_FROM_FLAG=true; shift 2 ;;
    --resource-url) RESOURCE_URL=$2; shift 2 ;;
    --manifest-url) MANIFEST_URL=$2; shift 2 ;;
    --prm-url) PRM_URL=$2; shift 2 ;;
    --schema) SCHEMA_VERSION=$2; shift 2 ;;
    --sse) CHECK_SSE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ -z "$BASE_URL" ]] && fail "--base-url (or MCP_TRANSPORT_URL/MCP_BASE_URL/MCP_PUBLIC_BASE_URL) is required"
[[ -z "$ISSUER" ]] && fail "--issuer (or KC_ISSUER) is required"
[[ -z "$CLIENT_ID" ]] && fail "--client-id (or CLIENT_ID env) is required"
[[ -z "$CLIENT_SECRET" ]] && fail "--client-secret (or CLIENT_SECRET env) is required"
if [[ "$SECRET_FROM_FLAG" == true ]]; then
  log "WARNING: --client-secret on CLI is unsafe (visible in process list). Prefer CLIENT_SECRET env."
fi

# Normalise URLs (strip trailing slashes)
trim_trailing_slash() {
  local value=$1
  value=${value%/}
  printf '%s' "$value"
}
BASE_URL=$(trim_trailing_slash "$BASE_URL")
ISSUER=$(trim_trailing_slash "$ISSUER")
RESOURCE_URL=$(trim_trailing_slash "$RESOURCE_URL")

if [[ -z "$RESOURCE_URL" ]]; then
  RESOURCE_URL=$BASE_URL
fi

if [[ -z "$MANIFEST_URL" || -z "$PRM_URL" ]]; then
  _tmp=${BASE_URL#*://}
  ORIGIN="${BASE_URL%%://*}://${_tmp%%/*}"
  [[ -z "$MANIFEST_URL" ]] && MANIFEST_URL="${ORIGIN}/.well-known/mcp/manifest.json"
  [[ -z "$PRM_URL" ]] && PRM_URL="${ORIGIN}/.well-known/oauth-protected-resource"
fi

SSE_URL="${BASE_URL}/sse"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

log "Manifest check: $MANIFEST_URL"
manifest_json=$(curl "${CURL_OPTS[@]}" --fail "$MANIFEST_URL") || fail "Unable to fetch manifest"
schema=$(jq -r '.schemaVersion // empty' <<<"$manifest_json")
if [[ "$schema" != "$SCHEMA_VERSION" ]]; then
  fail "Unexpected schemaVersion: $schema (expected $SCHEMA_VERSION). Override with --schema or MCP_SCHEMA."
fi
resource_from_manifest=$(jq -r '(.resources[0].url // "")' <<<"$manifest_json")
if [[ -n "$resource_from_manifest" && "$resource_from_manifest" != "$RESOURCE_URL" ]]; then
  fail "Manifest resource mismatch: expected $RESOURCE_URL got $resource_from_manifest"
fi

log "Protected resource metadata: $PRM_URL"
prm_json=$(curl "${CURL_OPTS[@]}" --fail "$PRM_URL") || fail "Unable to fetch protected resource metadata"
resource=$(jq -r '.resource // empty' <<<"$prm_json")
if [[ "$resource" != "$RESOURCE_URL" ]]; then
  fail "Protected resource mismatch: expected $RESOURCE_URL got $resource"
fi

TOKEN_URL="${ISSUER}/protocol/openid-connect/token"
log "Requesting token from $TOKEN_URL"
status=$(curl "${CURL_OPTS[@]}" -o "$TMPDIR/token.json" -w '%{http_code}' \
  -X POST "$TOKEN_URL" \
  -H 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --data-urlencode "client_secret=${CLIENT_SECRET}" \
  --data-urlencode "resource=${RESOURCE_URL}")
if [[ "$status" != "200" ]]; then
  cat "$TMPDIR/token.json" >&2
  fail "Token request failed with status $status"
fi
access_token=$(jq -r '.access_token // empty' "$TMPDIR/token.json")
[[ -z "$access_token" ]] && fail "Token response missing access_token"

log "Calling Streamable HTTP transport"
initialize_payload=$(jq -n --compact-output --arg v "$SCHEMA_VERSION" '{jsonrpc:"2.0",id:"healthcheck",method:"initialize",params:{protocolVersion:$v,capabilities:{},clientInfo:{name:"healthcheck",version:"0.1"}}}')
status=$(curl "${CURL_OPTS[@]}" -o "$TMPDIR/initialize.json" -w '%{http_code}' \
  -D "$TMPDIR/initialize.headers" \
  -H "Authorization: Bearer ${access_token}" \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -X POST "$BASE_URL" \
  -d "$initialize_payload")
if [[ "$status" != "200" ]]; then
  cat "$TMPDIR/initialize.json" >&2
  fail "Initialize call failed with status $status"
fi
jq -e '.result' "$TMPDIR/initialize.json" >/dev/null 2>&1 || fail "Initialize response missing result"
if ! grep -qi 'Mcp-Session-Id' "$TMPDIR/initialize.headers"; then
  fail "Initialize response missing Mcp-Session-Id header"
fi

if $CHECK_SSE; then
  log "HEAD probe for SSE at ${SSE_URL}"
  status=$(curl "${CURL_OPTS[@]}" -o /dev/null -w '%{http_code}' -I -H "Authorization: Bearer ${access_token}" "$SSE_URL")
  if [[ "$status" != "204" && "$status" != "200" && "$status" != "405" ]]; then
    fail "SSE head check failed with status $status"
  fi
fi

log "All checks passed for $BASE_URL"
echo "healthcheck ok"
