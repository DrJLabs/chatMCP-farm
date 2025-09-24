# __SERVICE_NAME__ service

Baseline MCP service scaffold built on Express 5.1, `@modelcontextprotocol/sdk@^1.18.1`, and `mcp-auth-kit`. Replace the placeholders in this directory with your implementation details once scaffolded.

## What's included
- Streamable HTTP transport with origin + auth enforcement wired through `mcp-auth-kit`.
- Deterministic `diagnostics.ping` tool for end-to-end smoke checks.
- Dockerfile, compose.yml, and `.env.example` aligned with workspace conventions (opt-in compose profile, resource limits, external Traefik network).
- Vitest 3.2 suite with V8 coverage instrumentation (AST-aware remapping) covering manifest metadata, Accept header handling, and diagnostics payload composition.
- Smoke script (`npm run smoke`) that exercises the Streamable HTTP endpoint, supports JSON/event-stream responses, and logs session headers.
- `npm run lint` script (`tsc --noEmit`) to keep TypeScript output aligned with the Express 5 baseline.

## Environment setup
1. Copy `.env.example` to `.env` and update the placeholders (issuer, audience, resource URL, allowed origins).
2. Keep confidential values (e.g., Keycloak client credentials) inside `.keycloak-env` and source them before running scripts.
3. Default binding listens on `0.0.0.0` for container networking. Restrict ingress via Traefik/compose and tighten `MCP_ALLOWED_ORIGINS` after a security review.

## Running locally
```bash
# Aggregate compose files (requires docker compose v2)
./scripts/compose.sh --profile __SERVICE_NAME__ up --build

# or for CI/automation
COMPOSE_PROFILES=__SERVICE_NAME__ ./scripts/compose.sh up --build
```

- The profile keeps the service disabled unless explicitly requested.
- Ensure the external network referenced by `.env` exists beforehand: `docker network inspect ${MCP_NETWORK_EXTERNAL:-traefik} || docker network create ${MCP_NETWORK_EXTERNAL:-traefik}`.
- Health endpoint: `GET http://127.0.0.1:8770/healthz`.
- Tear down with `./scripts/compose.sh --profile __SERVICE_NAME__ down --remove-orphans` when finished.

After scaffolding a new service, run the baseline verification sequence and capture the output for the Dev Agent Record:

```bash
npm install --workspace services/__SERVICE_NAME__
npm run lint --workspace services/__SERVICE_NAME__
npm run test -- --coverage --workspace services/__SERVICE_NAME__
npm run build --workspace services/__SERVICE_NAME__
npm run smoke --workspace services/__SERVICE_NAME__
npm run postbump:test
npm ls express --workspace services/__SERVICE_NAME__
```

These commands confirm the Express 5 dependency tree, enforce lint/test/build parity, exercise the smoke script, and verify the workspace-wide `postbump:test` helper.

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
   MCP_BASE_URL=http://127.0.0.1:8770/mcp MCP_ACCESS_TOKEN="$ACCESS_TOKEN" npm run smoke --workspace __SERVICE_NAME__
   ```

Collect the aggregated output (including coverage summary and `npm ls express` tree) in change reviews to demonstrate end-to-end readiness.

## Keycloak notes
- Create a confidential client with service-account enabled using the local Keycloak admin (default [http://127.0.0.1:5050/auth](http://127.0.0.1:5050/auth)).
- Dynamic Client Registration (DCR) automatically writes redirect URIs for ChatGPT-managed clients. If you provision a static client instead, allow `https://chatgpt.com/connector_platform_oauth_redirect` explicitly.
- Export sanitized realm configuration with `./kc_export_realm.sh --realm OMA` after registering the client.

## Next steps
- Update `src/mcp.ts` with real tools, resources, and storage as your service evolves.
- Adjust the compose.yml ports/labels to match your deployment topology.
- Extend the Vitest suite with service-specific assertions.
