# Test Design: Story 1.2 (Implement Reviewer Persona Pipeline)

Date: 2025-09-23
Designer: Quinn (Test Architect)

## Test Strategy Overview

- Total test scenarios: 9
- Unit tests: 3 (33%)
- Integration tests: 5 (56%)
- E2E tests: 1 (11%)
- Priority distribution: P0: 4, P1: 3, P2: 2

## Test Scenarios by Acceptance Criteria

### AC1: Reviewer agent file

| ID           | Level | Priority | Test                                                                                    | Justification       |
| ------------ | ----- | -------- | --------------------------------------------------------------------------------------- | ------------------- |
| 2.1-UNIT-001 | Unit  | P1       | Validate agent YAML contains required sections (persona, rubric, output schema)         | Static schema check |
| 2.1-UNIT-002 | Unit  | P0       | Ensure agent instructions mandate sanitization + secret masking before model invocation | Guards SEC-002      |

### AC2: Pipeline merges scan data

| ID           | Level       | Priority | Test                                                                                                     | Justification              |
| ------------ | ----------- | -------- | -------------------------------------------------------------------------------------------------------- | -------------------------- |
| 2.2-INT-001  | Integration | P0       | Execute `run.js` with sample scan payload ensuring combined prompt includes Semgrep/Jscpd/churn sections | Ensures evidence ingestion |
| 2.2-UNIT-002 | Unit        | P2       | Mock scan data absence and verify fallback message                                                       | Prevents TECH-002          |
| 2.2-INT-004  | Integration | P0       | Inject mock secrets into scan payload and assert sanitized prompt + redaction report                     | Addresses SEC-002          |

### AC3: Artifact emission

| ID          | Level       | Priority | Test                                                                                         | Justification              |
| ----------- | ----------- | -------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| 2.3-INT-002 | Integration | P0       | Run pipeline verifying Markdown + SARIF produced with tool metadata                          | Critical deliverable       |
| 2.3-INT-003 | Integration | P1       | Validate SARIF against official schema using ajv/test harness                                | Protects OPS-002           |
| 2.3-INT-004 | Integration | P1       | Validate `report.json` against internal JSON schema and ensure severity weights match rubric | Keeps telemetry consistent |

### AC4-6: CLI + flags

| ID          | Level       | Priority | Test                                                                                                      | Justification             |
| ----------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| 2.4-E2E-001 | E2E         | P0       | Execute `bmad reviewer run --strict` on fixture repo and ensure exit code reflects high severity findings | Ensures gating capability |
| 2.4-INT-002 | Integration | P1       | Run `bmad reviewer run --dry-run` and confirm artifacts not written while Markdown preview emitted        | Supports preview workflow |
| 2.4-INT-003 | Integration | P1       | Capture telemetry event (`reviewer.run`) and verify counts/exit code exported for rollout tracker         | Enables monitoring        |

## Risk Coverage

- SEC-002 mitigated via 2.1-UNIT-002 (persona instructions) and 2.2-INT-004 sanitized prompt assertions.
- TECH-002 mitigated by 2.2-UNIT-002 fallback tests and 2.3-INT-002 artifact checks.
- OPS-002 mitigated by 2.3-INT-003 SARIF validation and 2.3-INT-004 JSON schema verification.
- BUS-002 mitigated by 2.4-E2E-001 strict flag check and telemetry assertions in 2.4-INT-003.

## Recommended Execution Order

1. 2.1-UNIT-001
2. 2.1-UNIT-002
3. 2.2-UNIT-002
4. 2.2-INT-001
5. 2.2-INT-004
6. 2.3-INT-002
7. 2.3-INT-003
8. 2.3-INT-004
9. 2.4-INT-002
10. 2.4-INT-003
11. 2.4-E2E-001

## Gate Summary Block

```yaml
test_design:
  scenarios_total: 9
  by_level:
    unit: 3
    integration: 5
    e2e: 1
  by_priority:
    p0: 4
    p1: 3
    p2: 2
  coverage_gaps: []
```

## 🔬 Research & Validation Log (2025-09-24)

- **Researcher:** Dr. Evelyn Reed
- **Active Mode:** small-team
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/story-2-test-design.md
- **Summary:** Expanded reviewer pipeline test coverage to enforce sanitization, schema validation, dry-run previews, and telemetry outputs required for small-team rollouts.

### Findings & Actions

| Priority | Area          | Recommended Change                                                                  | Owner / Reviewer | Confidence | Mode       | Controls              | Evidence Location                | Sources                                                                                                                 |
| -------- | ------------- | ----------------------------------------------------------------------------------- | ---------------- | ---------- | ---------- | --------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Critical | Security      | Add tests verifying prompt sanitization + secret masking before model invocation.   | QA / Dev         | High       | small-team | OWASP LLM-01          | tests/reviewer/sanitize.test.ts  | [OWASP LLM Guidance](https://owasp.org/www-project-top-10-for-large-language-model-applications/)                       |
| High     | Observability | Validate telemetry event payload + `report.json` schema to support rollout metrics. | QA / PM          | High       | small-team | ISO 25010 Reliability | tests/reviewer/telemetry.test.ts | [GitHub Code Scanning SARIF Spec](https://docs.github.com/code-security/code-scanning/automatically-scanning-your-code) |
| Medium   | Operability   | Exercise `--dry-run` to ensure previews avoid artifact writes.                      | QA / DevOps      | Medium     | small-team | NIST SSDF PW.4        | tests/reviewer/dry-run.test.ts   | [Semgrep Supply-Chain Hardening](https://semgrep.dev/blog/semgrep-supply-chain/)                                        |

### Tooling Guidance

- **FOSS-first Recommendation:** Use `jest` with `msw` to mock agent runner responses; leverage `jsonschema` for offline schema checks.
- **Paid Option (if required):** None; maintain OSS stack.
- **Automation / Scripts:** Integrate these tests into `npm run reviewer:test` matrix with `--group pipeline` tag.

### Risk & Compliance Notes

- **Residual Risks:** Telemetry opt-out in air-gapped environments (Low) — document manual reporting fallback.
- **Compliance / Control Mapping:** Supports OWASP AI testing guidance and ISO maintainability attributes.
- **Monitoring / Observability:** Export telemetry assertions to rollout tracker; surface failing scenarios in QA dashboards.
- **Rollback / Contingency:** Toggle telemetry tests via env flag if observability backend unavailable; capture reason in QA log.

### Follow-Up Tasks

- [ ] Publish JSON schema fixtures for `report.json` in `tools/reviewer/schemas/` — Owner: Dev, Due: 2025-09-28
- [ ] Add telemetry endpoint contract tests — Owner: QA, Due: 2025-09-29

### Source Appendix

1. OWASP Top 10 for LLM Apps — OWASP (Accessed 2025-09-24)
2. GitHub Code Scanning SARIF Spec — GitHub (Accessed 2025-09-24)
3. Semgrep Supply-Chain Hardening — r2c (Accessed 2025-09-24)
