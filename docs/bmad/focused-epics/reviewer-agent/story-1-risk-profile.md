# Risk Profile: Story 1.1 (Establish Free Scanner Baseline)

Date: 2025-09-23
Reviewer: Quinn (Test Architect)

## Executive Summary

- Total Risks Identified: 3
- Critical Risks: 0
- High Risks: 1
- Risk Score: 18/100

## Risk Matrix

| Risk ID  | Category    | Description                                    | Probability | Impact     | Score | Priority |
| -------- | ----------- | ---------------------------------------------- | ----------- | ---------- | ----- | -------- |
| TECH-001 | Technical   | Semgrep CLI adds >5 min runtime on large repos | Medium (2)  | High (3)   | 6     | High     |
| OPS-001  | Operational | Cache path collisions break concurrent runs    | Low (1)     | Medium (2) | 2     | Low      |
| BUS-001  | Business    | Noisy findings discourage adoption             | Medium (2)  | Medium (2) | 4     | Medium   |

## Mitigations

- **TECH-001:** Enforce Semgrep diff (`--baseline`) with metrics capture and alert when runtime exceeds three minutes; document incremental execution.
- **OPS-001:** Use timestamped artifact folders nested under repository SHA and include PID suffix in cache directories with seven-day pruning.
- **BUS-001:** Provide default ignore sets, confidence scoring guidance, and opt-out flag with documentation for tuning severity.

## Recommendations

- Must Fix: TECH-001 (optimize runtime before rollout).
- Monitor: BUS-001 post-launch to calibrate ignores.
- Residual Risk: Low once caching and diff-only mode verified.

## 🔬 Research & Validation Log (2025-09-24)

- **Researcher:** Dr. Evelyn Reed
- **Active Mode:** small-team
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/story-1-risk-profile.md
- **Summary:** Reassessed scanner baseline risks with focus on runtime telemetry, cache hygiene, and adoption safeguards matching current Semgrep/Jscpd guidance.

### Findings & Actions

| Priority | Area               | Recommended Change                                                          | Owner / Reviewer | Confidence | Mode       | Controls                  | Evidence Location                    | Sources                                                                                                                             |
| -------- | ------------------ | --------------------------------------------------------------------------- | ---------------- | ---------- | ---------- | ------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| High     | Runtime Governance | Add explicit runtime threshold + metrics logging under TECH-001 mitigation. | Dev / QA         | High       | small-team | ASVS V14.2                | artifacts/reviewer/<ts>/metrics.json | [Semgrep CLI Reference](https://semgrep.dev/docs/cli-reference/scan/)                                                               |
| Medium   | Cache Hygiene      | Clarify seven-day pruning requirement within OPS-001 mitigation.            | DevOps / SM      | Medium     | small-team | ISO 25010 Maintainability | .bmad-cache/reviewer/                | [GitHub Actions Caching Best Practices](https://docs.github.com/actions/using-workflows/caching-dependencies-to-speed-up-workflows) |

### Tooling Guidance

- **FOSS-first Recommendation:** Continue using Semgrep OSS and `npx jscpd` with pinned versions recorded in metrics.
- **Paid Option (if required):** Semgrep Pro for managed policies; document override steps before adoption.
- **Automation / Scripts:** Add CI guard that fails when metrics runtime > five minutes or cache folder exceeds 250 MB.

### Risk & Compliance Notes

- **Residual Risks:** Long-running Semgrep on monorepos (Medium) pending additional ignore tuning; cache overrun (Low) mitigated by pruning.
- **Compliance / Control Mapping:** Aligns with OWASP ASVS secure build controls and NIST SSDF practice PW.4.
- **Monitoring / Observability:** Track runtime + cache size in `metrics.json`; surface in reviewer rollout tracker metrics section.
- **Rollback / Contingency:** Disable Semgrep diff enforcement temporarily and rely on Jscpd/churn while runtime tuning occurs; revert cache pruning script if it removes active reports.

### Follow-Up Tasks

- [x] Wire runtime threshold check into reviewer CI job (`npm run reviewer:scan` + `npm run reviewer:validate`) — Owner: Dev, Completed: 2025-09-24
- [x] Document cache pruning procedure in reviewer README — Owner: QA, Completed: 2025-09-24

### Source Appendix

1. Semgrep CLI Reference — r2c (Accessed 2025-09-24)
2. GitHub Actions Caching Best Practices — GitHub (Accessed 2025-09-24)
