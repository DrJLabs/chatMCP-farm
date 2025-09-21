# MCP Server Bootstrap Checklist

This quickstart distills the OAuth and infrastructure requirements for bringing a new MCP server online inside the future standalone repository. Reference `docs/oauth-keycloak.md` for deep detail.

> **Variable reference** (replace via `docs/config.sample.json` + `docs/local/config.local.json`)
> - `{{KC_REALM}}` — Keycloak realm that issues OAuth tokens for the MCP servers.
> - `{{KC_ISSUER}}` — Fully qualified issuer URL for the realm.
> - `{{MCP_PUBLIC_BASE_URL}}` — Public origin of the MCP service (e.g., `https://svc.example.com`).
> - `{{MCP_TRANSPORT_URL}}` — Transport endpoint (`{{MCP_PUBLIC_BASE_URL}}/mcp`) consumed by MCP clients.
> - `{{PRM_RESOURCE_URL}}` — OAuth protected resource URL; equals `{{MCP_PUBLIC_BASE_URL}}`.
> - `{{MCP_SCOPE_NAME}}` — Audience scope attached to clients that should reach the MCP resource.
> - `{{OIDC_AUDIENCE}}` — Additional audience accepted by the service (legacy clients, optional).

## Prerequisites
- Keycloak realm `{{KC_REALM}}` running via project automation.
- `mcp-auth-kit` built (`npm run build` in `packages/mcp-auth-kit` once workspaces are in place).
- Docker networks (external/internal) defined in each service’s `.env` (`MCP_NETWORK_EXTERNAL`, `MCP_NETWORK_INTERNAL`).
- `.env` and `.keycloak-env` configured (see examples at repo root).
- Local tooling installed: `curl`, `jq` (required for `scripts/healthcheck.sh`).
- Review `docs/runbooks/compose-and-docs.md` for compose orchestration and documentation rendering details before bootstrapping multiple services.

## Bootstrap Steps
1. **Generate service skeleton**
   - Run `scripts/bootstrap.sh <service-name>` to copy the Express template wired to `mcp-auth-kit` into `services/<service-name>`.
   - Copy `services/<service-name>/.env.example` to `.env`, set `MCP_PUBLIC_BASE_URL`, derive `MCP_TRANSPORT_URL=${MCP_PUBLIC_BASE_URL}/mcp`, and configure the issuer (use `AUTH_ENV_VARS` from `mcp-auth-kit` as the source of truth for supported keys).
2. **Register Keycloak audience**
   - Run `scripts/kc/create_mcp_scope.sh --resource <MCP_PUBLIC_BASE_URL>` to provision the scope, mapper, default assignments, and trusted host entry (requires `.keycloak-env` with `KC_CLIENT_ID`/`KC_CLIENT_SECRET`; defaults point to the local admin proxy at `http://127.0.0.1:5050/auth`).
   - Validate with `scripts/kc/status.sh --resource <MCP_PUBLIC_BASE_URL>` and inspect/update the host list via `scripts/kc/trusted_hosts.sh --list` / `--add` as needed.
3. **Configure manifest + PRM**
   - Verify service exports `/.well-known/mcp/manifest.json` and `/.well-known/oauth-protected-resource` with the canonical resource URL.
4. **Smoke test**
   - `npm run build --workspace <service>`
   - `scripts/compose.sh up --build <service-name>` (auto-includes every `services/*/compose.yml`)
  - Run validation commands from `docs/oauth-keycloak.md` §5 (Streamable HTTP transport).
  - Optionally execute `CLIENT_ID=<id> CLIENT_SECRET=<secret> scripts/healthcheck.sh --base-url <MCP_TRANSPORT_URL> --issuer <KC_ISSUER> --client-id <id>` to automate the manifest/PRM/token/initialize checks (prefer environment variables over CLI flags to keep secrets out of process lists).
   - Optional SSE fallback: set `ENABLE_SSE=true` before starting the service, then run `npm run smoke:sse --workspace <service>` to validate legacy clients.
5. **ChatGPT connector**
   - Initiate Developer Mode connector setup; confirm DCR creates client with `{{MCP_SCOPE_NAME}}` scope.

## Post-Bootstrap
- Document service-specific scopes or dependencies under `services/<name>/README.md`.
- Add integration tests under `services/<name>/test/` once harness exists.

> **Status**: Draft outline. Update as scripts land. See `PROJECT_SPLIT_PLAN.md` for the Implementation Kickoff checklist and outstanding automation tasks.
>
> Render a local copy with secrets injected by running `npm run docs:render` after defining overrides in `docs/local/config.local.json` (see `docs/config.sample.json`).
