# Simple MCP Test Server - Brownfield Enhancement

## Epic Goal
Deliver a minimal MCP-compliant server that validates our docker-compose orchestration, Keycloak OAuth wiring, and ChatGPT integration end-to-end.

## Epic Description

### Existing System Context
- Current relevant functionality: `services/mcp-test-server` supplies our OAuth-enabled reference MCP diagnostics harness with Streamable HTTP transport and smoke tests.
- Technology stack: Node.js 24.x (ESM, TypeScript), Express 4, `@modelcontextprotocol/sdk`, `mcp-auth-kit`, Docker Compose, Keycloak (`OMA` realm).
- Integration points: Reuses shared `mcp-auth-kit`, participates in `scripts/compose.sh` aggregation, authenticates via local Keycloak, and must expose manifest/TLS details for ChatGPT connections.

### Enhancement Details
- What's being added/changed: Scaffold a lightweight `services/mcp-test-server` that exposes a deterministic tool for integration smoke tests plus a webhook to echo auth metadata.
- How it integrates: Service uses templates/service scaffolding, plugs into shared Docker Compose stack, registers OAuth client in Keycloak, and documents ChatGPT connection steps.
- Success criteria: Docker Compose stack boots with the new server, OAuth token exchange succeeds, ChatGPT can query the server via manifest + secret, and smoke documentation captures the full procedure.

## Stories
1. **Story 1:** Scaffold `mcp-test-server` service with baseline Express/MCP wiring and align env/compose templates.
2. **Story 2:** Implement OAuth manifest + tool behaviour to exercise auth and return verifiable responses.
3. **Story 3:** Produce compose integration, test scripts, and ChatGPT connection runbook validating end-to-end flow.

## Compatibility Requirements
- [ ] Existing APIs remain unchanged
- [ ] Database schema changes are backward compatible
- [x] UI changes follow existing patterns (CLI-based tooling only)
- [x] Performance impact is minimal

## Risk Mitigation
- **Primary Risk:** Misconfigured OAuth client or manifest breaks other services during compose aggregation.
- **Mitigation:** Isolate env variables via `.env.example`, gate compose inclusion behind explicit opt-in, and document rollback.
- **Rollback Plan:** Remove service entry from `scripts/compose.sh` aggregation and revert new Keycloak client via `kc_export_realm.sh` snapshot.

## Definition of Done
- [ ] All stories completed with acceptance criteria met
- [ ] Existing functionality verified through testing
- [ ] Integration points working correctly
- [ ] Documentation updated appropriately
- [ ] No regression in existing features

## Story Manager Handoff
"Please develop detailed user stories for this brownfield epic. Key considerations:

- This is an enhancement to an existing system running Node.js 24.x, Express 4, and `@modelcontextprotocol/sdk`
- Integration points: reuse `mcp-auth-kit`, wire into docker-compose orchestration, ensure Keycloak realm automation handles new client, and document ChatGPT link steps
- Existing patterns to follow: service scaffolding in `templates/service`, environment validation via `zod`, and the new MCP test server diagnostics tooling
- Critical compatibility requirements: keep current `scripts/compose.sh` behaviour stable, ensure the test server profile remains opt-in, and document rollback steps
- Each story must include verification that existing functionality remains intact

The epic should maintain system integrity while delivering the end-to-end MCP test server verification."
