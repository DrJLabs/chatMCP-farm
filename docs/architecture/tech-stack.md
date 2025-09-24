# Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language Runtime | Node.js 24.x (pre-LTS; October 2025 promotion expected) | Aligns with MCP SDK support and modern ESM features |
| Application Framework | Express 5.1.x | Async-aware router with built-in Promise handling; aligns with `mcp-auth-kit` peers |
| MCP SDK | `@modelcontextprotocol/sdk` | Provides Streamable HTTP transport (SSE fallback available when required) |
| Auth/OIDC | Keycloak (`OMA` realm) | Shared OAuth provider; integrates via `mcp-auth-kit` |
| Auth Library | `mcp-auth-kit` | Local package exposing manifest, PRM, auth guard, CORS/origin checks |
| Validation | `zod` | Declarative schemas for MCP tool inputs |
| Logging | `morgan` + console | Structured request logging with custom tokens |
| Containerization | Docker + docker-compose | Local orchestration and image packaging |
| Scripts | Bash (`scripts/kc/*.sh`) | Wrap `kcadm` for Keycloak automation |
| Package Manager | npm workspaces | Monorepo coordination |
| Testing | Node smoke scripts (`smoke.ts`) | Validate transports and diagnostics tooling for MCP test server |
| Documentation | Markdown in `docs/` | BMad-compliant PRD & architecture shards |
