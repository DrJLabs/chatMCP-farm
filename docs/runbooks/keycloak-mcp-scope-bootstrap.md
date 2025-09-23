# Keycloak MCP Scope Bootstrap Runbook

> **Audience:** Platform engineers bringing new MCP services online.
> **Goal:** Ensure each MCP host receives a dedicated audience scope, mapper, client assignments, and trusted-host entry without disturbing existing services.

## 1. Prerequisites
- `.keycloak-env` populated with `KC_SERVER`, `KC_REALM`, `KC_CLIENT_ID`, and `KC_CLIENT_SECRET` (service-account credentials; `KC_SERVER` defaults to `http://127.0.0.1:5050/auth`).
- Service env file (`services/<name>/.env`) containing `MCP_PUBLIC_BASE_URL` (or equivalent) for the new MCP server.
- `scripts/kc/bootstrap_mcp_host.sh` available in the repo (added in September 2025).
- Local tooling: `python3`, `jq`, `curl` (already required by other scripts).

## 2. When to run the script
1. **Before ChatGPT connects** — preferred path. Run the script as soon as the service env file exists. It creates a host-specific scope/mapper, puts it into realm defaults, and updates Trusted Hosts. Because the scope sits in the default set, *future* Dynamic Client Registration (DCR) clients automatically receive the MCP audience on their tokens.
2. **After a connector attempt** — remediation path. If ChatGPT already registered UUID clients before the scope existed, rerun the script with `--attach-client <uuid>` for each ID so those clients adopt the new scope immediately. Without this, their tokens keep missing the audience until the scope is manually attached.

## 3. Command cheat sheet
```bash
# Preferred: run before first connector setup
scripts/kc/bootstrap_mcp_host.sh \
  --env-file services/mcp-test-server/.env \
  --verify

# Remediate existing ChatGPT UUID clients after scopes were added
scripts/kc/bootstrap_mcp_host.sh \
  --env-file services/mcp-test-server/.env \
  --attach-client 02680ddc-a477-46dd-bfc9-47fbcf4c566f \
  --attach-client 413f2e74-eed8-4f33-a2ae-1af962ab4ed9 \
  --verify
```

## 4. Flag reference
| Flag | Purpose |
| --- | --- |
| `--env-file` | Reads `MCP_PUBLIC_BASE_URL` / `PRM_RESOURCE_URL` from the service env file. Use `--resource` to override directly. |
| `--attach-client <clientId>` | Adds the scope to specific Keycloak clients (e.g., ChatGPT UUIDs returned by DCR). Safe to repeat; duplicates are ignored. |
| `--scope-name`, `--mapper-name` | Override generated names (`mcp-<host>-resource` / `mcp-<host>-audience`) when a custom naming convention is needed. |
| `--trusted-policy-alias` | Target a non-default Trusted Hosts policy if the realm uses multiple policies. |
| `--verify` | Runs `scripts/kc/status.sh` afterwards to confirm scope IDs, mapper audiences, client assignments, and trusted-host membership. |

## 5. What the script actually does
1. **Derives host-specific names** by slugifying the MCP hostname so each service gets an isolated scope (`mcp-<host>-resource`) and mapper (`mcp-<host>-audience`).
2. **Calls `create_mcp_scope.sh`** to create/update the scope + mapper and place the scope in the realm's default scope list. This does *not* modify existing scopes for other hosts.
3. **Attaches the scope** to any clients passed via `--attach-client`. The API call adds the new scope without removing existing ones.
4. **Updates Trusted Hosts** by merging the MCP hostname into the specified Client Registration policy, keeping prior entries intact.
5. **(Optional) Verification** prints a summary of scope/mapper config, client defaults, and the trusted-host list so you can confirm the changes immediately.

## 6. Operational tips
- **Idempotent:** re-running the script for the same host is safe; it simply confirms the existing configuration.
- **Multiple hosts:** each host should have its own scope and mapper. Repeat the script for every MCP service (`memory`, `mcp-test`, etc.).
- **Token validation:** after running the script, you can validate with `scripts/kc/status.sh --resource <url>` or by issuing a client-credentials token and inspecting the `aud` claim.
- **Cleanup:** if a host is retired, manually remove its scope from realm defaults, detach from clients, and prune the trusted-host entry (no automation yet).

## 7. Troubleshooting
- **401 from MCP after consent:** likely the access token lacks the new audience. Attach the scope to the relevant client using `--attach-client` and retry.
- **DCR rejected by Trusted Hosts policy:** confirm the hostname was added; rerun the script or use `scripts/kc/trusted_hosts.sh --list`.
- **`python3` missing inside container:** run the script from the host machine (not inside Docker) so dependencies resolve locally.

Keep this runbook with the bootstrap checklist so new services follow the same automated path every time.
