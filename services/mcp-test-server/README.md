# MCP Test Server

Deterministic MCP service used to validate our docker-compose orchestration, Keycloak OAuth wiring, and ChatGPT manifest integration.

## What ships in Story 1.3
- Compose profile workflow is now documented for both CLI (`--profile`) and automation (`COMPOSE_PROFILES`) paths so the service remains opt-in.
- Smoke automation chains `scripts/healthcheck.sh` and `npm run smoke`, logging the `Accept` header, `Mcp-Session-Id`, and optional `Mcp-Protocol-Version` headers for operators.
- README, runbook, and `.env.example` highlight secret handling with `.keycloak-env` sourcing, plus reminders to tear the profile down when finished.
- ChatGPT Developer Mode rundown now covers `search`/`fetch` expectations and risk posture (see `docs/oauth-keycloak.md`).

## Environment Setup
1. Copy `.env.example` to `.env` and update the placeholders.
2. Minimum required variables:
   - `OIDC_ISSUER`, `OIDC_AUDIENCE`
   - `MCP_PUBLIC_BASE_URL` (set to the public `https://.../mcp` endpoint)
   - Optional: `PRM_RESOURCE_URL` if the protected resource differs from the transport URL.
3. Default binding listens on `0.0.0.0` for container networking. Restrict ingress via Traefik/compose and override `MCP_ALLOWED_ORIGINS`/`ALLOWED_ORIGINS` after a security review.

## Running Locally
```bash
# aggregate compose files (requires docker compose v2)
./scripts/compose.sh --profile mcp-test-server up --build

# or for CI/automation
COMPOSE_PROFILES=mcp-test-server ./scripts/compose.sh up --build
```

- The profile keeps the service disabled unless explicitly requested.
- Ensure the external network referenced by `.env` exists beforehand: `docker network inspect ${MCP_NETWORK_EXTERNAL:-traefik} || docker network create ${MCP_NETWORK_EXTERNAL:-traefik}`.
- Health endpoint: `GET http://127.0.0.1:8770/healthz`.
- Tear down with `./scripts/compose.sh --profile mcp-test-server down --remove-orphans` when finished.

## Manual Verification

```bash
# Manifest values (names, description, tools, endpoints)
curl -s http://127.0.0.1:8770/.well-known/mcp/manifest.json | jq

# Protected resource metadata & challenge header
curl -i http://127.0.0.1:8770/.well-known/oauth-protected-resource

# Diagnostics tool (requires access token). Replace $ACCESS_TOKEN with a valid bearer.
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H 'Accept: application/json' \
     -H 'Content-Type: application/json' \
     -X POST http://127.0.0.1:8770/mcp \
     -d '{"jsonrpc":"2.0","id":1,"method":"call","params":{"sessionId":null,"toolName":"diagnostics.ping","arguments":{"note":"manual check"}}}' | jq '.result.content[0].text' -r
```

## Smoke Workflow (Story 1.3)
1. **Source secrets without storing them in shell history**
   ```bash
   set -a
   source .keycloak-env
   set +a
   ```
   Exporting within a subshell keeps `CLIENT_ID` / `CLIENT_SECRET` out of command history.
2. **Run the healthcheck**
   ```bash
   CLIENT_ID="$KC_CLIENT_ID" CLIENT_SECRET="$KC_CLIENT_SECRET" \
     scripts/healthcheck.sh \
       --base-url http://127.0.0.1:8770/mcp \
       --issuer ${OIDC_ISSUER:-http://127.0.0.1:5050/auth/realms/local}
   ```
   - Output includes `Mcp-Session-Id` and reiterates the required `Accept` header (`application/json, text/event-stream`).
   - The script enforces schema version `2025-06-18`; override with `--schema` if testing future specs.
3. **Execute the smoke script**
   ```bash
   MCP_BASE_URL=http://127.0.0.1:8770/mcp MCP_ACCESS_TOKEN="$ACCESS_TOKEN" npm run smoke --workspace mcp-test-server
   ```
   - Prints the initialize response, `Mcp-Session-Id`, and (when present) `Mcp-Protocol-Version` header so you can capture evidence.

Include the aggregated output in change reviews to demonstrate end-to-end readiness.

## Keycloak Notes
- Create a confidential client with service-account enabled using the local Keycloak admin (default http://127.0.0.1:5050/auth).
- Dynamic Client Registration (DCR) automatically writes redirect URIs for ChatGPT-managed clients. If you provision a static client instead, allow `https://chatgpt.com/connector_platform_oauth_redirect` explicitly.
- Export sanitized realm configuration with `./kc_export_realm.sh --realm OMA` after registering the client.

## Follow-ups
- Lightweight `search`/`fetch` tool stubs remain tracked in `docs/stories/follow-ups.md` for future connectors that require them.
