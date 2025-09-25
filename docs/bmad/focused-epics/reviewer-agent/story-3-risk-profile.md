# Risk Profile: Story 1.3 (Integrate Reviewer Into Focused-Epic Workflow)

Date: 2025-09-23
Reviewer: Quinn (Test Architect)

## Executive Summary

- Total Risks Identified: 3
- Critical Risks: 0
- High Risks: 1
- Risk Score: 20/100

## Risk Matrix

| Risk ID  | Category    | Description                                                       | Probability | Impact     | Score | Priority |
| -------- | ----------- | ----------------------------------------------------------------- | ----------- | ---------- | ----- | -------- |
| OPS-003  | Operational | Workflow step fails in CI environments without scanners installed | Medium (2)  | High (3)   | 6     | High     |
| TECH-003 | Technical   | Artifact wiring breaks downstream QA tasks expecting old paths    | Medium (2)  | Medium (2) | 4     | Medium   |
| BUS-003  | Business    | Teams skip reviewer due to unclear documentation                  | Medium (2)  | Medium (2) | 4     | Medium   |

## Mitigations

- **OPS-003:** Preflight script installs portable Semgrep/Jscpd if missing, logs install path, and provides fallback `docker run` command plus dry-run matrix to validate availability.
- **TECH-003:** Provide compatibility symlink or update QA docs referencing new artifact path, ensure workflow config toggle defaults to off, and add integration regression tests.
- **BUS-003:** Add quick-start checklist, recorded demo link, office hours in tracker, and telemetry dashboard showing runtime & false positive trends.

### Reviewer Artifact Hints

- `artifacts/reviewer/<timestamp>/report.md` — primary reviewer summary
- `artifacts/reviewer/<timestamp>/report.sarif` — SARIF for code scanning ingestion
- `artifacts/reviewer/<timestamp>/report.json` — machine-readable findings package
- `artifacts/reviewer/<timestamp>/metrics.json` — telemetry payload consumed by sync script

## Recommendations

- Must Fix: OPS-003 before merging workflow change.
- Monitor: TECH-003 via pilot rollouts.
- Educate: BUS-003 through documentation push.

## 🔬 Research & Validation Log (2025-09-24)

- **Researcher:** Dr. Evelyn Reed
- **Active Mode:** small-team
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/story-3-risk-profile.md
- **Summary:** Strengthened workflow integration mitigations with telemetry validation, config toggles, and adoption support to ensure teams can safely pilot the reviewer step.

### Findings & Actions

| Priority | Area                  | Recommended Change                                                                | Owner / Reviewer | Confidence | Mode       | Controls              | Evidence Location                      | Sources                                                                                                |
| -------- | --------------------- | --------------------------------------------------------------------------------- | ---------------- | ---------- | ---------- | --------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| High     | Operational Readiness | Add dry-run matrix + telemetry monitoring to OPS-003 mitigation.                  | DevOps / QA      | High       | small-team | ISO 25010 Reliability | .bmad-core/workflows/focused-epic.yaml | [GitHub Actions Reusable Workflows](https://docs.github.com/actions/using-workflows/reusing-workflows) |
| Medium   | Compatibility         | Document config toggle default + QA template updates under TECH-003.              | Dev / QA         | Medium     | small-team | NIST SSDF PO.3        | docs/bmad/reviewer/README.md           | [Semgrep OSS Deployment Guide](https://semgrep.dev/docs/getting-started/)                              |
| Medium   | Adoption              | Incorporate telemetry-driven status dashboard + training resources under BUS-003. | PM / Analyst     | Medium     | small-team | ASVS V14.2            | docs/bmad/issues/reviewer-rollout.md   | [OpenTelemetry CI Patterns](https://opentelemetry.io/docs/ci/metrics/)                                 |

### Tooling Guidance

- **FOSS-first Recommendation:** Use GitHub Actions and `opentelemetry-js` exporter to surface runtime metrics without paid services.
- **Paid Option (if required):** None required; optional Datadog integration documented as future enhancement.
- **Automation / Scripts:** Add `npm run reviewer:telemetry-sync` job to append metrics to rollout tracker post-workflow run.

### Risk & Compliance Notes

- **Residual Risks:** Air-gapped runners may still miss Semgrep install (Medium); require preflight doc for offline packages.
- **Compliance / Control Mapping:** Aligns with ASVS automation guidelines and NIST SSDF deployment controls.
- **Monitoring / Observability:** Telemetry dashboard updated per run; escalate anomalies via PM channel.
- **Rollback / Contingency:** Use config toggle to disable reviewer step; revert docs/tracker updates with documented procedure.

### Follow-Up Tasks

- [ ] Publish reviewer telemetry dashboard template in docs/bmad/reviewer/ — Owner: PM, Due: 2025-09-29
- [ ] Record quick-start loom/video link for adoption section — Owner: Analyst, Due: 2025-09-30

### Source Appendix

1. GitHub Actions Reusable Workflows — GitHub (Accessed 2025-09-24)
2. Semgrep OSS Deployment Guide — r2c (Accessed 2025-09-24)
3. OpenTelemetry CI Patterns — CNCF (Accessed 2025-09-24)
