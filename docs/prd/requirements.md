# Requirements Summary

## Functional Requirements
- FR1: Root npm commands execute lint/test/build across all workspaces.
- FR2: `mcp-auth-kit` exposes manifest, PRM, auth guard, origin enforcement, and sensible defaults.
- FR3: `openmemory` remains the reference service using Streamable HTTP with an optional SSE fallback, while leaving room for additional MCP services.
- FR4: Bootstrap assets provision new MCP services with OAuth wiring in under 10 minutes.
- FR5: Docs stay synchronized with automation (bootstrap checklist, OAuth guide, migration plan).
- FR6: Keycloak automation scripts (`scripts/kc`) register scopes, trusted hosts, and status checks.
- FR7: MCP services expose health/debug endpoints for operators.

## Non-Functional Requirements
- NFR1: Node.js 24.x (current release with October 2025 LTS promotion planned) + TypeScript 5, strict type checking.
- NFR2: OAuth enforced by default; overrides limited to local development.
- NFR3: Lint/test/build complete within 5 minutes on developer hardware.
- NFR4: Structured logging with request IDs, session ids, auth flag.
- NFR5: Docs tracked with change logs and updated in same PRs as code changes.
- NFR6: Smoke tests per service wired into CI before production release.
- NFR7: Secrets managed via env files or secret stores; never committed.
