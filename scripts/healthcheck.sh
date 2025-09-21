#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/healthcheck.sh --base-url <https://host/mcp> --issuer <https://keycloak/.../realms/REALM> \
        --client-id <id> --client-secret <secret> [--resource-url <url>] [--manifest-url <url>] \
        [--prm-url <url>] [--sse] [--help]

Environment variable fallbacks:
  MCP_BASE_URL, KC_ISSUER, CLIENT_ID, CLIENT_SECRET, MCP_RESOURCE_URL,
  MCP_MANIFEST_URL, MCP_PRM_URL.

The script validates:
  1. MCP manifest availability and schema version.
  2. OAuth protected resource metadata.
  3. Token acquisition via client credentials.
  4. Streamable HTTP initialize call using the issued token.
  5. Optional SSE HEAD probe when --sse is supplied.

Requires: curl, jq, base64.
USAGE
}

log() { printf '\033[1m[healthcheck]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[healthcheck][ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl is required"
command -v jq >/dev/null || fail "jq is required"
command -v base64 >/dev/null || fail "base64 is required"

BASE_URL=${MCP_BASE_URL:-}
ISSUER=${KC_ISSUER:-}
CLIENT_ID=${CLIENT_ID:-}
CLIENT_SECRET=${CLIENT_SECRET:-}
RESOURCE_URL=${MCP_RESOURCE_URL:-}
MANIFEST_URL=${MCP_MANIFEST_URL:-}
PRM_URL=${MCP_PRM_URL:-}
CHECK_SSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL=$2; shift 2 ;;
    --issuer) ISSUER=$2; shift 2 ;;
    --client-id) CLIENT_ID=$2; shift 2 ;;
    --client-secret) CLIENT_SECRET=$2; shift 2 ;;
    --resource-url) RESOURCE_URL=$2; shift 2 ;;
    --manifest-url) MANIFEST_URL=$2; shift 2 ;;
    --prm-url) PRM_URL=$2; shift 2 ;;
    --sse) CHECK_SSE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ -z "$BASE_URL" ]] && fail "--base-url (or MCP_BASE_URL) is required"
[[ -z "$ISSUER" ]] && fail "--issuer (or KC_ISSUER) is required"
[[ -z "$CLIENT_ID" ]] && fail "--client-id (or CLIENT_ID env) is required"
[[ -z "$CLIENT_SECRET" ]] && fail "--client-secret (or CLIENT_SECRET env) is required"

# Normalise URLs (strip trailing slashes)
trim_trailing_slash() {
  local value=$1
  value=${value%/}
  printf '%s' "$value"
}
BASE_URL=$(trim_trailing_slash "$BASE_URL")
ISSUER=$(trim_trailing_slash "$ISSUER")

if [[ -z "$RESOURCE_URL" ]]; then
  RESOURCE_URL=$BASE_URL
fi

if [[ -z "$MANIFEST_URL" || -z "$PRM_URL" ]]; then
  ORIGIN=$(python - "$BASE_URL" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit
url = sys.argv[1]
parts = urlsplit(url)
origin = urlunsplit((parts.scheme, parts.netloc, '', '', ''))
print(origin)
PY
)
  [[ -z "$MANIFEST_URL" ]] && MANIFEST_URL="${ORIGIN}/.well-known/mcp/manifest.json"
  [[ -z "$PRM_URL" ]] && PRM_URL="${ORIGIN}/.well-known/oauth-protected-resource"
fi

SSE_URL="${BASE_URL}/sse"
if $CHECK_SSE; then
  # Prefer /mcp/sse if base ends with /mcp
  if [[ "$BASE_URL" == */mcp ]]; then
    SSE_URL="${BASE_URL}/sse"
  fi
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

log "Manifest check: $MANIFEST_URL"
manifest_json=$(curl -fsS "$MANIFEST_URL") || fail "Unable to fetch manifest"
schema=$(jq -r '.schemaVersion // empty' <<<"$manifest_json")
if [[ "$schema" != "2025-06-18" ]]; then
  fail "Unexpected schemaVersion: $schema"
fi
resource_from_manifest=$(jq -r '.resources[0].url // empty' <<<"$manifest_json" 2>/dev/null || true)
if [[ -n "$resource_from_manifest" && "$resource_from_manifest" != "$RESOURCE_URL" ]]; then
  fail "Manifest resource mismatch: expected $RESOURCE_URL got $resource_from_manifest"
fi

log "Protected resource metadata: $PRM_URL"
prm_json=$(curl -fsS "$PRM_URL") || fail "Unable to fetch protected resource metadata"
resource=$(jq -r '.resource // empty' <<<"$prm_json")
if [[ "$resource" != "$RESOURCE_URL" ]]; then
  fail "Protected resource mismatch: expected $RESOURCE_URL got $resource"
fi

TOKEN_URL="${ISSUER}/protocol/openid-connect/token"
log "Requesting token from $TOKEN_URL"
status=$(curl -sS -o "$TMPDIR/token.json" -w '%{http_code}' \
  -X POST "$TOKEN_URL" \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&resource=${RESOURCE_URL}")
if [[ "$status" != "200" ]]; then
  cat "$TMPDIR/token.json" >&2
  fail "Token request failed with status $status"
fi
access_token=$(jq -r '.access_token // empty' "$TMPDIR/token.json")
[[ -z "$access_token" ]] && fail "Token response missing access_token"

log "Calling Streamable HTTP transport"
initialize_payload='{"jsonrpc":"2.0","id":"healthcheck","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"healthcheck","version":"0.1"}}}'
status=$(curl -sS -o "$TMPDIR/initialize.json" -w '%{http_code}' \
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
if ! grep -qi 'Mcp-Session-Id' "$TMPDIR/initialize.headers" >/dev/null; then
  fail "Initialize response missing Mcp-Session-Id header"
fi

if $CHECK_SSE; then
  log "HEAD probe for SSE at ${SSE_URL}"
  status=$(curl -sS -o /dev/null -w '%{http_code}' -I -H "Authorization: Bearer ${access_token}" "$SSE_URL")
  if [[ "$status" != "204" && "$status" != "200" ]]; then
    fail "SSE head check failed with status $status"
  fi
fi

log "All checks passed for $BASE_URL"
echo "healthcheck ok"
