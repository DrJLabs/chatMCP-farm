# Filesystem MCP Bridge Focused Epic

## Epic Goal

Deliver a filesystem MCP service that mirrors the GitHub bridge experience while avoiding GitHub PAT requirements, exposing `/projects` and `/VAULTS` through an SSE bridge with optional write support.

## Epic Description

**Existing System Context**

- Current stack offers GitHub-integrated MCP services but lacks a generic filesystem endpoint for local project access.
- Traefik fronted services and docker-compose profiles provide opt-in deployment; Keycloak handles OAuth for public ingress.
- Existing bridges (e.g., github-mcp) rely on PAT or app tokens, adding operational overhead for simple file browsing tasks.

**Enhancement Details**

- Build `rust-mcp-filesystem` via a multi-stage `Bridge.Dockerfile` that clones `https://github.com/rust-mcp-stack/rust-mcp-filesystem.git` and installs the binary with reproducible dependencies.
- Wrap the binary with `mcp-proxy`, exposing an SSE bridge on port `12010` and forwarding to a public HTTP service on port `12011`.
- Accept colon-separated `FS_ALLOWED` roots (default `/projects:/VAULTS`) and propagate `ALLOW_WRITE` / `ENABLE_ROOTS` to the stdio server to toggle write access and path exposure.
- Supply a service-specific `compose.yml` and `.env.example` aligned with repo conventions (profiles, traefik labels, OAuth defaults) so operators can run `COMPOSE_PROFILES=filesystem-mcp docker compose ...` with minimal overrides.
- Document bring-up, config validation, and smoke tests to verify both bridge and public endpoints without requiring GitHub credentials.

**Success Criteria**

- Compose profile `filesystem-mcp` builds successfully and exposes the SSE bridge (`http://filesystem-mcp-bridge:12010/mcp`) plus the public service (`https://fs-mcp.local`).
- Default configuration mounts `/srv/projects` and `/srv/vaults` (mapped from `/projects` and `/VAULTS`) read-only, with clear instructions for enabling writes when explicitly approved.
- `/projects` and `/VAULTS` browsing works through MCP clients without PATs or GitHub auth, validated via smoke tests.
- Documentation covers build steps, environment toggles, security posture, and operational validation.

## Stories

1. **Story 1 (Planned):** Containerize `rust-mcp-filesystem` with `mcp-proxy`, including entrypoint script mapping `FS_ALLOWED` to positional arguments and exposing SSE port `12010`.
2. **Story 2 (Planned):** Author compose profile, Traefik routing, and `.env.example` for the new service, ensuring `/projects` and `/VAULTS` mounts default to read-only and follow existing bridging patterns.
3. **Story 3 (Planned):** Document bring-up workflow, smoke tests, and security guidance (write enablement, root scoping) under `docs/` and integrate with `scripts/compose.sh` if required.

## Compatibility Requirements

- [ ] Reuse `proxy` network and Traefik labels consistent with other MCP services.
- [ ] Keep defaults read-only (`ALLOW_WRITE=false`, `ENABLE_ROOTS=false`) with explicit, documented overrides.
- [ ] Pin the upstream repository checkout (branch/ref) to guarantee reproducible builds.
- [ ] Ensure compose profile cooperates with existing scripts and does not require GitHub tokens or PATs.
- [ ] Align environment variable names with `mcp-auth-kit` expectations (`MCP_PROTOCOL_VERSION`, `MCP_ALLOWED_ORIGINS`, etc.).

## Risk Mitigation

- **Accidental Writes:** Enabling write access could modify shared project files.
  - *Mitigation:* Default to read-only, gate write enablement behind `.env` flag and documentation checklist.
- **Directory Escape:** Misconfigured `FS_ALLOWED` may expose unintended paths.
  - *Mitigation:* Validate colon parsing in entrypoint, add smoke test verifying out-of-scope access is denied.
- **Binary Drift:** Upstream repository changes could break builds.
  - *Mitigation:* Pin commit hash and document update procedure (incl. checksum verification).
- **Operational Drift:** Service may diverge from GitHub bridge conventions.
  - *Mitigation:* Mirror env naming/layout from `github-mcp` and include automatic config validation via `docker compose config`.

## Definition of Done

- [ ] `services/filesystem-mcp/Bridge.Dockerfile`, `compose.yml`, and `.env.example` committed with review-ready documentation.
- [ ] Compose profile passes `COMPOSE_PROFILES=filesystem-mcp docker compose ... config` and bring-up smoke tests (bridge + public endpoints).
- [ ] Docs capture bring-up, curl-based verification, and Keycloak/OAuth setup for the new host.
- [ ] Security review recorded covering write toggles, scopes, and default read-only posture.
- [ ] Focused-epic collateral (stories, risk profile, test design) created following BMAD workflow stages.

## Validation Checklist

- [ ] SSE bridge reachable on `filesystem-mcp-bridge:12010/mcp` from inside the network; public HTTP path serves manifest/health endpoints on `12011`.
- [ ] `FS_ALLOWED` defaults restrict access to `/projects` and `/VAULTS`; attempts outside the list fail.
- [ ] Write mode verified in isolated environment before production enablement and documented in runbook.
- [ ] Traefik router resolves `https://fs-mcp.local` with TLS + OAuth guard enabled.

## 🔬 Research & Validation Log

- Pending researcher validation after story drafting.

