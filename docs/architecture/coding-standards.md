# Coding Standards

1. TypeScript **strict** mode everywhere; no `any` unless unavoidable and documented.
2. Prefer async/await over raw Promises; catch and surface errors with context.
3. Use `zod` schemas for all MCP tool input validation; never trust raw request payloads.
4. Log through `morgan` + structured console statements; include `X-Request-Id` if available.
5. Export ESM modules; maintain named exports for shared utilities.
6. Rely on Express 5's native async error propagation—do not reintroduce `express-async-errors` or similar wrappers.
7. Centralize environment variable parsing inside `mcp-auth-kit` or a service-level config module; validate at startup.
8. Keep controllers transport-agnostic—business logic lives in separate functions to enable reuse/testing.
9. Tests must avoid global state; use per-test fixtures and clean up temporary resources.
10. Default to `npm run lint` before committing; add ESLint rules as repo matures.
11. Default to Streamable HTTP transport; add SSE fallbacks only when a consuming client explicitly requires them.
