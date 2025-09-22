# Epic 2 – MCP Test Server Hardening

## Goal
Ensure the MCP test server meets OAuth requirements, exposes polished diagnostics tooling, and serves as the canonical integration harness.

## Stories

### Story 2.1 – Complete MCP transports & diagnostics
- As a platform engineer, I want manifest, PRM, Streamable HTTP, and debug endpoints wired through the auth kit, with SSE fallback only if we have a consuming client that requires it.
- Acceptance Criteria
  1. `/mcp`, `/mcp/sse`, `/sse`, `/debug/config`, `/debug/oidc`, `/healthz` respond as documented.
  2. OAuth required flag toggles via env; default is enabled.
  3. Logs include request ID, origin, auth state.

### Story 2.2 – Expand Diagnostics Coverage
- As an MCP user, I need additional diagnostics tools (latency simulation, origin toggles) to validate infrastructure end-to-end.
- Acceptance Criteria
  1. Tools return formatted results with `DEFAULT_USER_ID` fallback.
  2. Errors include actionable details without leaking secrets.
  3. Env var requirements documented in README/PRD.

### Story 2.3 – Add smoke and regression tests
- As release engineering, I need smoke tests covering transports and API calls before deploy.
- Acceptance Criteria
  1. `npm run test` executes smoke suite validating Streamable HTTP (run SSE harness only when that fallback is enabled).
  2. Tests run in CI pipeline with gating.
  3. Failure triage instructions captured in docs.
