# Story 1: Align Release Workflow with BMAD GitHub-Only Pattern

## Status

- Planned

## Story

**As the** release maintainer for chat-mcp-farm,
**I want** the release automation to match BMAD’s GitHub-only semantic-release flow,
**so that** every push to `main` tags a release, updates the changelog, and avoids failing npm publish steps.

## Acceptance Criteria

1. Add or update a GitHub Actions release workflow that runs semantic-release with GitHub plugins only (no npm publish) and succeeds on `main`.
2. Configure semantic-release (`.releaserc` or equivalent) to skip npm publishing, update the changelog, and create GitHub releases.
3. Update `.bmad-core/install-manifest.yaml` to include the new reviewer tooling and bump the BMAD version reference.
4. Document the release process (runbook entry under `docs/`) including how to trigger releases and where artifacts live.
5. Demonstrate a successful dry-run (`semantic-release --dry-run`) and a passing CI run on a PR branch.

## Tasks / Subtasks

- [ ] Create `.github/workflows/release.yaml` mirroring BMAD’s GitHub-only workflow (trigger on `main`, uses `semantic-release` with GitHub plugin).
- [ ] Add `.releaserc.json` (or update existing config) to disable npm publish (`"npmPublish": false`) and configure changelog + GitHub assets.
- [ ] Run `semantic-release --dry-run` locally to verify configuration before committing CI changes.
- [ ] Update `.bmad-core/install-manifest.yaml` to version 4.43.2 (or later) and list new files (reviewer docs, tooling).
- [ ] Update `docs/release-automation.md` with GitHub-only guidance and remove npm references.
- [ ] Open PR, ensure PR validation passes (including reviewer jobs), then merge and confirm the release workflow succeeds on `main`.

## Dev Notes

- Use BMAD’s release workflow as the reference implementation.
- Rely on repository `GITHUB_TOKEN` for authentication; no npm credentials should be needed.
- When updating the manifest, confirm `bmad-method validate` still passes.

## QA Notes

- Validate that the release workflow run on `main` completes successfully and creates a GitHub release draft/tag.
- Ensure documentation updates clearly specify the GitHub release process.

## QA Results

- Pending

