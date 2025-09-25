# Risk Profile: Story 1 (Release Workflow Alignment)

Date: 2025-09-25
Reviewer: Quinn (Test Architect)

## Executive Summary

- Total Risks Identified: 2
- Critical Risks: 0
- High Risks: 1
- Risk Score: 12/100

## Risk Matrix

| Risk ID | Category    | Description                                                      | Probability | Impact | Score | Priority |
| ------- | ----------- | ---------------------------------------------------------------- | ----------- | ------ | ----- | -------- |
| REL-001 | Operational | Release workflow still fails because npm publish is attempted    | Medium (2)  | High (3) | 6   | High     |
| REL-002 | Process     | Contributors confused about new release steps without docs update | Medium (2)  | Medium (2) | 4 | Medium   |

## Mitigations

- **REL-001:** Configure semantic-release with GitHub-only plugins and run `--dry-run` prior to merging.
- **REL-002:** Update `docs/release-automation.md` and add checklist in AGENTS/PM guidance.

## Reviewer Artifact Hints

- `.github/workflows/release.yaml`
- `.releaserc.json`
- `docs/release-automation.md`
- `.bmad-core/install-manifest.yaml`

## Recommendations

- Must Fix REL-001 before merging.
- Document mitigation status for REL-002 during review.

## Follow-Up Tasks

- [ ] Capture release workflow run ID in story change log once green on `main`.

