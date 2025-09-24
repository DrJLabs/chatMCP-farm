# MCP Auth Kit

Reusable TypeScript helpers for securing MCP servers with our shared Keycloak realm (`OMA`). The kit centralises OAuth/OIDC plumbing so each MCP server only needs to set a few environment variables.

## What it provides

- Environment-driven configuration loader (`loadAuthKitOptionsFromEnv`).
- Express middlewares for:
  - Origin enforcement + CORS allowlist
  - `WWW-Authenticate` hints and 401 handling
  - Manifest + Protected Resource Metadata handlers
  - JWT bearer verification against Keycloak JWKS
- Sensible defaults for ChatGPT Developer-mode connectors (streamable HTTP, schema version `2025-06-18`, ChatGPT origins, etc.).

## Files

- `src/index.ts` – exports `loadAuthKitOptionsFromEnv` and `createAuthKit`.
- `package.json` / `tsconfig.json` – build configuration (run `npm run build` before consuming).

## Express 5 + `jose@6` upgrade notes

- Peer dependency now targets `express@^5.1.0`; install Express 5 before wiring the auth kit into a service. The package no longer supports Express 4 type definitions.
- `jose@^6.1.0` introduces PQC-ready algorithms and requires Node.js 20.19+ (workspace standard is Node 22). Older Node runtimes will fail fast when running the `postbump:test` helper or building the library.
- After bumping dependencies in a consumer, run `npm run postbump:test` at the workspace root to execute `npm run test --workspaces --if-present` and confirm all services still build and pass their suites.

## Setup for a new MCP server

1. **Install dependencies**
   ```bash
   cd mcp-servers/mcp-auth-kit
   npm install
   npm run build
   ```
   In the MCP server project, add a dependency via a relative path (e.g., in `package.json`):
   ```json
   "dependencies": {
     "mcp-auth-kit": "file:../mcp-auth-kit"
   }
   ```

2. **Configure environment variables** (per server)
   - `AUTH_ENV_VARS` exported from this package enumerates every supported variable, whether it is required, and the default value we fall back to.
   - Key values:
   - `MCP_PUBLIC_BASE_URL` (and/or `PRM_RESOURCE_URL`, `MCP_RESOURCE_URL`): canonical MCP URL, e.g. `https://mcp.example.com/mcp`.
   - `OIDC_ISSUER`: `https://keycloak.example.com/auth/realms/example`.
     - `OIDC_AUDIENCE`: comma-separated list containing at least the MCP resource URL; include additional audiences if needed.
     - Optional overrides: `ALLOWED_ORIGINS`, `ENABLE_STREAMABLE`, `ENABLE_SSE`, `DEBUG_HEADERS`, manifest metadata fields, etc.
   - Call `summarizeAuthEnv()` during startup or in health/debug endpoints if you need to show what the service picked up without leaking secrets.

3. **Use the kit in your Express server**
   ```ts
   import express from 'express'
   import { loadAuthKitOptionsFromEnv, createAuthKit } from 'mcp-auth-kit'

   const app = express()
   const authKit = createAuthKit(loadAuthKitOptionsFromEnv())

   app.set('trust proxy', true)
   app.use(authKit.originCheck)
   app.use(authKit.cors)
   app.use(express.json({ limit: '1mb' }))

   app.get('/.well-known/mcp/manifest.json', authKit.manifestHandler)
   app.get('/.well-known/oauth-protected-resource', authKit.prmHandler)

   app.post('/mcp', authKit.authGuard, (req, res) => {
     // handle MCP streamable HTTP
   })
   ```

4. **Keycloak wiring**
   - Follow the onboarding steps in `docs/chatgpt-mcp-oauth.md` §9 to create a dedicated audience client scope and add the MCP hostname to the Trusted Hosts policy.
   - Attach the scope to any existing clients that should issue MCP tokens (for ChatGPT, target the dynamically registered connector client).

5. **Validation**
   - Run the validation playbook from `docs/chatgpt-mcp-oauth.md` to confirm metadata, client registration, token audience, and MCP handshake.

## Customisation points

- If a server needs a different set of allowed origins or endpoints, override `ALLOWED_ORIGINS` or supply custom names via env vars.
- To disable auth temporarily (local testing), set `REQUIRE_AUTH=false`.
- For legacy-only controllers, set `ENABLE_STREAMABLE=false` or `ENABLE_SSE=false` as required.

## Linking documentation

The full integration guide lives at `docs/chatgpt-mcp-oauth.md` (updated with onboarding procedures). Use this kit plus that guide for any new MCP service.
