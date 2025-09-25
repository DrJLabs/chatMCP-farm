#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CACHE_ROOT="$REPO_ROOT/.bmad-cache/reviewer"
ARTIFACT_ROOT="$REPO_ROOT/artifacts/reviewer"
LOG_DIR="$REPO_ROOT/.ai"

SEM_BIN=${SEMgrep_BIN:-}
JSCPD_BIN=${JSCPD_BIN:-}
MIN_SEMGREP="1.86.0"
MIN_JSCPD="3.5.4"

log() {
  echo "[preflight] $1"
}

semver_gte() {
  # usage: semver_gte version_a version_b (returns success if a >= b)
  local IFS=.
  local i ver1=($1) ver2=($2)
  # fill empty fields in ver1 with zeros
  for ((i=${#ver1[@]}; i<${#ver2[@]}; i++)); do
    ver1[i]=0
  done
  for ((i=0; i<${#ver1[@]}; i++)); do
    if [[ -z ${ver2[i]} ]]; then
      ver2[i]=0
    fi
    if ((10#${ver1[i]} > 10#${ver2[i]})); then
      return 0
    fi
    if ((10#${ver1[i]} < 10#${ver2[i]})); then
      return 1
    fi
  done
  return 0
}

resolve_semgrep() {
  if [[ -n "$SEM_BIN" ]]; then
    if ! command -v "$SEM_BIN" >/dev/null 2>&1; then
      echo "ERROR: SEMgrep_BIN=$SEM_BIN not found in PATH." >&2
      exit 1
    fi
    echo "$SEM_BIN"
    return
  fi
  if command -v semgrep >/dev/null 2>&1; then
    echo "semgrep"
    return
  fi
  echo "ERROR: semgrep CLI not found. Install via pipx (pipx install semgrep) or see https://semgrep.dev/docs/getting-started/" >&2
  exit 1
}

resolve_jscpd() {
  if [[ -n "$JSCPD_BIN" ]]; then
    if ! command -v "$JSCPD_BIN" >/dev/null 2>&1; then
      echo "ERROR: JSCPD_BIN=$JSCPD_BIN not found in PATH." >&2
      exit 1
    fi
    echo "$JSCPD_BIN"
    return
  fi
  # fallback to npx jscpd
  echo "npx"
}

ensure_directories() {
  mkdir -p "$CACHE_ROOT" "$ARTIFACT_ROOT" "$LOG_DIR"
}

check_semgrep() {
  local bin
  bin=$(resolve_semgrep)
  local version
  version=$($bin --version 2>/dev/null | head -n1 | awk '{print $NF}')
  if [[ -z "$version" ]]; then
    echo "ERROR: Unable to determine semgrep version from '$bin --version'." >&2
    exit 1
  fi
  if ! semver_gte "$version" "$MIN_SEMGREP"; then
    echo "ERROR: semgrep version $version detected (< $MIN_SEMGREP). Upgrade via pipx install semgrep==${MIN_SEMGREP}." >&2
    exit 1
  fi
  log "Semgrep OK ($version) via $bin"
}

check_jscpd() {
  local runner
  runner=$(resolve_jscpd)
  local version
  if [[ "$runner" == "npx" ]]; then
    version=$(npx --yes jscpd --version 2>/dev/null | tail -n1)
  else
    version=$($runner --version 2>/dev/null | tail -n1)
  fi
  version=${version//[[:space:]]/}
  if [[ -z "$version" ]]; then
    echo "ERROR: Unable to determine jscpd version." >&2
    exit 1
  fi
  if ! semver_gte "$version" "$MIN_JSCPD"; then
    echo "ERROR: jscpd version $version detected (< $MIN_JSCPD). Install with 'npm install -g jscpd@$MIN_JSCPD' or set JSCPD_BIN." >&2
    exit 1
  fi
  if [[ "$runner" == "npx" ]]; then
    log "Jscpd OK ($version) via npx"
  else
    log "Jscpd OK ($version) via $runner"
  fi
}

main() {
  log "Starting reviewer preflight checks"
  ensure_directories
  check_semgrep
  check_jscpd
  log "Cache directory: $CACHE_ROOT"
  log "Artifacts directory: $ARTIFACT_ROOT"
  log "Preflight complete"
}

main "$@"
