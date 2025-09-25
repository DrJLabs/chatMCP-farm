# Reviewer Persona Rollout Tracker

## Summary

We are piloting the reviewer persona focused epic to ensure BMAD workflows surface critical findings without paid tools. This tracker captures adoption status, runtime metrics, and feedback for each pilot repository.

## Owners

- **Epic Lead:** DrJ (Product/Dev)
- **Implementation:** Codex Dev Agent
- **QA Oversight:** Quinn
- **Documentation:** Analyst + PM agents

## Milestones

| Milestone | Description                                    | Target Date | Status   |
| --------- | ---------------------------------------------- | ----------- | -------- |
| M1        | Complete Story 1 (scanner baseline)            | 2025-09-30  | Complete |
| M2        | Complete Story 2 (reviewer pipeline)           | 2025-10-07  | Complete |
| M3        | Complete Story 3 (workflow integration & docs) | 2025-10-14  | Pending  |

## Pilot Repositories

| Repository      | Owner | Reviewer Enabled   | Runtime (avg) | False Positive Rate | Notes                                                                                                                |
| --------------- | ----- | ------------------ | ------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `BMAD`          | DrJ   | Pilot (manual run) | 33s           | 0 findings          | QA Gate PASS. Reviewer persona pipeline merged; telemetry auto-sync enabled (`artifacts/reviewer/20250924T221637Z`). |
| `project-alpha` | TBD   | Pending selection  | —             | —                   | Identify after Story 2                                                                                               |
| `project-beta`  | TBD   | Pending selection  | —             | —                   | Identify after Story 3                                                                                               |

## Metrics to Capture

- Execution runtime (median, P95)
- Number of findings by category (Security, Stability, Maintainability, Tests)
- Percentage of findings accepted vs dismissed
- Cache hit rate (Stage 1 scans)

## Telemetry Runs (auto-updated)

| run_id                | repo            | mode    | runtime_s | high_findings | false_positive_rate | report_link                                                           |
| --------------------- | --------------- | ------- | --------- | ------------- | ------------------- | --------------------------------------------------------------------- |
| local-20250925T040122 | DrJLabs/bmad-bp | default | 25.18     | 0             | 0.00                | https://github.com/DrJLabs/bmad-bp/actions/runs/local-20250925T040122 |
| 17993801430           | DrJLabs/bmad-bp | strict  | 14.42     | 0             | 0.00                | artifacts/reviewer/20250925T010832Z/metrics.json                      |
| 17993801430           | DrJLabs/bmad-bp | default | 14.14     | 0             | 0.00                | artifacts/reviewer/20250925T010849Z/metrics.json                      |
| 20250924T231715Z      | BMAD            | default | 23.01     | 0             | 0.00                | artifacts/reviewer/20250924T231715Z/metrics.json                      |
| 20250924T231519Z      | BMAD            | default | 25.20     | 0             | 0.00                | artifacts/reviewer/20250924T231519Z/metrics.json                      |

> Populated by `npm run reviewer:telemetry-sync -- --metrics <path-or-dir>` (tracker path defaults to `.bmad-core/core-config.yaml` `reviewer.telemetryTracker`).

## Strict-Mode Governance Checklist

- [ ] Runtime median ≤ 60s across last 10 runs
- [ ] False-positive rate ≤ 10%
- [ ] All high severity findings triaged within 24h
- [ ] QA gate references reviewer artifacts in latest story
- [ ] Rollback plan reviewed and acknowledged by PO + QA agents

> Reference: `docs/bmad/issues/reviewer-telemetry-thresholds.md` for rationale, metrics windows, and supporting citations.

## Automation Notes

- Telemetry sync script appends to the "Telemetry Runs" table using JSON emissions from `metrics.json`.
- Reports stored under `artifacts/reviewer/<timestamp>/` should surface at least `report.md`, `report.sarif`, `report.json`, and `metrics.json`.
- GitHub Actions contexts (`GITHUB_RUN_ID`, `GITHUB_REPOSITORY`, `matrix.mode`) feed repo/run metadata for the table entry.

## Rollback Procedure

1. Set `reviewer.enabled: false` (and optionally `reviewer.strict: false`) in `.bmad-core/core-config.yaml`.
2. Comment out the reviewer stage block in `.bmad-core/workflows/focused-epic.yaml` while leaving instructions for future reinstatement.
3. Remove reviewer artifact upload steps from CI jobs; retain previously generated artifacts for audit.
4. Record the rollback decision and justification in the strict-mode checklist above.

## Risk & Mitigation Log

| Date       | Risk ID | Description                                   | Owner | Mitigation Status                  |
| ---------- | ------- | --------------------------------------------- | ----- | ---------------------------------- |
| 2025-09-23 | OPS-003 | CI environments missing Semgrep/Jscpd         | Dev   | Mitigated (preflight + GA install) |
| 2025-09-23 | BUS-002 | Strict mode false positives may block deploys | QA    | Pending                            |

## Next Steps

1. Update focused-epic workflow and docs (Story 3 deliverable).
2. Pilot reviewer step with strict-mode governance checklist.
3. Record pilot metrics and adjust thresholds before general availability.
4. Evaluate false positives with PM/QA review after first pilot repository.

## Communication Plan

- Weekly async update in BMAD status channel referencing this tracker.
- Review findings with QA agent during Story 3 completion.
- Escalate blockers to BMAD Orchestrator if milestones slip by >2 days.
