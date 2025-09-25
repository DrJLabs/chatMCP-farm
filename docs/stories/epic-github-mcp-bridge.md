# GitHub MCP Bridge Parity Epic

## Epic Goal
Elevate `services/github-mcp` to full parity with GitHub's official MCP server by wiring the existing Express transport into the standalone `github-mcp-server` binary through a Streamable HTTP bridge.

## Epic Description

### Existing System Context
- `services/github-mcp` currently hosts a custom MCP implementation wired to `mcp-auth-kit`, Traefik, and the shared OAuth guard.
- The service already exposes `/.well-known/mcp/manifest.json`, enforces Accept header checks, and uses Streamable HTTP with local session state.
- Compose orchestration, documentation, and Keycloak scope automation assume a single container publishing the transport on port 8770.

### Enhancement Details
- Introduce a dedicated bridge container that runs `github-mcp-server` behind `mcp-proxy`, exposing Streamable HTTP on an internal port while reusing GitHub authentication via a PAT.
- Extend the GitHub MCP compose fragment so the primary service forwards `/mcp` requests to the bridge when `MCP_UPSTREAM_URL` is configured, preserving Traefik, health checks, and manifest routes.
- Update the Express app to proxy MCP traffic to the upstream bridge while retaining the local transport as a fallback when the environment variable is absent.
- Expand `.env` templates and documentation to capture the new upstream configuration, runtime flags, and optional PAT usage.
- Validate that the manifest, health checks, and GitHub tool parity remain intact when running the compose profile locally.

## Stories
- [x] **Story 3.1:** Implement the github-mcp-server bridge for `services/github-mcp`, including Docker image, compose integration, proxy wiring, environment updates, and parity validation.

## Compatibility Requirements
- [x] Preserve existing `/mcp` manifest and health endpoints for ChatGPT Developer Mode connectors.
- [x] Maintain backward compatibility by retaining the local Streamable HTTP transport path when the bridge is disabled.
- [x] Ensure docker-compose profiles remain opt-in and do not alter other services.
- [x] Avoid changes to Keycloak scope automation beyond documenting new environment variables.

## Risk Mitigation
- **Primary Risk:** Proxy misconfiguration breaks GitHub tool calls or leaks unauthenticated access when the upstream bridge is enabled.
- **Mitigation:** Gate forwarding behind `MCP_UPSTREAM_URL`, propagate auth/session headers explicitly, and keep local transport fallback to simplify rollback.
- **Rollback Plan:** Unset `MCP_UPSTREAM_URL`, redeploy the existing container-only stack, and remove the bridge service from compose to revert to the current implementation.

## Definition of Done
- [x] Bridge container builds reproducibly and runs `github-mcp-server` behind `mcp-proxy` with documented configuration.
- [x] Compose profile boots both services locally and routes `/mcp` requests through the bridge when enabled.
- [x] Express proxy behaviour passes parity smoke tests; local fallback remains functional.
- [x] Documentation (`README`, `.env.example`, follow-ups) reflects the new configuration and validation steps.

## Story Manager Handoff
"Please draft detailed story documentation for Story 3.1. Key expectations:

- Reuse the existing `services/github-mcp` directory and compose profile.
- Capture acceptance criteria covering the bridge Dockerfile, compose wiring, Express proxy logic, environment templates, and validation steps.
- Reference the rollback plan and ensure compatibility requirements remain checkable.
- Provide clear tasks that walk developers through implementing and testing the bridge without regressing current behaviour.

Ensure the story is ready for researcher, QA, and PO validation as part of the focused-epic workflow."
