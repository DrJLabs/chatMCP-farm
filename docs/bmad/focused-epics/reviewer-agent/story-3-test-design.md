# Test Design: Story 1.3 (Integrate Reviewer Into Focused-Epic Workflow)

Date: 2025-09-23
Designer: Quinn (Test Architect)

## Test Strategy Overview

- Total test scenarios: 7
- Unit tests: 0 (0%)
- Integration tests: 6 (86%)
- E2E tests: 1 (14%)
- Priority distribution: P0: 3, P1: 3, P2: 1

## Reviewer Artifact Hints

- Markdown summary: `artifacts/reviewer/<timestamp>/report.md`
- SARIF export: `artifacts/reviewer/<timestamp>/report.sarif`
- JSON package: `artifacts/reviewer/<timestamp>/report.json`
- Telemetry metrics: `artifacts/reviewer/<timestamp>/metrics.json`
- Sync evidence: `docs/bmad/issues/reviewer-rollout.md` → “Telemetry Runs” table

## Test Scenarios by Acceptance Criteria

### AC1: Workflow update

| ID          | Level       | Priority | Test                                                                                              | Justification           |
| ----------- | ----------- | -------- | ------------------------------------------------------------------------------------------------- | ----------------------- |
| 3.1-INT-001 | Integration | P0       | Run focused-epic workflow in dry-run mode ensuring reviewer step executes after dev               | Validates ordering      |
| 3.1-INT-002 | Integration | P1       | Execute workflow with skip flag to verify conditional bypass                                      | Ensures optionality     |
| 3.1-INT-003 | Integration | P0       | Execute workflow with telemetry enabled and confirm reviewer metrics persisted to rollout tracker | Validates observability |

### AC2: Documentation + tracker

| ID          | Level       | Priority | Test                                                                                        | Justification              |
| ----------- | ----------- | -------- | ------------------------------------------------------------------------------------------- | -------------------------- |
| 3.2-INT-003 | Integration | P2       | Lint docs to ensure links resolve (markdown-link-check)                                     | Prevents broken references |
| 3.2-INT-004 | Integration | P1       | Verify reviewer README includes quick-start checklist, rollback steps, and dependency table | Ensures adoption clarity   |

### AC3: Tracking issue doc

| ID          | Level       | Priority | Test                                                                         | Justification             |
| ----------- | ----------- | -------- | ---------------------------------------------------------------------------- | ------------------------- |
| 3.3-INT-004 | Integration | P1       | Validate tracker table renders correctly and includes owners                 | Enables adoption tracking |
| 3.3-INT-005 | Integration | P1       | Confirm rollout tracker strict-mode checklist populated with gating criteria | Supports governance       |

### AC4-6: Artifact wiring

| ID          | Level       | Priority | Test                                                                                               | Justification                      |
| ----------- | ----------- | -------- | -------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 3.4-E2E-001 | E2E         | P0       | Execute workflow end-to-end on sample repo verifying QA tasks read reviewer artifacts              | Ensures compatibility              |
| 3.4-INT-002 | Integration | P1       | Toggle reviewer config in `core-config.yaml` to off and ensure workflow step is skipped gracefully | Validates rollback                 |
| 3.4-INT-003 | Integration | P2       | Run dry-run matrix job verifying artifacts only uploaded in strict mode runs                       | Confirms optional matrix behaviour |

## Risk Coverage

- OPS-003 mitigated by 3.1-INT-001, 3.1-INT-003, and 3.4-E2E-001 validating reviewer execution + telemetry.
- TECH-003 mitigated by 3.4-E2E-001 and 3.4-INT-002 verifying artifact paths and rollback toggle.
- BUS-003 mitigated by 3.2-INT-003, 3.2-INT-004, and 3.3-INT-005 ensuring documentation + governance clarity.

## Recommended Execution Order

1. 3.2-INT-003
2. 3.2-INT-004
3. 3.3-INT-004
4. 3.3-INT-005
5. 3.1-INT-001
6. 3.1-INT-002
7. 3.1-INT-003
8. 3.4-INT-002
9. 3.4-INT-003
10. 3.4-E2E-001

## Gate Summary Block

```yaml
test_design:
  scenarios_total: 7
  by_level:
    unit: 0
    integration: 6
    e2e: 1
  by_priority:
    p0: 3
    p1: 3
    p2: 1
  coverage_gaps: []
```

## 🔬 Research & Validation Log (2025-09-24)

- **Researcher:** Dr. Evelyn Reed
- **Active Mode:** small-team
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/story-3-test-design.md
- **Summary:** Expanded workflow integration tests to cover telemetry capture, documentation updates, config toggles, and dry-run matrix behaviour necessary for smooth team adoption.

### Findings & Actions

| Priority | Area          | Recommended Change                                                             | Owner / Reviewer | Confidence | Mode       | Controls              | Evidence Location                          | Sources                                                                                                |
| -------- | ------------- | ------------------------------------------------------------------------------ | ---------------- | ---------- | ---------- | --------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| High     | Observability | Add telemetry persistence test (3.1-INT-003) and rollout tracker verification. | QA / PM          | High       | small-team | ISO 25010 Reliability | tests/workflows/reviewer-telemetry.test.ts | [OpenTelemetry CI Patterns](https://opentelemetry.io/docs/ci/metrics/)                                 |
| High     | Documentation | Verify README quick-start + rollback instructions (3.2-INT-004).               | Analyst / QA     | High       | small-team | ASVS V14.2            | docs/bmad/reviewer/README.md               | [Semgrep OSS Deployment Guide](https://semgrep.dev/docs/getting-started/)                              |
| Medium   | Governance    | Ensure strict-mode checklist present in rollout tracker (3.3-INT-005).         | PM / QA          | Medium     | small-team | NIST SSDF PO.3        | docs/bmad/issues/reviewer-rollout.md       | [GitHub Actions Reusable Workflows](https://docs.github.com/actions/using-workflows/reusing-workflows) |

### Tooling Guidance

- **FOSS-first Recommendation:** Use `act` or reusable workflow tests to simulate focused-epic runs locally.
- **Paid Option (if required):** None; remain on OSS GitHub Actions tooling.
- **Automation / Scripts:** Add `npm run reviewer:workflow-test` to execute new integration checks with a fixture repo.

### Risk & Compliance Notes

- **Residual Risks:** Workflow matrix may extend runtime (Low); monitor via telemetry.
- **Compliance / Control Mapping:** Supports ASVS automation requirements and NIST SSDF release governance.
- **Monitoring / Observability:** Telemetry tests ensure metrics feed into rollout tracker and dashboards.
- **Rollback / Contingency:** Validate config toggle test (3.4-INT-002) before enabling reviewer by default; document reversion steps.

### Follow-Up Tasks

- [ ] Create fixture repo snapshot for workflow integration tests — Owner: DevOps, Due: 2025-09-28
- [ ] Automate markdown quick-start lint in CI — Owner: Analyst, Due: 2025-09-29

### Source Appendix

1. OpenTelemetry CI Patterns — CNCF (Accessed 2025-09-24)
2. Semgrep OSS Deployment Guide — r2c (Accessed 2025-09-24)
3. GitHub Actions Reusable Workflows — GitHub (Accessed 2025-09-24)
