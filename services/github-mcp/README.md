# github-mcp service

Baseline MCP service scaffold built on Express 5.1, `@modelcontextprotocol/sdk@1.18.x`, and `mcp-auth-kit`. Replace the placeholders in this directory with your implementation details once scaffolded.

## What's included
- Streamable HTTP transport with origin + auth enforcement wired through `mcp-auth-kit`.
- Deterministic `diagnostics.ping` tool for end-to-end smoke checks.
- Dockerfile, compose.yml, and `.env.example` aligned with workspace conventions (opt-in compose profile, resource limits, external Traefik network).
- Vitest 3.2 + Supertest 7.1 suite covering manifest metadata, Accept header handling, diagnostics payload composition, and rate-limit propagation.
- Smoke script (`npm run smoke`) that exercises the Streamable HTTP endpoint and logs session headers.

## Environment setup
1. Copy `.env.example` to `.env` and update the placeholders (issuer, audience, resource URL, allowed origins).
2. Keep confidential values (e.g., Keycloak client credentials) inside `.keycloak-env` and source them before running scripts.
3. Default binding listens on `0.0.0.0` for container networking. Restrict ingress via Traefik/compose and tighten `MCP_ALLOWED_ORIGINS` after a security review.

## Running locally
```bash
# Aggregate compose files (requires docker compose v2)
./scripts/compose.sh --profile github-mcp up --build

# or for CI/automation
COMPOSE_PROFILES=github-mcp ./scripts/compose.sh up --build
```

- The profile keeps the service disabled unless explicitly requested.
- Ensure the external network referenced by `.env` exists beforehand: `docker network inspect ${MCP_NETWORK_EXTERNAL:-traefik} || docker network create ${MCP_NETWORK_EXTERNAL:-traefik}`.
- Health endpoint: `GET http://127.0.0.1:8770/healthz`.
- Tear down with `./scripts/compose.sh --profile github-mcp down --remove-orphans` when finished.

Once dependencies are updated, record the current `package-lock.json` hash (e.g., `sha256sum package-lock.json`) so you can revert quickly if alignment work needs rollback.

## Manual verification
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

## Smoke workflow
1. **Source secrets without storing them in shell history**
   ```bash
   set -a
   source .keycloak-env
   set +a
   ```
2. **Run the healthcheck**
   ```bash
   CLIENT_ID="$KC_CLIENT_ID" CLIENT_SECRET="$KC_CLIENT_SECRET" \
     scripts/healthcheck.sh \
       --base-url http://127.0.0.1:8770/mcp \
       --issuer ${OIDC_ISSUER:-http://127.0.0.1:5050/auth/realms/local}
   ```
3. **Execute the smoke script**
   ```bash
   MCP_BASE_URL=http://127.0.0.1:8770/mcp MCP_ACCESS_TOKEN="$ACCESS_TOKEN" npm run smoke --workspace github-mcp
   ```

Collect the aggregated output in change reviews to demonstrate end-to-end readiness.

## Testing

```bash
npm run lint --workspace github-mcp
npm run test --workspace github-mcp
npm run build --workspace github-mcp
npm run smoke --workspace github-mcp
# Optional: verify workspace parity once all services are aligned
npm run test --workspaces
```

Vitest coverage uses the V8 provider. Coverage reports are written to `services/github-mcp/coverage/`.

## Keycloak notes
- Create a confidential client with service-account enabled using the local Keycloak admin (default [http://127.0.0.1:5050/auth](http://127.0.0.1:5050/auth)).
- Dynamic Client Registration (DCR) automatically writes redirect URIs for ChatGPT-managed clients. If you provision a static client instead, allow `https://chatgpt.com/connector_platform_oauth_redirect` explicitly.
- Export sanitized realm configuration with `./kc_export_realm.sh --realm OMA` after registering the client.

## Next steps
- Update `src/mcp.ts` with real tools, resources, and storage as your service evolves.
- Adjust the compose.yml ports/labels to match your deployment topology.
- Extend the Vitest suite with service-specific assertions.
 - Coordinate with Story 2.4 to remove temporary Express 4 peer warnings emitted by `mcp-auth-kit`; during the transition these warnings are acceptable but must be documented in change notes.
