# MCP Test Server

Deterministic MCP service used to validate our docker-compose orchestration, Keycloak OAuth wiring, and ChatGPT manifest integration.

## What ships in Story 1.1
- Express + `@modelcontextprotocol/sdk` server using `mcp-auth-kit` for OAuth enforcement.
- Streamable HTTP endpoint with strict localhost binding and configurable origin allow-list.
- Compose profile (`mcp-test-server`) that remains opt-in and applies CPU/memory limits by default.
- Placeholder `diagnostics.ping` tool returning deterministic metadata to confirm end-to-end auth.

## Environment Setup
1. Copy `.env.example` to `.env` and update the placeholders.
2. Minimum required variables:
   - `OIDC_ISSUER`, `OIDC_AUDIENCE`
   - `MCP_PUBLIC_BASE_URL` (alias: `MCP_TEST_SERVER_PUBLIC_BASE_URL`; both accepted by config)
3. Default binding listens on `0.0.0.0` for container networking. Restrict ingress via Traefik/compose and override `MCP_ALLOWED_ORIGINS`/`ALLOWED_ORIGINS` after a security review.

## Running Locally
```bash
# aggregate compose files (requires docker compose v2)
./scripts/compose.sh --profile mcp-test-server up --build
```

The profile keeps the service disabled unless explicitly requested. Health endpoint: `GET http://127.0.0.1:8770/healthz`.

## Smoke Scripts
Story 1.1 defers real smoke script implementation to Story 1.3. Placeholders remain in `src/smoke.ts`; the README will be updated once those scripts are delivered.

## Keycloak Notes
- Create a confidential client with service-account enabled using the local Keycloak admin (default http://127.0.0.1:5050/auth).
- Dynamic Client Registration (DCR) automatically writes redirect URIs for ChatGPT-managed clients. If you provision a static client instead, allow `https://chatgpt.com/connector_platform_oauth_redirect` explicitly.
- Export sanitized realm configuration with `./kc_export_realm.sh --realm OMA` after registering the client.

## Next Steps
- Story 1.2 decides whether we add Authorization Code + PKCE in addition to the current client-credentials flow.
- Story 1.3 introduces the compose-enabled smoke scripts referenced above.
