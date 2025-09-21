# Scripts Roadmap

This folder will collect automation for the standalone MCP servers repo.

## Status
- `bootstrap.sh`: implemented; copies templates and performs placeholder substitution.
- `kc/create_mcp_scope.sh`: implemented; ensures the MCP audience scope, mapper, and trusted host entries exist via `kcadm.sh`.
- `kc/status.sh`: implemented; reports on scope/mapper defaults, client attachments, and trusted host configuration.
- `kc/trusted_hosts.sh`: implemented; lists/updates trusted host entries per realm.
- `compose.sh`: implemented; merges `services/*/compose.yml` fragments and forwards arguments to docker-compose.
- `render-docs.mjs`: implemented; applies overrides from `docs/local/` to committed markdown via `docs/config.sample.json`.
- `healthcheck.sh`: implemented; runs manifest/PRM/token/initialize checks against an MCP endpoint.

## Planned contents
- `bootstrap.sh`: scaffolds a new MCP service using the template in `templates/service` and performs token substitution.
- `kc/`: wrappers around Keycloak export/bootstrap scripts from the parent project adapted for this workspace (scope + status + trusted-host helpers in place).
- `compose.sh`: command surface documented in README once the repo split finalizes (today: run `scripts/compose.sh --help`).
- `healthcheck.sh`: wraps the validation playbook (manifest, PRM, token, initialize, optional SSE) described in `docs/runbooks/compose-and-docs.md` / `docs/oauth-keycloak.md`.
- `render-docs.mjs`: CLI usage captured alongside doc render workflow when templating requirements stabilize (see `docs/runbooks/compose-and-docs.md`).

Scripts resolve the repo root automatically so they continue working after the split.
