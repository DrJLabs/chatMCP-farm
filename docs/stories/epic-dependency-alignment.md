# Focused Epic – Dependency Alignment for MCP Services

## Epic Goal
Upgrade our MCP service stack to the current Express 5 and MCP SDK ecosystem while keeping Node 22 parity, eliminating dual dependency trees, and hardening automated test coverage across services and templates.

## Epic Description

### Existing System Context
- Current services (`services/mcp-test-server`, `services/github-mcp`) and the service template pin Express 4.x, Vitest 1.x, and older `@modelcontextprotocol/sdk` patches.
- Shared `mcp-auth-kit` enforces an Express 4-only peer range, and architecture docs still describe Express 4 as the standard HTTP framework.
- CI relies on workspace-level scripts; there is no single command to exercise all tests after dependency updates.

### Enhancement Details
- What's being added/changed: Move first-party services, templates, and shared libraries to Express 5.1.x, latest MCP SDK 1.18.1, Zod 3.24.x, Supertest 7.1.x, Vitest 3.2.x, Typescript 5.6.x, and `@types/node` 22.9.x. Relax `mcp-auth-kit` peers to cover Express 5 and refresh `jose` 5.9.x.
- How it integrates: Services consume the upgraded dependencies directly, templates inherit the modern defaults for future scaffolds, and `mcp-auth-kit` continues to provide auth middleware without peer warnings. Architecture shards and `.env.example` files are updated to reflect new expectations and smoke workflows.
- Success criteria: Dependency bumps compile and pass tests on Node 22 and Node 24, Express 5 routing changes are reconciled (middleware signatures, error handlers, async handling), and upgraded Vitest config succeeds with Supertest coverage intact. Architecture/PRD shards document the new baseline and rollback instructions.

## Stories
- [x] **Story 2.1:** Upgrade `services/mcp-test-server` dependencies to Express 5, SDK 1.18.1, Zod 3.24.x, Supertest 7.1.x, Vitest 3.2.x, and TS toolchain; reconcile router/config changes and restore lint/test parity.
- [ ] **Story 2.2:** Mirror the dependency upgrades in `services/github-mcp`, adjust tests for Express 5 differences, and verify smoke tooling remains stable.
- [ ] **Story 2.3:** Refresh `templates/service` so newly bootstrapped services inherit Express 5 defaults, Vitest 3 config, and updated `.env` + compose fragments.
- [ ] **Story 2.4:** Update `packages/mcp-auth-kit` peer ranges and `jose` patch level, publish migration notes, and add workspace-wide post-bump script (`npm run test --workspaces` helper) plus documentation updates (tech stack, coding standards references, rollback guidance).

## Compatibility Requirements
- [ ] Node engine range remains `^22 || ^24`; no changes to runtime expectations for consumers.
- [ ] Streamable HTTP transport contracts exposed by services remain backward compatible.
- [ ] Template outputs continue to match current scaffold expectations (Dockerfile, compose snippets, lint/test scripts).
- [ ] Shared auth flows (`mcp-auth-kit`) remain API-compatible with existing services.

## Risk Mitigation
- **Primary Risk:** Express 5 introduces async router semantics and built-in types that may break existing middleware and tests.
- **Mitigation:** Add targeted integration tests covering auth middleware, error handling, and diagnostics endpoints post-upgrade; audit middleware signatures and ensure TypeScript types compile without relying on deprecated `@types/express` definitions.
- **Rollback Plan:** Keep a patch branch with pre-upgrade lockfile; if issues arise, revert service/template package.json changes and republish `mcp-auth-kit` peers, then rerun `npm install` to restore Express 4 stack.

## Definition of Done
- [ ] All four stories completed with acceptance criteria validated via Vitest 3 + Supertest suites on Node 22.
- [ ] Architecture shard (`docs/architecture/tech-stack.md`) and PRD references updated to call out Express 5 baseline and new testing workflow.
- [ ] `.env.example`, compose snippets, and README instructions reflect any new scripts or behaviour.
- [ ] Follow-up items (if any) logged in `docs/stories/follow-ups.md` with owners and target dates.
- [ ] No regressions observed in smoke tests or workspace lint/test commands.

## Story Manager Handoff
"Please draft detailed stories for this focused epic. Ensure each story:

- Explicitly lists the dependency versions to bump, the affected package.json locations, and required TypeScript/config changes (Vitest 3 breaking updates, Express 5 middleware signatures).
- Captures regression expectations: rerun `npm run test --workspaces`, targeted Supertest coverage, and manual smoke snippets where applicable.
- Identifies documentation touchpoints (tech stack shard, template README, `mcp-auth-kit` changelog) and includes rollback instructions when bumping shared packages.
- Flags cross-workspace considerations such as updating `package-lock.json`, ensuring templates and services stay in sync, and coordinating release notes if `mcp-auth-kit` version increments.

The finished stories should make the upgrade plan executable without re-reading this epic."
