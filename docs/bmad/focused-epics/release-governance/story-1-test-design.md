# Test Design: Story 1 (Release Workflow Alignment)

Date: 2025-09-25
Author: Quinn (Test Architect)

## Objectives

Validate that the updated release pipeline executes successfully with GitHub-only semantic-release configuration and that documentation communicates the new process.

## Test Scenarios

| ID      | Priority | Scenario                                                                 | Method                     |
| ------- | -------- | ------------------------------------------------------------------------ | -------------------------- |
| REL-T1  | P0       | Verify release workflow on PR branch (dry-run) completes without npm errors | Run `semantic-release --dry-run` locally and capture output |
| REL-T2  | P0       | Ensure release workflow on `main` succeeds and creates GitHub release/tag  | Observe Actions run after merge |
| REL-T3  | P1       | Confirm `.bmad-core/install-manifest.yaml` updated and `bmad-method validate` passes | Execute `npm run bmad:validate` |
| REL-T4  | P2       | Check documentation lists GitHub-only release steps                        | Peer review `docs/release-automation.md` |

## Test Data

- Conventional commits on feature branch (`feat:` / `fix:`) to drive semantic-release versioning.

## Tooling

- GitHub Actions
- `semantic-release`
- `bmad-method validate`

## Exit Criteria

- REL-T1 through REL-T3 must pass with evidence attached to story change log.
- REL-T4 peer review approved by PM/QA.

