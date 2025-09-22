# MCP Servers Standalone Strategy

## Objectives
- Extract the `mcp-servers` workspace into its own project without losing Keycloak OAuth tooling.
- Preserve and reuse the onboarding flow defined in `docs/chatgpt-mcp-oauth-generic.md`.
- Keep `mcp-auth-kit` as the shared authentication layer for every MCP server.
- Provide a repeatable bootstrap so new MCP services inherit OAuth wiring, docs, and tests.

## Status Snapshot
- ✅ Workspace layout, templates, bootstrap script, and docs exist under `mcp-servers/`.
- ✅ OAuth guide cloned as `docs/oauth-keycloak.md`; quickstart lives in `docs/bootstrap-checklist.md`.
- ✅ Keycloak automation scripts under `scripts/kc/` provision scopes, trusted hosts, and status checks via `kcadm`.
- ⚠️ Root npm lint/test orchestration stubbed via workspace scripts; per-package lint/test targets and release tooling still TBD.
- ⚠️ Migration checklist and CI updates remain outstanding.

## Current Assets
- `packages/mcp-auth-kit/`: TypeScript helpers providing Keycloak-aware middleware and metadata endpoints.
- `services/mcp-test-server/`: Reference diagnostics service consuming the auth kit with docker-compose snippets.
- `scripts/compose.sh`: Discovers `services/*/compose.yml` fragments and runs docker-compose with merged stack.
- `docs/oauth-keycloak.md`: End-to-end instructions for Keycloak + ChatGPT Developer Mode.
- `docs/bootstrap-checklist.md`: Quickstart checklist mapping repo scripts to bootstrap tasks.
- `docs/config.sample.json` + `scripts/render-docs.mjs`: Configuration-driven doc rendering pipeline.
- `docs/runbooks/compose-and-docs.md`: Runbook covering aggregated compose usage, docs rendering, and BMAD activation notes.
- `scripts/healthcheck.sh`: Automated manifest/PRM/token/initialize validation aligned with the OAuth checklist.
- `.keycloak-env.example`, `.env.example`: Template environment files to copy before local runs.

## Proposed Structure (Post-Split)
```
mcp-servers/
  README.md                 # high-level overview + split migration notes
  docs/
    oauth-keycloak.md       # cloned & scoped version of chatgpt-mcp-oauth-generic
    bootstrap-checklist.md  # actionable quickstart for new servers
  packages/
    mcp-auth-kit/           # published/shared package
  services/
    mcp-test-server/        # reference diagnostics implementation
  scripts/
    kc/                     # wrappers around Keycloak automation (docker / kc_* scripts)
    bootstrap.sh            # scaffolds a new MCP server using templates
  templates/
    service/                # starter express server wired to auth kit
```

## Work Streams
1. **Documentation consolidation**
   - Derive `docs/oauth-keycloak.md` from existing generic checklist with repo-specific paths.
   - Create quickstart checklist focusing on repo-local scripts and environment variables.
   - Keep `scripts/render-docs.mjs` + `docs/config.sample.json` documented so rendered copies stay aligned with committed sources.
2. **Tooling alignment**
   - Move docker-compose snippets into `docker/` with environment examples.
   - Codify workspace commands using `npm run --workspaces` / `npm run --workspace <pkg>` so builds/tests stay aligned with npm guidance, and evaluate pnpm or Nx for caching/concurrency as the workspace grows.
   - Mirror `.env` + `.keycloak-env` templates under `env/` with comments for required secrets.
3. **Package management**
   - Convert `mcp-auth-kit` into a workspace package (`package.json` at repo root, enable `workspaces`).
   - Ensure TypeScript configs share a base `tsconfig.base.json`.
   - Add lint/test scripts and CI placeholders (CodeQL, lint, unit tests) and adopt release/version tooling such as Changesets for multi-package publishing.
4. **Bootstrap workflow**
   - Template generator (`scripts/bootstrap.sh`) copies `templates/service`, replaces placeholders, and will evolve alongside service requirements.
   - Document automation for registering client scopes and trusted-host entries in Keycloak via `kcadm.sh` / Admin REST (falls back to manual steps when needed).
5. **Extraction readiness**
   - Track files still depending on parent repo (e.g., root `.env`, Docker networks) and plan replacements.
   - When ready, create migration checklist (update Traefik labels, separate networks, secrets management).

## Immediate Next Steps (Pre-Split)
1. Implement Keycloak automation scripts under `scripts/kc/` (create_mcp_scope, status, etc.) using `kcadm.sh` commands for scopes, mappers, and trusted-host policy updates.
2. Integrate new services into docker-compose and CI workflows using workspace packages.
3. Establish shared lint/test tooling (root `npm run lint|test` invoking workspaces) and decide on Nx/pnpm adoption if build parallelism becomes a bottleneck.
4. Adopt Changesets (or similar) for versioning/publishing strategy ahead of the split.
5. Draft migration checklist for extracting repo (networks, secrets, Traefik updates).
6. Validate documentation coverage: ensure architecture/PRD shards and render pipeline reflect current scripts (bootstrap, compose, render-docs).

## Next Operator Checklist
- [ ] Wire the root workspace scripts (`lint`, `test`, `build`) to run real targets in every package/service.
- [x] Publish a short runbook covering `scripts/compose.sh`, doc rendering, and agent activation expectations (`docs/runbooks/compose-and-docs.md`).
- [ ] Choose and configure release tooling (e.g., Changesets) before publishing `mcp-auth-kit`.
- [ ] Update docker-compose snippets and CI workflows to reference the new workspace paths.
- [ ] Draft the migration checklist covering Traefik labels, network separation, and secrets handoff.
- [ ] Re-run `scripts/kc/create_mcp_scope.sh` and `scripts/kc/status.sh` in a clean environment once the above tasks land to validate automation end-to-end.

## Implementation Kickoff Checklist
- [ ] Bootstrap Keycloak automation:
  - [x] Implement `scripts/kc/create_mcp_scope.sh` using `kcadm.sh` for scope, mapper, trusted hosts.
  - [x] Add companion scripts (`kc/status.sh`, `kc/trusted_hosts.sh`).
- [ ] Wire root npm scripts: add `lint`, `test`, and `build` orchestration invoking workspace targets; decide on pnpm/Nx adoption if build times remain high.
  - [ ] `packages/mcp-auth-kit`: expose `lint` via `tsc --noEmit` and land a smoke-style `test` runner (Node test harness is acceptable) so the root target exercises the package.
  - [ ] `services/mcp-test-server`: add type-check `lint`, ensure `test` covers `npm run smoke` until formal suites exist, and propagate the same commands into `templates/service`.
  - [ ] Document the workspace commands and expectations in `mcp-servers/README.md` to keep new services aligned.
- [ ] Integrate Changesets (or similar) for versioning/publishing prior to repo split.
- [ ] Update `docker-compose.yml` and CI workflows to consume the new workspace paths and placeholders.
- [ ] Draft the migration checklist covering networks, secrets, Traefik, and Keycloak patch cadence.

## Risks & Mitigations
- **Doc drift**: designate `docs/oauth-keycloak.md` as canonical; leave pointer from root doc.
- **Auth kit coupling**: add tests and CI to catch regressions before split.
- **Keycloak automation**: ensure scripts tolerate relocated paths by using repo-relative discovery.

## Definition of Done (for split readiness)
- All MCP servers build/test via repo-local tooling.
- Documentation under `mcp-servers/docs/` is self-contained.
- Bootstrap script provisions new service with working OAuth metadata.
- Parent Keycloak repo only retains references (no shared code dependency).
