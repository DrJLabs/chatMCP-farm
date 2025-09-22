<!-- Derived from docs/chatgpt-mcp-oauth-generic.md on 2025-09-18; keep this copy authoritative for standalone mcp-servers repo. -->

# ChatGPT Developer Mode OAuth & MCP Integration Checklist

This document captures every configuration requirement and quirk we encountered while getting the MCP server working as a ChatGPT Developer Mode connector. Follow these steps end-to-end when standing up or debugging the integration.

> **Scope**: Keycloak 26.x realm `{{KC_REALM}}`, MCP server (TypeScript) deployed behind Traefik/Cloudflare at `<MCP_PUBLIC_BASE_URL>`, ChatGPT Developer Mode connectors (September 2025).
> **Variable key**: `MCP_HOST` is the canonical hostname (e.g., `service.example.com`); `MCP_TRANSPORT_URL = https://<MCP_HOST>/mcp`.
>
> **Variable reference** (configure via `docs/config.sample.json` + `docs/local/config.local.json`)
> - `{{KC_REALM}}` — Keycloak realm name for the MCP deployment.
> - `{{KC_HOSTNAME}}` — Base URL for public Keycloak requests (no `/realms/...`).
> - `{{KC_HOSTNAME_ADMIN}}` — Admin hostname for local access to the realm.
> - `{{KC_ISSUER}}` — Issuer URL (`{{KC_HOSTNAME}}/realms/{{KC_REALM}}`).
> - `{{MCP_PUBLIC_BASE_URL}}` — Public origin for the MCP service (OAuth protected resource).
> - `{{MCP_TRANSPORT_URL}}` — Streamable HTTP endpoint for the MCP server (`{{MCP_PUBLIC_BASE_URL}}/mcp`).
> - `{{MCP_SCOPE_NAME}}` — Audience client scope injected into OAuth tokens.
> - `{{OIDC_AUDIENCE}}` — Additional audience identifier accepted by the MCP service (legacy compatibility).

> **Local admin tip:** the automation scripts default to `KC_SERVER=http://127.0.0.1:5050/auth`, which is the Docker compose port-forward into Keycloak’s internal `8080` for admin/API access. They request tokens from `http://127.0.0.1:5050/auth/realms/{{KC_ADMIN_REALM}}/protocol/openid-connect/token` (with `KC_ADMIN_REALM` defaulting to `{{KC_REALM}}`). Override these values only when targeting the public hostname.

---

## 1. High-level flow

1. ChatGPT discovers MCP metadata from `https://<MCP_HOST>/.well-known/mcp/manifest.json` and `/.well-known/oauth-protected-resource`.
2. During connector setup ChatGPT performs OAuth Dynamic Client Registration (DCR) against Keycloak and creates a confidential client (random UUID).
3. ChatGPT drives an OAuth 2.1 authorization-code + PKCE flow with `redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect` and `resource=<MCP_PUBLIC_BASE_URL>`.
4. After consent, ChatGPT exchanges the code for an access token and calls `/mcp` using the Streamable HTTP transport.

OAuth succeeds only if Keycloak issues a token whose `aud` contains the MCP resource. The MCP server enforces the audience and the `Accept` header (`application/json, text/event-stream`).

---

## 2. Keycloak configuration

### 2.1 Realm-wide settings

- **Hostname routing**: `KC_HOSTNAME={{KC_HOSTNAME}}`, admin host `KC_HOSTNAME_ADMIN={{KC_HOSTNAME_ADMIN}}`, proxy headers enabled.
- **Dynamic Client Registration**: allowed for anonymous clients, but guarded by the client-registration policies listed below.

### 2.2 Client-registration policies

1. **Trusted Hosts** (`id=12a9cfb5-f3d9-4729-b6ed-c745638f79dc`)
   - `trusted-hosts = ["chatgpt.com", "chat.openai.com", "openai.com", "api.openai.com", "<MCP_HOST>"]`
   - `host-sending-registration-request-must-match = false` (ChatGPT’s DCR arrives via Cloudflare IPs, so strict matching blocks it.)
   - `client-uris-must-match = true` (retain sanity check on redirect URIs).
2. **Allowed Client Scopes** and **Allowed Protocol Mappers** policies remain enabled (default settings) so DCR clients inherit the approved scope/mappers list.

### 2.3 Client scope for MCP audience

- Created a dedicated OIDC client scope `{{MCP_SCOPE_NAME}}`.
- Attached protocol mapper `mcp-audience` (`oidc-audience-mapper`) with `included.custom.audience={{MCP_PUBLIC_BASE_URL}}` and `access.token.claim=true`.
- Added `{{MCP_SCOPE_NAME}}` to the realm’s **default client scopes** (`/realms/{{KC_REALM}}/default-default-client-scopes`).
- For existing ChatGPT registration clients and the static `{{OIDC_AUDIENCE}}`, we explicitly added `{{MCP_SCOPE_NAME}}` to their default scopes so issued tokens include the MCP audience immediately.

Automation tip: `scripts/kc/create_mcp_scope.sh --resource <MCP_PUBLIC_BASE_URL>` performs these steps idempotently (scope, mapper, trusted host entry, and default-scope attachments). Follow with `scripts/kc/status.sh --resource <MCP_PUBLIC_BASE_URL>` to confirm audience mappings and client assignments, and `scripts/kc/trusted_hosts.sh --list` / `--add <host>` to review or tweak the trusted host policy. All scripts authenticate via the `KC_CLIENT_ID` / `KC_CLIENT_SECRET` service account defined in `.keycloak-env` using the client-credentials grant, so they no longer depend on the Keycloak Docker stack running in this repository.

### 2.4 Redirect URIs and origins

ChatGPT-managed clients register redirect URIs automatically during Dynamic Client Registration. Ensure your Trusted Hosts policy (see §2.2) covers the ChatGPT domains and any of your own domains you expose; no manual URI list is required.

### 2.5 Token endpoint quirks

- Keycloak must accept **HTTP Basic** credentials on `/protocol/openid-connect/token` because ChatGPT sends `client_id/client_secret` via the Authorization header.
- PKCE is mandatory. ChatGPT uses `code_challenge_method=S256`; it still advertises `plain` but we do not allow it.
- ChatGPT sends the **`resource` parameter** on `/token`; ensure the audience mapper covers the `/mcp` resource.

### 2.6 Logging & diagnostics

- Enable access logging (`QUARKUS_HTTP_ACCESS_LOG_ENABLED=true`) to trace the full OAuth sequence.
- Consent POST followed by `/token` calls with `Python/3.12 aiohttp/3.9.5` user agent are normal—ChatGPT exchanges tokens via service code after you click “Yes”.

---

## 3. MCP server configuration

### 3.1 Endpoint & schema

- Public origin: `<MCP_PUBLIC_BASE_URL>` (OAuth protected resource).
- Streamable HTTP endpoint: `<MCP_TRANSPORT_URL>`.
- Manifest (`/.well-known/mcp/manifest.json`): `schemaVersion` **must** be `2025-06-18` to match the latest spec. Older versions (2024-11-05) caused ChatGPT to assume legacy requirements.
- Protected Resource Metadata (`/.well-known/oauth-protected-resource`):
  - `resource = <MCP_PUBLIC_BASE_URL>`
  - `authorization_servers = ["{{KC_ISSUER}}/.well-known/oauth-authorization-server"]`
  - `bearer_methods_supported = ["header"]`
  - Include `mcp_protocol_version: "2025-06-18"` for transparency.
- `WWW-Authenticate` header must reference the host root metadata: `Bearer resource_metadata="https://<MCP_HOST>/.well-known/oauth-protected-resource"` (ChatGPT rejects `/mcp` suffixes).
- Enforce origin/CORS allowlist for `https://chatgpt.com` and `https://chat.openai.com` (extendable via `ALLOWED_ORIGINS`).
- Reject requests missing `Accept: application/json, text/event-stream` with an explanatory error to aid testing.

### 3.2 Environment variables

| Variable | Value | Notes |
| --- | --- | --- |
| `MCP_PUBLIC_BASE_URL` | `<MCP_PUBLIC_BASE_URL>` | Must match canonical resource |
| `MCP_TRANSPORT_URL` | `<MCP_PUBLIC_BASE_URL>/mcp` | Streamable HTTP endpoint served by the MCP |
| `PRM_RESOURCE_URL` | `<MCP_PUBLIC_BASE_URL>` | Used for PRM + WWW-Authenticate helper |
| `OIDC_ISSUER` | `{{KC_ISSUER}}` | Issuer for Keycloak realm |
| `OIDC_AUDIENCE` | `<MCP_PUBLIC_BASE_URL>,{{OIDC_AUDIENCE}}` | Accept canonical resource and legacy client id |
| `ENABLE_STREAMABLE` | `true` | Streamable HTTP transport |
| `REQUIRE_AUTH` | `true` | Lock down MCP |
| `DEBUG_HEADERS` | `true` (optional) | Enables verbose header logging |
| `ALLOWED_ORIGINS` | optional CSV (`{{ALLOWED_ORIGINS}}`) | Add staging origins if needed (`AUTH_ENV_VARS` in `mcp-auth-kit` documents all supported toggles) |

### 3.3 Transport/logging tips

- Prefer Streamable HTTP transport. Expose SSE endpoints (`/mcp/sse`) only when a legacy client explicitly requires them.
- Log request id, origin, accept header, MCP session id for traceability.
- Provide `debug/oidc` and `debug/om` endpoints to quickly verify issuer and backend health.

---

## 4. ChatGPT integration quirks

1. **Dynamic client registration every attempt**: ChatGPT creates a new confidential client (UUID) whenever setup fails. Periodically prune orphan clients.
2. **Trusted Hosts policy is mandatory**: Without the expanded allowlist and relaxed host matching, DCR fails with `Policy 'Trusted Hosts' rejected request to client-registration service`.
3. **Consent loop**: After you click **Yes**, Keycloak logs show a consent POST followed by `/token` calls from `Python/3.12 aiohttp/3.9.5`. Only after a successful token exchange does ChatGPT call `/mcp`.
4. **Audience enforcement**: The access token must include `aud=<MCP_PUBLIC_BASE_URL>`. Missing audience manifests as 401s in MCP logs (`[AUTH] 401 unauthorized ... openai-mcp/1.0.0`).
5. **Redirect URIs**: ChatGPT may choose any of the four URIs in §2.4. Always provision them before testing.
6. **Discovery probes**: Expect numerous 404/308 requests against `/.well-known/**` paths. Ensure 308 redirects target the Keycloak issuer metadata.
7. **Token endpoint auth**: ChatGPT sends `Authorization: Basic ...` (client credentials) on `/token`. Keep `client_secret_basic` enabled.
8. **Scopes requested**: Typical request asks for `address microprofile-jwt organization phone`. Those scopes must exist (as optional/default client scopes) or Keycloak refuses the request.
9. **Cloudflare cache**: Invalidate cache for `/.well-known/*` after manifest/PRM changes; otherwise ChatGPT fetches stale metadata.

---

## 5. Validation playbook

1. **Metadata sanity**
   ```bash
   curl -s https://<MCP_HOST>/.well-known/mcp/manifest.json | jq '.schemaVersion'
   curl -s https://<MCP_HOST>/.well-known/oauth-protected-resource | jq '.resource'
   ```
2. **OAuth bootstrap header**
   ```bash
   curl -si <MCP_PUBLIC_BASE_URL> | grep WWW-Authenticate
   ```
3. **Dynamic client registration smoke**
   ```bash
   curl -s -X POST \
     {{KC_ISSUER}}/clients-registrations/openid-connect \
     -H 'Content-Type: application/json' \
     -d '{"client_name":"curl-test","redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"]}' | jq '.client_id'
   ```
   Then confirm the new client’s `defaultClientScopes` includes `{{MCP_SCOPE_NAME}}`.
4. **Token audience check**
   ```bash
   CLIENT_ID=...; CLIENT_SECRET=...
   curl -s -o token.json -w '%{http_code}' \
     -X POST {{KC_ISSUER}}/protocol/openid-connect/token \
     -H 'content-type: application/x-www-form-urlencoded' \
    -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET&resource=<MCP_PUBLIC_BASE_URL>"
   jq -r '.access_token' token.json | awk -F. '{print $2}' | base64 -d | jq '.aud'
   ```
5. **MCP initialize/call**
   ```bash
   ACCESS_TOKEN=$(jq -r '.access_token' token.json)
   curl -s -D headers.txt \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'Accept: application/json, text/event-stream' \
        -H 'Content-Type: application/json' \
        -X POST <MCP_TRANSPORT_URL> \
        -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1"}}}'
   grep -i 'Mcp-Session-Id' headers.txt
   ```
6. **Log correlation**
   ```bash
   docker compose logs --tail=200 keycloak | grep '<timestamp>'
   scripts/compose.sh logs --tail=200 <mcp-service> | grep '<request-id>'
   ```

---

## 6. Deployment checklist

1. Apply Keycloak env and restart (`docker compose up -d keycloak`).
2. Update client-registration policies (trusted hosts, scopes) via `kcadm`.
3. Create/verify the `{{MCP_SCOPE_NAME}}` client scope and ensure it’s in default client scopes.
4. Redeploy MCP server with updated env (`scripts/compose.sh up -d --build <mcp-service>`).
5. Purge Cloudflare cache for `/.well-known/*` if metadata changed.
6. Execute the validation playbook before asking users to reconnect.
7. During troubleshooting, inspect:
   - `kcadm get clients -r {{KC_REALM}} --fields clientId,defaultClientScopes`
   - Decoded access token audiences
   - Keycloak & MCP logs around the consent timestamp.

---

## 7. Common failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Policy 'Trusted Hosts' rejected request` | DCR host not allowlisted or host-match enabled | Add ChatGPT domains, disable host-match |
| ChatGPT shows generic connection error after consent | Access token missing MCP audience | Ensure `{{MCP_SCOPE_NAME}}` scope exists and is attached to default scopes |
| ChatGPT complains about MCP spec compliance | Manifest schemaVersion not `2025-06-18` or PRM missing fields | Redeploy MCP manifest/PRM handlers |
| `/token` responds 401 | Basic auth disabled or client secret mismatch | Keep `client_secret_basic` enabled and verify secret |
| MCP returns 401 to ChatGPT | Token audience wrong or `Accept` header missing | Decode token to confirm `aud`; enforce header |

---

## 8. References

- Model Context Protocol Specification 2025-06-18 (authorization & transports).
- OAuth 2.1 draft, RFC 8414, RFC 8707, RFC 9728.
- ChatGPT Developer Mode behaviour observed 2025-09-17 (Chrome 140).
- Shared code: see `mcp-servers/mcp-auth-kit` for reusable Express helpers and README instructions.

Keep this guide updated with future spec changes or ChatGPT platform adjustments.

> Render a local copy with your secrets injected by running `npm run docs:render` after defining overrides in `docs/local/config.local.json` (see `docs/config.sample.json`).

---

## 9. Onboarding additional MCP servers in the same realm

To reuse the `{{KC_REALM}}` realm for more MCP backends (e.g., additional services under different hostnames), repeat the steps below for each server. The goal is to give each connector its own OAuth resource audience while keeping policy management centralized.

1. **Pick the canonical resource URL**
   - Example: `https://<new-mcp-host>/mcp`.
   - Ensure the server’s manifest/PRM/`OIDC_AUDIENCE`/`MCP_PUBLIC_BASE_URL` all point to this URL.

2. **Extend Trusted Hosts policy**
   ```bash
   # add new host to trusted-hosts list (preserve existing entries)
   kcadm.sh get components/<trusted-hosts-id> -r {{KC_REALM}} > tmp.json
   # edit tmp.json -> add "<new-mcp-host>" under config.trusted-hosts
   kcadm.sh update components/<trusted-hosts-id> -r {{KC_REALM}} -f tmp.json
   ```

3. **Create a dedicated audience scope**
   ```bash
   kcadm.sh create client-scopes -r {{KC_REALM}} -s name=mcp-resource-<alias> -s protocol=openid-connect
   kcadm.sh create client-scopes/<scope-id>/protocol-mappers/models -r {{KC_REALM}} -f mapper.json
   # mapper.json => oidc-audience-mapper with included.custom.audience=https://<new-mcp-host>/mcp
   ```
   Keep `allow-default-scopes=true` in client-registration policy so DCR clients may receive this scope.

4. **Onboard ChatGPT connector**
   - Temporarily add `mcp-resource-<alias>` to the realm’s default client scopes:
     ```bash
     kcadm.sh update realms/{{KC_REALM}}/default-default-client-scopes/<scope-id> -n
     ```
   - Run the ChatGPT connector setup. It will register a UUID client.
   - After registration succeeds, remove the scope from `default-default-client-scopes` (to avoid handing out audience claims to unrelated clients) and explicitly attach it to the newly-created ChatGPT client:
     ```bash
     kcadm.sh delete realms/{{KC_REALM}}/default-default-client-scopes/<scope-id>
     kcadm.sh update clients/<new-client-id>/default-client-scopes/<scope-id> -n
     ```
   - If you want a pre-provisioned static client (like `{{OIDC_AUDIENCE}}`), attach the scope there as well.

5. **Update MCP env**
   - `OIDC_AUDIENCE` should include both the canonical resource and any legacy client id (if the server accepts multiple audiences).
   - Redeploy the MCP stack and re-run the validation playbook.

> Tip: the reusable module under `mcp-servers/mcp-auth-kit` already wires most of this together; import it into the new MCP server instead of re-implementing auth middleware.

Automation tip: wrap steps 3–4 in a script that takes `<resource-host>` and `<client-id>` so future servers can be onboarded in minutes.
