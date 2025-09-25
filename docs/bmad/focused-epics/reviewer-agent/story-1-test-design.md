# Test Design: Story 1.1 (Establish Free Scanner Baseline)

Date: 2025-09-23
Designer: Quinn (Test Architect)

## Test Strategy Overview

- Total test scenarios: 7
- Unit tests: 1 (14%)
- Integration tests: 5 (72%)
- E2E tests: 1 (14%)
- Priority distribution: P0: 3, P1: 3, P2: 1

## Test Scenarios by Acceptance Criteria

### AC1: Preflight script prepares environment

| ID           | Level | Priority | Test                                                           | Justification                                  |
| ------------ | ----- | -------- | -------------------------------------------------------------- | ---------------------------------------------- |
| 1.1-UNIT-001 | Unit  | P1       | Validate preflight script builds directories and exits cleanly | Pure bash function/unit logic via bats wrapper |

### AC2: Scan collection script wraps Semgrep & Jscpd

| ID          | Level       | Priority | Test                                                                                          | Justification                         |
| ----------- | ----------- | -------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1.2-INT-001 | Integration | P0       | Execute `collect-scans.js` against sample repo and assert JSON outputs exist                  | Validates child process orchestration |
| 1.2-INT-002 | Integration | P1       | Simulate Semgrep failure to ensure descriptive error bubble-up                                | Ensures resiliency                    |
| 1.2-INT-003 | Integration | P0       | Run Semgrep with `--baseline` flag and verify diff coverage + CLI version recorded in metrics | Confirms diff-only enforcement        |

### AC3: Churn metadata generation

| ID          | Level       | Priority | Test                                                               | Justification                |
| ----------- | ----------- | -------- | ------------------------------------------------------------------ | ---------------------------- |
| 1.3-INT-003 | Integration | P0       | Run churn collector on staged diff ensuring touched files captured | Protects reviewer heuristics |

### AC4-6: Integration + Quality requirements

| ID          | Level       | Priority | Test                                                                                               | Justification              |
| ----------- | ----------- | -------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| 1.4-E2E-001 | E2E         | P0       | Execute npm alias to run entire scan pipeline and verify artifacts in cache + timestamp dir        | Validates end-to-end path  |
| 1.5-INT-004 | Integration | P2       | Verify config files parsed and allow overrides                                                     | Prevents false positives   |
| 1.5-INT-005 | Integration | P1       | Override Semgrep binary via `SEMgrep_BIN` env and ensure preflight respects custom path            | Enables air-gapped support |
| 1.5-INT-006 | Integration | P1       | Validate `.bmad-cache/reviewer/{git_sha}` directory naming and prune entries older than seven days | Prevents cache collisions  |

## Risk Coverage

- TECH-001 mitigated by 1.2-INT-001, 1.2-INT-003, and 1.4-E2E-001 (runtime measurement assertions).
- OPS-001 mitigated by 1.4-E2E-001 and 1.5-INT-006 (unique artifact path + pruning check).
- BUS-001 mitigated by 1.5-INT-004 (ignore list verification) and metrics validation in 1.2-INT-003.
- Operational resilience addition: 1.5-INT-005 covers air-gapped overrides.

## Recommended Execution Order

1. 1.1-UNIT-001
2. 1.2-INT-002
3. 1.2-INT-001
4. 1.2-INT-003
5. 1.3-INT-003
6. 1.5-INT-004
7. 1.5-INT-005
8. 1.5-INT-006
9. 1.4-E2E-001

## Gate Summary Block

```yaml
test_design:
  scenarios_total: 7
  by_level:
    unit: 1
    integration: 5
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
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/story-1-test-design.md
- **Summary:** Enriched test design to assert diff-mode enforcement, cache hygiene, and offline overrides so small teams can rely on deterministic reviewer telemetry without manual triage.

### Findings & Actions

| Priority | Area                   | Recommended Change                                                         | Owner / Reviewer | Confidence | Mode       | Controls              | Evidence Location                  | Sources                                                                                                                             |
| -------- | ---------------------- | -------------------------------------------------------------------------- | ---------------- | ---------- | ---------- | --------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| High     | Testing Depth          | Add integration checks for `--baseline` runtime + metrics validation.      | QA / Dev         | High       | small-team | ASVS V14.3            | tests/reviewer/baseline.test.ts    | [Semgrep CLI Reference](https://semgrep.dev/docs/cli-reference/scan/)                                                               |
| Medium   | Operational Resilience | Ensure env override + cache pruning scenarios covered in integration plan. | QA / DevOps      | Medium     | small-team | ISO 25010 Reliability | tests/reviewer/cache-prune.test.ts | [GitHub Actions Caching Best Practices](https://docs.github.com/actions/using-workflows/caching-dependencies-to-speed-up-workflows) |

### Tooling Guidance

- **FOSS-first Recommendation:** Use `bats-core` for bash preflight unit tests and `jest` with `nock` to simulate CLI invocations.
- **Paid Option (if required):** None; wrap Semgrep Pro runs in optional matrix when license present.
- **Automation / Scripts:** Add `npm run reviewer:test -- --group baseline` to execute the new integration suite in CI.

### Risk & Compliance Notes

- **Residual Risks:** Cache pruning relies on timestamp accuracy (Low); monitor via CI logs.
- **Compliance / Control Mapping:** Reinforces ASVS secure build automation and ISO maintainability attributes.
- **Monitoring / Observability:** Capture metrics assertions as part of CI artifacts for regression triage.
- **Rollback / Contingency:** Disable new tests via tag toggle if Semgrep CLI version lag detected; document skip in QA log.

### Follow-Up Tasks

- [x] Generate fixtures for cache pruning test with >7 day timestamps via `npm run reviewer:prune:test` — Owner: QA, Completed: 2025-09-24
- [x] Add metrics schema contract test to QA checklist (`npm run reviewer:validate`) — Owner: QA, Completed: 2025-09-24

### Source Appendix

1. Semgrep CLI Reference — r2c (Accessed 2025-09-24)
2. GitHub Actions Caching Best Practices — GitHub (Accessed 2025-09-24)
