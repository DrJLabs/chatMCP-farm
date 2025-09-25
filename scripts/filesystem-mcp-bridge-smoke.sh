#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG=${1:-filesystem-mcp-bridge:local}
EXPECTED_VERSION="0.9.0"

echo "[filesystem-mcp] Asserting mcp-proxy version on image ${IMAGE_TAG}" >&2
version_output=$(docker run --rm --entrypoint mcp-proxy "$IMAGE_TAG" --version)
if [[ "$version_output" != *"${EXPECTED_VERSION}"* ]]; then
  echo "mcp-proxy version check failed. Expected ${EXPECTED_VERSION}, got: ${version_output}" >&2
  exit 1
fi

echo "[filesystem-mcp] Version OK: ${version_output}" >&2

echo "[filesystem-mcp] Verifying entrypoint rejects empty FS_ALLOWED" >&2
if docker run --rm -e FS_ALLOWED="" "$IMAGE_TAG" >/dev/null 2>&1; then
  echo "Entrypoint accepted empty FS_ALLOWED; expected failure" >&2
  exit 1
fi

echo "[filesystem-mcp] Verifying SSE port 12010 is reachable" >&2
if command -v uuidgen >/dev/null 2>&1; then
  container_suffix=$(uuidgen | tr '[:upper:]' '[:lower:]')
else
  container_suffix=$(head /dev/urandom | tr -dc 'a-z0-9' | head -c 12)
fi
container_name="filesystem-mcp-bridge-smoke-${container_suffix}"
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker run --rm -d --name "$container_name" -e FS_ALLOWED=/tmp "$IMAGE_TAG" >/dev/null

timeout 15 docker exec "$container_name" python3 - <<'PY'
import os
import socket
import sys
import time

port = int(os.environ.get("SSE_PORT", "12010"))
deadline = time.time() + 10

while time.time() < deadline:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.5)

print(f"Failed to connect to localhost:{port} inside container", file=sys.stderr)
sys.exit(1)
PY

status=$?
if [[ $status -ne 0 ]]; then
  if [[ $status -eq 124 ]]; then
    echo "Container socket test timed out" >&2
  else
    echo "Container socket test failed" >&2
  fi
  exit 1
fi

cleanup
trap - EXIT

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
STORY_FILE="$REPO_ROOT/docs/stories/4.1.filesystem-mcp-bridge-container.md"

echo "[filesystem-mcp] Verifying documentation references match validated commands" >&2
if ! grep -q 'docker build -f services/filesystem-mcp/Bridge.Dockerfile' "$STORY_FILE"; then
  echo "Story dev notes missing docker build command." >&2
  exit 1
fi

if ! grep -q 'scripts/filesystem-mcp-bridge-smoke.sh filesystem-mcp-bridge:local' "$STORY_FILE"; then
  echo "Story dev notes missing smoke script reference." >&2
  exit 1
fi

echo "[filesystem-mcp] Smoke checks passed" >&2
