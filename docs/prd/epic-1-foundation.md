# Epic 1 – Workspace Foundation & Tooling

## Goal
Stabilize the monorepo toolchain, automation scripts, and documentation so additional MCP services can rely on a consistent base.

## Stories

### Story 1.1 – Wire root npm scripts
- As a workspace maintainer, I want `npm run lint|test|build` to execute every package/service target so CI stays consistent.
- Acceptance Criteria
  1. Root scripts call each workspace target and propagate failures.
  2. Commands document usage in README/PRD.
  3. Local execution completes in <5 minutes on reference hardware.

### Story 1.2 – Harden Keycloak automation
- As an operator, I want `scripts/kc/*.sh` to configure scopes and trusted hosts via `kcadm` so services inherit secure defaults.
- Acceptance Criteria
  1. Scripts run against local Keycloak docker-compose without manual editing.
  2. Logging highlights actions taken and errors.
  3. docs/bootstrap-checklist.md references each script.

### Story 1.3 – Document developer bootstrap
- As a new developer, I want a step-by-step bootstrap checklist so I can run services locally.
- Acceptance Criteria
  1. Checklist covers prerequisites, env templates, Keycloak login, smoke tests.
  2. Validated by running from a clean clone.
  3. Linked from README and PRD.

### Story 1.4 – Upgrade workspace tooling to Node 24 LTS
- As a platform engineer, I want the workspace to standardise on Node.js 24 LTS so development, CI, and runtime images stay aligned with the upcoming LTS.
- Acceptance Criteria
  1. Update node engines, Docker base images, and any build scripts to Node 24 LTS.
  2. CI workflows and local documentation reflect the new Node version with guidance for nvm/asdf installs.
  3. `npm run lint|test|build` passes under Node 24 across packages and services.
  4. Release notes in docs/prd.md Change Log capture the version migration.

