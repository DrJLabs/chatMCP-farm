# MCP Service Template

Files in this directory seed new MCP services when `scripts/bootstrap.sh` runs. Tokens such as `__SERVICE_NAME__` are replaced during scaffolding.

## Contents
- `package.json` – npm scripts and dependencies with workspace-relative link to `mcp-auth-kit`.
- `tsconfig.json` – extends the workspace base config.
- `src/server.ts` – Express server wired to the auth kit and streamable HTTP transport.
- `src/mcp.ts` – Minimal MCP server definition with placeholder tool.
- `src/smoke.ts` – Initialization smoke test using Streamable HTTP.

## Customisation Checklist
1. Replace placeholder tool(s) in `src/mcp.ts` with real capabilities.
2. Update manifest metadata via environment variables (`MCP_NAME_HUMAN`, etc.).
3. Provide README and service-specific `.env` entries once scaffolded.
