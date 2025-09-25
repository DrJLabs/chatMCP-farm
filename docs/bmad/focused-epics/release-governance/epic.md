# Release Governance Modernization Focused Epic

## Epic Goal

Re-align the chat-mcp-farm release workflow so it mirrors the upstream BMAD pattern: GitHub-only semantic-release, no npm publishing, automated changelog/tagging, and a maintained installer footprint that matches the shipped tooling.

## Epic Description

**Current State**

- `semantic-release` is installed but the repo is marked `"private": true` with no npm credentials, causing every release attempt to fail.
- The GitHub release workflow is missing, so there is no consistent tag/changelog automation.
- Installer tooling only recently re-imported the BMAD `tools/` directory and still lacks a manifest update to reflect the new files.

**Desired Future State**

- Semantic-release runs with GitHub-only plugins, creating releases/tags without attempting npm publish.
- The release workflow triggers on `main` and attaches any build artifacts (optional) while skipping npm steps.
- The installer manifest and docs are updated so `bmad-method install` recognises the current tooling footprint.
- Documentation clearly describes the release process for contributors.

## Success Criteria

- CI release job succeeds without requiring npm tokens.
- GitHub Releases and changelog entries are generated automatically from conventional commits.
- `.bmad-core/install-manifest.yaml` reflects the reviewer tooling and installer changes.
- Contributing documentation describes how to run the release pipeline locally and in CI.

## Stories

1. **Story 1 (Planned):** Convert release automation to GitHub-only semantic-release and update installer/docs accordingly.

## Compatibility Requirements

- [ ] Release workflow must run on GitHub-hosted runners without additional secrets beyond `GITHUB_TOKEN`.
- [ ] Installer manifest version must track the BMAD template version used by this repo.
- [ ] Documentation updates land under `docs/` and follow BMAD style guidelines.
- [ ] Existing services/packages remain unaffected by the release workflow changes.

## Risk Mitigation

- **Release Drift:** Without npm publishing, ensure downstream instructions tell consumers to fetch artifacts from GitHub releases.
  - *Mitigation:* Update contributor docs with explicit steps.
- **Manifest Staleness:** Forgetting to update the install manifest could break future refreshes.
  - *Mitigation:* Include manifest update as acceptance criteria with validation instructions.

## Definition of Done

- [ ] Story 1 accepted with release workflow green on `main`.
- [ ] `.releaserc` (or equivalent) committed with GitHub-only configuration.
- [ ] Installer manifest + docs updated and validated via `bmad-method validate`.
- [ ] Release documentation reviewed by the team.

## Validation Checklist

- [ ] Release workflow passes on a dry-run PR branch and on `main` after merge.
- [ ] Semantic-release logs confirm a GitHub release was created and npm publish skipped.
- [ ] Installer tooling (`npm run bmad:validate`) completes without errors.

## 🔬 Research & Validation Log (2025-09-25)

- **Researcher:** Riley Chen
- **Mode:** focused-epic small team
- **Summary:** Benchmarked BMAD’s GitHub-only release approach and identified the local gaps (missing workflow, stale manifest, npm publish failures).

### Findings

| Priority | Area              | Recommendation                                            | Owner | Evidence |
| -------- | ----------------- | --------------------------------------------------------- | ----- | -------- |
| High     | Release Workflow  | Adopt BMAD GitHub release job & drop npm publisher plugin | Dev   | BMAD `.github/workflows/release.yaml` |
| Medium   | Installer Assets  | Refresh `.bmad-core/install-manifest.yaml` for reviewer tooling | DevOps | Current manifest lacks new files |
| Medium   | Contributor Docs  | Document release steps + how to run semantic-release locally | PM   | `docs/release-automation.md` needs update |

### Follow-Up Tasks

- [ ] Confirm version bump rules align with conventional commits.
- [ ] Decide whether to attach build artifacts (e.g., tarballs) to releases.

