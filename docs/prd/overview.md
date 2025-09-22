# PRD Overview

## Goals
- Deliver a secure monorepo for OAuth-protected MCP services backed by shared Keycloak tooling.
- Ship reusable authentication and automation assets that allow new MCP services to launch quickly.
- Keep operational runbooks and validation playbooks collocated with code.

## Background
`chat-mcp-farm` is a spin-out of the original `mcp-servers` workspace. The current assets include the MCP test server, the reusable `mcp-auth-kit` package, Keycloak automation scripts, and scoped documentation. The project now focuses on hardening these foundations and ensuring future services inherit the same secure defaults.

## Change Log
| Date | Version | Notes |
| --- | --- | --- |
| 2025-09-19 | 0.1.0 | Initial shard created from v0.1 PRD |
