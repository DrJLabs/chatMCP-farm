# Chat MCP Farm

A reusable workspace for building OAuth-protected Model Context Protocol servers. It packages a reference service, shared TypeScript auth helpers, automation scripts for Keycloak, and templated documentation so new MCP services can be scaffolded quickly.

## What’s Inside

- **`services/openmemory/`** – example MCP service wired to the auth kit and compose tooling.
- **`packages/mcp-auth-kit/`** – Express utilities that load env-based config, enforce OAuth audiences, and expose manifest/PRM handlers (see `AUTH_ENV_VARS`).
- **`scripts/kc/`** – client-credential automation for Keycloak (no local container required).
- **`templates/service/`** – scaffolding for new MCP services (Dockerfile, env template, compose fragment).
- **`scripts/compose.sh`** – wrapper that discovers every `services/*/compose.yml` and invokes `docker compose` with the combined stack.
- **`docs/`** – bootstrap and OAuth integration guides (templated via `npm run docs:render`).
- **`PROJECT_SPLIT_PLAN.md`** – roadmap and open tasks for hardening the workspace.

## Getting Started

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environments**
   - Copy `.env.example` to `.env` for workspace-wide overrides (optional).
   - Copy `.keycloak-env.example` to `.keycloak-env` and provide `KC_CLIENT_ID` / `KC_CLIENT_SECRET` plus issuer URLs.
   - For each service, copy `services/<name>/.env.example` to `services/<name>/.env` and fill in:
     - `PORT` (container + Traefik port)
     - `MCP_PUBLIC_HOST` (Traefik host rule)
     - `MCP_SERVICE_NAME` (compose service key)
     - `MCP_NETWORK_EXTERNAL` (existing Docker network used by Traefik)
     - OAuth URLs (`MCP_PUBLIC_BASE_URL`, `PRM_RESOURCE_URL`, `OIDC_ISSUER`, `OIDC_AUDIENCE`)

3. **Run services**
   ```bash
   scripts/compose.sh up --build
   ```
   `scripts/compose.sh` automatically includes every `services/*/compose.yml`, so adding a new service folder enrolls it in the stack without editing the root compose file.

4. **Bootstrap Keycloak**
   - `scripts/kc/create_mcp_scope.sh --resource <MCP_PUBLIC_BASE_URL>` ensures scopes, mappers, and trusted hosts exist.
   - `scripts/kc/status.sh --resource <MCP_PUBLIC_BASE_URL>` verifies realm defaults and client assignments.
   - `scripts/kc/trusted_hosts.sh --add <host>` maintains the trusted host policy.

5. **Smoke tests**
   ```bash
   npm run build --workspace <service>
   npm run smoke --workspace <service>
   npm run smoke:sse --workspace <service>   # when ENABLE_SSE=true
   ```

## Adding a New MCP Service

1. `scripts/bootstrap.sh <service-name>` – copies the template skeleton into `services/<service-name>`.
2. Fill out `services/<service-name>/.env` using the example as guidance.
3. Update Taurus docs (`docs/bootstrap-checklist.md`) or service README as needed.
4. Re-run `scripts/compose.sh up --build` to include the new service.

## Documentation

- `docs/config.sample.json` enumerates template variables.
- Generate environment-specific docs with `npm run docs:render` after placing overrides in `docs/local/config.local.json` (ignored by git).
- Committed docs retain `{{VARIABLE}}` placeholders so the public repo stays environment-agnostic.

## Repository Hygiene

- Secrets and environment-specific values belong in local `.env` files (ignored by git).
- Run `scripts/compose.sh` and `npm run build --workspaces` before opening PRs.
- Use `codex-review` or your preferred review tool after staging changes; it compares against the last commit, so ensure a baseline exists.

## Roadmap

1. Expand test coverage in template services.
2. Publish `mcp-auth-kit` to an internal or public registry.
3. Add CI workflows (lint, test, docs render).
4. Harden documentation and automation prior to cutting initial releases.
