# Reviewer Persona Integration - Brownfield Enhancement

## Epic Goal

Deliver a workflow-ready reviewer persona that augments BMAD with free static checks, duplication discovery, and LLM-backed analysis so focused epics surface hidden risks before PR review.

## Epic Description

**Existing System Context**

- Current functionality: BMAD workflows stop at manual development handoff; reviewer quality depends on external PR bots.
- Technology stack: Node.js tooling, YAML-driven workflows, Markdown documentation.
- Integration points: `.bmad-core/workflows/focused-epic.yaml`, `bmad-core/core-config.yaml`, `tools/` helper scripts, docs under `docs/`.

**Enhancement Details**

- Add free tooling (Semgrep, Jscpd, git churn script) feeding the reviewer persona.
- Implement a lightweight reviewer agent that consumes scan artifacts and diffs to generate actionable findings.
- Wire the reviewer task into the focused-epic workflow immediately after development, producing Markdown + SARIF outputs.
- Document rollout steps and tracking to monitor adoption across projects.

**Success Criteria**

- Review pipeline runs locally via BMAD without paid services.
- Findings cover duplication, risky diffs, missing tests, and security warnings currently missed.
- Workflow integration adds <5 minutes to typical runs and is skippable for trivial changes.
- Documentation enables teams to adopt and track the reviewer.

## Stories

1. **Story 1 (Done — 2025-09-24):** Establish free scanner baseline (Semgrep, Jscpd, churn script) with cached outputs.
2. **Story 2 (Done — 2025-09-24):** Implement reviewer persona pipeline that merges scan data and generates scored findings.
3. **Story 3 (Done — 2025-09-25):** Integrate reviewer step into focused-epic workflow, docs, and tracking.

## Compatibility Requirements

- [ ] Existing BMAD workflows remain runnable without the reviewer (feature is opt-in).
- [ ] No paid tooling introduced; Semgrep/Jscpd configs stored in repo.
- [ ] Scripts adhere to current Node.js + bash runtime patterns.
- [ ] Docs follow BMAD style guides and land under `docs/bmad/`.

## Risk Mitigation

- **Primary Risk:** Reviewer step could slow workflows or mis-prioritize findings.
- **Mitigation:** Cache scan outputs, allow skip flag, include scoring rubric with manual override.
- **Rollback Plan:** Disable reviewer step via workflow toggle and remove CLI command alias.

## Definition of Done

- [x] All three stories implemented and validated.
- [x] Reviewer artifacts stored in `artifacts/reviewer/` with timestamped folders.
- [x] Focused-epic workflow updated and documented.
- [x] Adoption tracker created with owners and follow-up checklist.
- [x] QA sign-off covering risk profile + test design for each story.

## Validation Checklist

- [ ] Epic scope limited to three stories and no architectural overhaul.
- [ ] Enhancement follows existing BMAD tooling conventions.
- [ ] Integration points enumerated and manageable.
- [ ] Success criteria measurable (runtime, coverage, documentation).
- [ ] Dependencies (Semgrep CLI, Jscpd, Node.js) confirmed available under OSS licenses.

## 🔬 Research & Validation Log (2025-09-23)

- **Researcher:** Dr. Evelyn Reed (Research & Validation Specialist)
- **Active Mode:** small-team (BMAD core maintainers collaborating across Dev/QA)
- **Primary Artifact:** docs/bmad/focused-epics/reviewer-agent/epic.md
- **Summary:** Confirmed reviewer plan aligns with free, widely adopted tooling (Semgrep, Jscpd, git churn analysis) and fits BMAD’s agent/workflow architecture. Identified configuration nuances, runtime expectations, and adoption safeguards for integration into focused-epic workflow.

### Findings & Actions

| Priority | Area                 | Recommended Change                                                                                                                     | Owner / Reviewer  | Confidence | Mode       | Controls                       | Evidence Location                      | Sources                                                                                                                                                                                       |
| -------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------- | ---------- | ------------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Security Coverage    | Adopt Semgrep CLI (`--config auto` + repo overrides) in Stage 1 scans; document incremental/diff mode and dependency install guidance. | Dev / QA          | High       | small-team | OWASP ASVS V14.2 (secure SDLC) | docs/bmad/reviewer/README.md           | [Semgrep Docs](https://docs.semgrep.dev/docs/getting-started/)citeturn0search1, [CISA Playbook](https://www.cisa.gov/resources-tools/resources/secure-by-design-manual)citeturn0search9 |
| High     | Maintainability      | Integrate Jscpd duplication detection at 60% threshold, reuse ignore patterns, and cache reports for reviewer prompt.                  | Dev / QA          | Medium     | small-team | ISO 25010 Maintainability      | docs/bmad/reviewer/README.md           | [Jscpd Docs](https://jscpd.dev/docs/)citeturn0search3, [Jscpd Overview](https://dev.to/kucherenko/finding-copy-paste-code-with-jscpd-3nak)citeturn1search0                              |
| Medium   | Risk Hotspots        | Generate git churn metadata (`git log --since=30.days --stat`) to prioritize reviewer findings and tune skip thresholds.               | Dev / QA          | Medium     | small-team | Team Process Controls          | artifacts/reviewer/<ts>/churn.json     | [Code Hotspots Guide](https://www.timdeschryver.dev/blog/code-hotspots-with-git-and-nrwl)citeturn1search1                                                                                  |
| Medium   | Workflow Integration | Align focused-epic workflow and core-config toggle with reviewer step, following BMAD agent orchestration patterns.                    | PM / Orchestrator | High       | small-team | Process Governance             | .bmad-core/workflows/focused-epic.yaml | [BMAD Core Architecture](../../core-architecture.md)                                                                                                                                          |

### Tooling Guidance

- **FOSS-first Recommendation:** Use Semgrep OSS CLI and Jscpd via `npx`; provide optional Docker commands for air-gapped CI.
- **Paid Option (if required):** None required; note Semgrep Pro as optional upgrade only if enterprise policies demand managed SaaS.
- **Automation / Scripts:** `tools/reviewer/preflight.sh` to verify binaries; `node tools/reviewer/collect-scans.js` orchestrates Semgrep/Jscpd; `node tools/reviewer/run.js --strict` generates reviewer report.

### Risk & Compliance Notes

- **Residual Risks:** Potential false positives (Medium) until ignore rules calibrated; runtime spikes on very large repos (Low) mitigated via diff mode; dependency installation drift (Low) addressed by documenting pinned versions.
- **Compliance / Control Mapping:** Supports ASVS V14 (Secure SDLC) and ISO 25010 maintainability metrics by enforcing automated scanning and duplication limits.
- **Monitoring / Observability:** Capture runtime + findings counts in `docs/bmad/issues/reviewer-rollout.md`; consider CI telemetry dashboards in future iteration.
- **Rollback / Contingency:** Disable reviewer step via workflow toggle; remove Semgrep/Jscpd commands while leaving docs intact; fallback to manual review.

### Follow-Up Tasks

- [ ] Finalize Semgrep/Jscpd ignore lists and diff-only configuration — Owner: Dev, Due: 2025-09-30
- [ ] Pilot churn-weighted reviewer scoring on BMAD repo and record metrics — Owner: QA, Due: 2025-10-07
- [ ] Review runtime + false-positive data after first pilot (project-alpha) — Owner: PM, Due: 2025-10-14

### Source Appendix

1. Semgrep Documentation — r2c (Accessed 2025-09-23)citeturn0search1
2. Secure by Design Manual — CISA (Accessed 2025-09-23)citeturn0search9
3. Jscpd Documentation — OSS Maintainers (Accessed 2025-09-23)citeturn0search3
4. Finding Copy-Paste Code with Jscpd — Dev.to (Accessed 2025-09-23)citeturn1search0
5. Code Hotspots with Git and Nx — Tim Deschryver (Accessed 2025-09-23)citeturn1search1
