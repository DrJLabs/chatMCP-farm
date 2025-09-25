# Risk Profile: Story 1.2 (Implement Reviewer Persona Pipeline)

Date: 2025-09-23
Reviewer: Quinn (Test Architect)

## Executive Summary

- Total Risks Identified: 4
- Critical Risks: 1
- High Risks: 1
- Risk Score: 28/100

## Risk Matrix

| Risk ID  | Category    | Description                                                         | Probability | Impact       | Score | Priority |
| -------- | ----------- | ------------------------------------------------------------------- | ----------- | ------------ | ----- | -------- |
| SEC-002  | Security    | LLM prompt mishandles secret scan results and leaks sensitive paths | Medium (2)  | High (3)     | 6     | High     |
| TECH-002 | Technical   | Reviewer fails when scans return empty or malformed data            | Medium (2)  | Medium (2)   | 4     | Medium   |
| OPS-002  | Operational | SARIF generation deviates from schema and breaks downstream tooling | Low (1)     | High (3)     | 3     | Low      |
| BUS-002  | Business    | False critical findings block releases when strict mode enabled     | Medium (2)  | Critical (4) | 8     | Critical |

## Mitigations

- **SEC-002:** Strip paths from prompt unless flagged safe; sanitize secrets with regex allowlist, log redaction metrics, and gate reviewer run on successful sanitization report.
- **TECH-002:** Add schema validation, fallback narrative when data missing, and unit tests covering empty artifact scenarios.
- **OPS-002:** Use SARIF v2 schema with JSONSchema validation in CI and validate `report.json` using shared schema.
- **BUS-002:** Require confidence scoring, remediation guidance, human override instructions, telemetry reporting, and default strict mode off until adoption metrics stabilize.

## Recommendations

- Must Fix: BUS-002 prior to rollout.
- Must Fix: SEC-002 to avoid leaking sensitive info.
- Monitor: TECH-002 via unit tests.
- Residual Risk: Acceptable once validation + override controls in place.

## 🔬 Research & Validation Log (2025-09-24)

- **Researcher:** Dr. Evelyn Reed
- **Active Mode:** small-team
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/story-2-risk-profile.md
- **Summary:** Reaffirmed security and observability mitigations for reviewer persona pipeline, adding sanitization gating, telemetry requirements, and schema validation for rollout readiness.

### Findings & Actions

| Priority | Area          | Recommended Change                                                                   | Owner / Reviewer | Confidence | Mode       | Controls              | Evidence Location                    | Sources                                                                                                                 |
| -------- | ------------- | ------------------------------------------------------------------------------------ | ---------------- | ---------- | ---------- | --------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Critical | Security      | Enforce sanitization report success before reviewer invocation (SEC-002 mitigation). | Dev / QA         | High       | small-team | OWASP LLM-01          | tools/reviewer/run.js                | [OWASP LLM Guidance](https://owasp.org/www-project-top-10-for-large-language-model-applications/)                       |
| High     | Observability | Capture telemetry + JSON schema validation under OPS-002/BUS-002 mitigations.        | DevOps / PM      | High       | small-team | ISO 25010 Reliability | artifacts/reviewer/<ts>/report.json  | [GitHub Code Scanning SARIF Spec](https://docs.github.com/code-security/code-scanning/automatically-scanning-your-code) |
| Medium   | Governance    | Document strict-mode rollout criteria and fallback in BUS-002 mitigation.            | PM / QA          | Medium     | small-team | NIST SSDF PW.4        | docs/bmad/issues/reviewer-rollout.md | [Semgrep Supply-Chain Hardening](https://semgrep.dev/blog/semgrep-supply-chain/)                                        |

### Tooling Guidance

- **FOSS-first Recommendation:** Use `jsonschema` + `ajv` for validation and `gitleaks` patterns to augment sanitization detection.
- **Paid Option (if required):** None required; maintain OSS stack.
- **Automation / Scripts:** Add CI guard `npm run reviewer:validate -- --check-sanitization` failing on redaction misses.

### Risk & Compliance Notes

- **Residual Risks:** Residual false positives in strict mode (Medium) — monitor adoption metrics, adjust confidence threshold.
- **Compliance / Control Mapping:** Supports OWASP ASVS V14, OWASP LLM guidance, and NIST SSDF secure build practices.
- **Monitoring / Observability:** Telemetry events stored in reviewer rollout tracker and optional OpenTelemetry sink.
- **Rollback / Contingency:** Disable reviewer mapping or strict mode flag if telemetry indicates elevated false positives; revert sanitization gating if blocking legitimate findings (with documented exception).

### Follow-Up Tasks

- [ ] Implement sanitization success gate in `tools/reviewer/run.js` — Owner: Dev, Due: 2025-09-27
- [ ] Define strict-mode enablement checklist in rollout tracker — Owner: PM, Due: 2025-09-29

### Source Appendix

1. OWASP Top 10 for LLM Apps — OWASP (Accessed 2025-09-24)
2. GitHub Code Scanning SARIF Spec — GitHub (Accessed 2025-09-24)
3. Semgrep Supply-Chain Hardening — r2c (Accessed 2025-09-24)
