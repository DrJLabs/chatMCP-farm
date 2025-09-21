# OpenMemory MCP Service

**Status:** Reference implementation (Draft)  
**Last Updated:** September 20, 2025

---

## Overview
The OpenMemory MCP service exposes a Streamable HTTP endpoint backed by the OpenMemory REST API. It uses the shared `mcp-auth-kit` package to enforce Keycloak-issued OAuth tokens and provides both generic MCP tools (`ping`, `search`, `fetch`, `write`) and OpenMemory-specific helpers (`om.search`, `om.add`).

---

## Prerequisites
- Node.js 24 LTS and npm workspaces installed at the repo root (`npm install`).
- Docker/Compose v2 if you plan to run via `scripts/compose.sh`.
- `.keycloak-env` populated with client credentials for Keycloak automation.
- Copy `services/openmemory/.env.example` to `.env` and fill in environment-specific values (see below).
- Optional: populate `OPENMEMORY_API_TOKEN` in your local `.env` if the backend requires authentication.

---

## Environment Variables (`services/openmemory/.env`)
| Variable | Description |
| --- | --- |
| `OIDC_ISSUER` | Keycloak issuer URL (e.g., `https://keycloak.example.com/auth/realms/OMA`). |
| `OIDC_AUDIENCE` | Expected audience in access tokens (`<MCP_PUBLIC_BASE_URL>`). |
| `PRM_RESOURCE_URL` | Public MCP base URL exposed in the protected resource metadata. |
| `REQUIRE_AUTH` | Whether OAuth is enforced (`true` in all environments except controlled local testing). |
| `ENABLE_STREAMABLE` | Toggle Streamable HTTP transport (default `true`). |
| `ENABLE_SSE` | Optional SSE fallback for legacy clients. |
| `MCP_SERVER_NAME` / `MCP_SERVER_VERSION` | Metadata advertised in the MCP manifest. |
| `MCP_PUBLIC_HOST` | Hostname used by ingress/Traefik routing rules. |
| `MCP_SERVICE_NAME` | Compose service name (used by `scripts/compose.sh`). |
| `MCP_BUILD_CONTEXT` | Relative path to the build context (`./services/openmemory`). |
| `MCP_NETWORK_EXTERNAL` | External Docker network that Traefik or ingress uses. |
| `OPENMEMORY_BASE_URL` | Base URL for the OpenMemory REST API. |
| `OPENMEMORY_API_TOKEN` | (Optional) API token forwarded via `x-api-key`. |
| `DEFAULT_USER_ID` | Fallback user id for generic `search`/`fetch` tools (defaults to `$USER`). |

> Configure port mappings and additional networks inside `services/openmemory/compose.yml` if the defaults do not match your environment.

---

## NPM Scripts
Run these commands from the repo root using `npm run --workspace services/openmemory <script>` or by `cd` into the service directory.

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `npm run dev --workspace services/openmemory` | Start the Express server with live reload via `tsx`. |
| `build` | `npm run build --workspace services/openmemory` | Compile TypeScript output into `dist/`. |
| `start` | `npm run start --workspace services/openmemory` | Launch compiled server (expects `dist/`). |
| `smoke` | `npm run smoke --workspace services/openmemory` | Exercise Streamable HTTP handshake and tool invocation. |
| `smoke:sse` | `npm run smoke:sse --workspace services/openmemory` | Validate SSE fallback (requires `ENABLE_SSE=true`). |

---

## Compose Integration
1. Ensure `.env` is populated and Keycloak audiences registered via `scripts/kc/create_mcp_scope.sh --resource <MCP_PUBLIC_BASE_URL>`.
2. Start the stack:
   ```bash
   scripts/compose.sh up --build openmemory
   ```
3. The wrapper merges `docker-compose.yml` and `services/openmemory/compose.yml`; override ports or labels inside the service compose file.
4. View logs or stop the service with standard docker-compose flags (e.g., `scripts/compose.sh logs -f openmemory`).

---

## MCP Tool Catalog
| Tool | Description | Input Summary |
| --- | --- | --- |
| `ping` | Echo test; verifies transport wiring. | `{ message?: string }` |
| `write` | Placeholder echo writer. | `{ text: string }` |
| `search` | ChatGPT-required search utility hitting OpenMemory with `DEFAULT_USER_ID`. | `{ query: string, limit?: number }` |
| `fetch` | Fetch item by id from OpenMemory. | `{ id: string }` |
| `om.search` | Search OpenMemory for a specific user id with pagination. | `{ user_id: string, query?: string, page?: number, size?: number }` |
| `om.add` | Create a new memory entry in OpenMemory. | `{ user_id: string, text: string, app?: string }` |

> All tools require `OPENMEMORY_BASE_URL`; write operations may also require `OPENMEMORY_API_TOKEN` if the backend enforces authentication.

---

## Smoke Test Flow
1. Export or source your `.env` so the smoke scripts can read configuration.
2. Obtain an access token using Keycloak client credentials (see `docs/oauth-keycloak.md`).
3. Run `npm run smoke --workspace services/openmemory`; confirm the output includes `initialize` success and tool responses.
4. For SSE, set `ENABLE_SSE=true` in `.env` before starting the service and run `npm run smoke:sse --workspace services/openmemory`.
5. To run the end-to-end curl validation, execute:
   ```bash
   scripts/healthcheck.sh --base-url "${MCP_PUBLIC_BASE_URL}" --issuer "${OIDC_ISSUER}" \
     --client-id "$CLIENT_ID" --client-secret "$CLIENT_SECRET" --sse
   ```
   (the script reads defaults from env vars if flags are omitted).

---

## Related Documentation
- `docs/bootstrap-checklist.md` – end-to-end bootstrap steps.
- `docs/runbooks/compose-and-docs.md` – compose orchestration and docs rendering.
- `docs/oauth-keycloak.md` – OAuth integration checklist.
- `packages/mcp-auth-kit/README.md` – shared authentication helper usage.
