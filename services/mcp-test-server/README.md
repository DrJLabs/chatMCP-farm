# MCP Test Server

Deterministic MCP service used to validate our docker-compose orchestration, Keycloak OAuth wiring, and ChatGPT manifest integration.

## What ships in Story 1.2
- Manifest and protected-resource metadata now hydrate from environment variables, mirroring deployments.
- Root endpoint advertises the canonical resource URL and issues `WWW-Authenticate` challenges when auth is required.
- `diagnostics.ping` echoes sanitized token claims, origin metadata, and timestamps to aid smoke testing.
- README and `.env.example` include copy/paste `curl` commands for manifest, PRM, and diagnostics checks.
- Lightweight `search`/`fetch` stubs are tracked in `docs/stories/follow-ups.md` for future compatibility hardening.

## Environment Setup
1. Copy `.env.example` to `.env` and update the placeholders.
2. Minimum required variables:
   - `OIDC_ISSUER`, `OIDC_AUDIENCE`
   - `MCP_PUBLIC_BASE_URL` (alias: `MCP_TEST_SERVER_PUBLIC_BASE_URL`; both accepted)
   - Optional: set `PRM_RESOURCE_URL` if the resource audience differs from the transport URL.
3. Default binding listens on `0.0.0.0` for container networking. Restrict ingress via Traefik/compose and override `MCP_ALLOWED_ORIGINS`/`ALLOWED_ORIGINS` after a security review.

## Running Locally
```bash
# aggregate compose files (requires docker compose v2)
./scripts/compose.sh --profile mcp-test-server up --build
```

The profile keeps the service disabled unless explicitly requested. Health endpoint: `GET http://127.0.0.1:8770/healthz`.

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

## Smoke Scripts
Story 1.3 delivers production smoke automation. For Story 1.2, use the manual verification commands above in addition to the workspace lint/test suite (`npm run lint --workspace mcp-test-server`, `npm run test --workspace mcp-test-server`).

## Keycloak Notes
- Create a confidential client with service-account enabled using the local Keycloak admin (default http://127.0.0.1:5050/auth).
- Dynamic Client Registration (DCR) automatically writes redirect URIs for ChatGPT-managed clients. If you provision a static client instead, allow `https://chatgpt.com/connector_platform_oauth_redirect` explicitly.
- Export sanitized realm configuration with `./kc_export_realm.sh --realm OMA` after registering the client.

## Follow-ups
- Lightweight `search`/`fetch` tool stubs remain tracked in `docs/stories/follow-ups.md` for future connectors that require them.
