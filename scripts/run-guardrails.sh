#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

"${SCRIPT_DIR}/check-inline-secrets.mjs"
"${SCRIPT_DIR}/check-compose-profile.sh"
