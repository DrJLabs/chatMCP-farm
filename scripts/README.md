# Scripts Roadmap

This folder will collect automation for the standalone MCP servers repo.

## Status
- `bootstrap.sh`: implemented; copies templates and performs placeholder substitution.
- `kc/create_mcp_scope.sh`: implemented; ensures the MCP audience scope, mapper, and trusted host entries exist via `kcadm.sh`.
- `kc/status.sh`: implemented; reports on scope/mapper defaults, client attachments, and trusted host configuration.
- `kc/trusted_hosts.sh`: implemented; lists/updates trusted host entries per realm.
- `healthcheck.sh`: TODO; design to encapsulate validation curl commands.

## Planned contents
- `bootstrap.sh`: scaffolds a new MCP service using the template in `templates/service` and performs token substitution.
- `kc/`: wrappers around Keycloak export/bootstrap scripts from the parent project adapted for this workspace (scope + status + trusted-host helpers in place).
- `healthcheck.sh`: runs curl-based validation described in `docs/bootstrap-checklist.md` (planned).

Scripts resolve the repo root automatically so they continue working after the split.
