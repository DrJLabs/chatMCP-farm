# Epic 3 – Service Bootstrap & Release Enablement

## Goal
Make adding a new MCP service turnkey and establish release/versioning workflows.

## Stories

### Story 3.1 – Refresh service template & bootstrap script
- As a platform engineer, I want `scripts/bootstrap.sh` to scaffold services with the latest best practices.
- Acceptance Criteria
  1. Generated service includes auth kit wiring, lint/test scripts, docker snippet.
  2. Template reflects production-ready defaults (logging, health endpoints).
  3. Instructions documented in templates/README or PRD.

### Story 3.2 – Introduce release tooling
- As release engineering, I need automated version management (Changesets or equivalent) for packages and containers.
- Acceptance Criteria
  1. Release process captured in docs with step-by-step instructions.
  2. Sample release flow executed (dry-run) and recorded.
  3. CI integrates release checks (e.g., change files required).

### Story 3.3 – Draft migration checklist
- As operations, I need a definitive checklist for final repo split and deployment migration.
- Acceptance Criteria
  1. Checklist covers networks, secrets, CI rerouting, Traefik labels, Keycloak patch cadence.
  2. Linked from PROJECT_SPLIT_PLAN.md and PRD.
  3. Owners assigned for each checklist item.
