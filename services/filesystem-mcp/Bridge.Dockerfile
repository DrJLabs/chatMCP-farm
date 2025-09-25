# syntax=docker/dockerfile:1.6

# -----------------------------------------------------------------------------
# Build rust-mcp-filesystem from source
# -----------------------------------------------------------------------------
FROM rust:1.89-bookworm AS build

# Allow overriding the upstream ref while pinning to the vetted commit by default.
# When updating, run: docker build --build-arg FILESYSTEM_MCP_REF=<new_ref> ...
ARG FILESYSTEM_MCP_REF=b3c000a03dd8d70795335c291cb46866f5f42fd3

WORKDIR /src

# Install minimal build prerequisites and fetch the repository at the pinned ref.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 https://github.com/rust-mcp-stack/rust-mcp-filesystem.git . \
    && git fetch --depth=1 origin "$FILESYSTEM_MCP_REF" \
    && git checkout "$FILESYSTEM_MCP_REF"

# Build a reproducible, optimized binary.
RUN cargo build --release --locked

# -----------------------------------------------------------------------------
# Minimal runtime with pinned mcp-proxy and hardened entrypoint
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

ARG MCP_PROXY_VERSION=0.9.0

ENV RUST_MCP_FS_BINARY=/usr/local/bin/rust-mcp-filesystem \
    ENTRYPOINT_PATH=/usr/local/bin/entrypoint.sh \
    PIP_BREAK_SYSTEM_PACKAGES=1

# System packages for SSL verification + Python runtime for mcp-proxy.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 python3-pip bash binutils \
    && rm -rf /var/lib/apt/lists/*

# Install the pinned mcp-proxy release without leaving pip caches behind.
RUN pip install --no-cache-dir "mcp-proxy==${MCP_PROXY_VERSION}"

# Copy and strip the release binary from the build stage.
COPY --from=build /src/target/release/rust-mcp-filesystem "$RUST_MCP_FS_BINARY"
RUN strip "$RUST_MCP_FS_BINARY"

# OCI metadata for traceability.
LABEL org.opencontainers.image.title="filesystem-mcp bridge" \
      org.opencontainers.image.description="Rust MCP filesystem bridge with SSE proxy" \
      org.opencontainers.image.version="mcp-proxy-${MCP_PROXY_VERSION}" \
      org.opencontainers.image.source="https://github.com/rust-mcp-stack/rust-mcp-filesystem"

# Entrypoint script renders FS_ALLOWED into CLI args and guards unsafe configurations.
RUN install -d "$(dirname \"$ENTRYPOINT_PATH\")"
RUN cat <<'SCRIPT' > "$ENTRYPOINT_PATH" \
    && chmod +x "$ENTRYPOINT_PATH"
#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[filesystem-mcp] %s\n' "$1" >&2
}

trim() {
  local input="$1"
  # shellcheck disable=SC2001
  input="$(echo "$input" | sed -e 's/^\s*//' -e 's/\s*$//')"
  printf '%s' "$input"
}

is_true() {
  case "${1:-}" in
    [Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Yy]) return 0 ;;
    *) return 1 ;;
  esac
}

PORT="${SSE_PORT:-12010}"
IFS=':' read -r -a roots <<< "${FS_ALLOWED:-/projects:/VAULTS}"

if ((${#roots[@]} == 0)); then
  log "FS_ALLOWED is empty; provide at least one directory."
  exit 1
fi

validated_roots=()
for raw_root in "${roots[@]}"; do
  trimmed="$(trim "$raw_root")"
  if [[ -z "$trimmed" ]]; then
    log "FS_ALLOWED contains an empty path entry."
    exit 1
  fi
  if [[ "$trimmed" == "/" ]]; then
    log "FS_ALLOWED cannot include root '/'."
    exit 1
  fi
  validated_roots+=("$trimmed")
done

args=("mcp-proxy" "--sse-port" "$PORT" "--" "$RUST_MCP_FS_BINARY")

if is_true "${ALLOW_WRITE:-false}"; then
  args+=("--allow-write")
  log "Write access enabled; use with caution."
fi

if is_true "${ENABLE_ROOTS:-false}"; then
  args+=("--enable-roots")
  log "Root discovery enabled; ensure configuration is approved."
fi

args+=("${validated_roots[@]}")

log "Starting bridge on port $PORT for roots: ${validated_roots[*]}"
exec "${args[@]}"
SCRIPT

# Document configurable environment variables for operators.
ENV FS_ALLOWED=/projects:/VAULTS \
    ALLOW_WRITE=false \
    ENABLE_ROOTS=false \
    SSE_PORT=12010

EXPOSE 12010
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# The container expects read-only mounts at /projects and /VAULTS by default.
# Enable writes by setting ALLOW_WRITE=true only after reviewing security guidance.
