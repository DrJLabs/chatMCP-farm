# MCP Servers Workspace (Pre-Split)

This directory is evolving into a standalone repository dedicated to MCP services secured via a shared Keycloak realm (configure the actual name in `docs/config.sample.json`). The goal is to keep all OAuth wiring, documentation, and automation local so each service can ship independently of the broader Keycloak infra.

## What's Here Today
- `services/openmemory/` – reference MCP implementation using the auth kit and docker-compose wiring.
- `packages/mcp-auth-kit/` – reusable Express helpers for Keycloak-backed OAuth metadata and enforcement (exports `AUTH_ENV_VARS` so every service shares the same environment contract).
- `scripts/kc/` – automation that now authenticates directly against Keycloak using the `KC_CLIENT_ID`/`KC_CLIENT_SECRET` service account (defaults assume the local admin proxy at `http://127.0.0.1:5050/auth`).
- `docs/` – project-scoped copies of the ChatGPT + Keycloak integration guide and bootstrap checklist (templated; see below).
- `scripts/` – automation helpers including the service bootstrapper.
- `scripts/compose.sh` – wrapper that assembles every `services/*/compose.yml` fragment into a single `docker compose` invocation.
- `templates/` – reusable service skeletons referenced by the bootstrapper.
- `PROJECT_SPLIT_PLAN.md` – roadmap for extracting this workspace.

## Near-Term Roadmap
1. Finish workspace toolchain (bootstrap script, `kc` helpers, CI wiring).
2. Iterate on `templates/service` to cover additional transports/tests.
3. Finish Keycloak automation helpers under `scripts/kc/`.
4. Harden documentation and add CI before splitting into its own repo.

## Implementation Playbook
- Start with `PROJECT_SPLIT_PLAN.md` for roadmap, immediate next steps, and the Implementation Kickoff checklist.
- Use `docs/bootstrap-checklist.md` when scaffolding a new service; render a local copy with `npm run docs:render` to expand placeholders.
- Automation scripts live in `scripts/`; read `scripts/README.md` for current coverage and TODOs before extending.
- Run MCP services via `scripts/compose.sh <docker-compose args>`; it builds `COMPOSE_FILE` from every `services/*/compose.yml`, so dropping a new service folder automatically enrolls it in the stack. Each service reads its own `.env` file for runtime settings:
  - `PORT` drives both the container listener and the Traefik load-balancer service port.
  - `MCP_PUBLIC_HOST` sets the host used in Traefik routing labels (e.g. `mcp.example.com`).
  - `MCP_SERVICE_NAME` controls the service key in the generated compose file; this is what Traefik references in its service/route labels.
  - `MCP_NETWORK_EXTERNAL` specifies the Docker network that exposes the service to Traefik (typically an existing external network). The generated compose file maps this value to the service’s default network.
  - To attach additional networks (e.g. a private bridge), either extend the service’s `compose.yml` or drop an extra compose fragment beside it—see the comments in each `.env` example for suggested variables.

## How To Contribute (while inside monorepo)
- Run workspace commands from this directory: `npm install`, `npm run build`, etc.
- Keep docs in sync: edit `docs/oauth-keycloak.md` (templated) and re-render local copies; update upstream shared docs once finalized.
- Update the plan file after significant progress so the extraction path stays clear.

## Split Milestone Criteria
- All MCP services build & test via workspace tooling.
- Keycloak onboarding scripts live under `mcp-servers/scripts/` with documented usage.
- Documentation under `mcp-servers/docs/` stands alone.
- `packages/mcp-auth-kit` packaged for reuse (npm or internal registry).

Stay within this plan when adding new services so we can extract cleanly later.

## Documentation templating

- `docs/config.sample.json` lists the supported template variables and the Markdown templates rendered by `npm run docs:render`.
- Override variables locally by creating `docs/local/config.local.json` (ignored by git). Only include secrets or machine-specific values here.
- Generated Markdown lives under `docs/.generated/`; the command recreates the files on every run so do not edit them manually.
- Placeholders in committed docs use `{{VARIABLE}}` syntax so the open-source copy stays environment-agnostic while your local render stays accurate.
