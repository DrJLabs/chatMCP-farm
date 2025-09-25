# Reviewer Telemetry Thresholds

## Summary

Capture decision-ready telemetry thresholds to determine when the reviewer persona can run in strict mode by default. The current story leaves these values unspecified to unblock development.

## Desired Outcomes

- Define runtime targets (median and P95) required before enabling strict mode globally.
- Establish acceptable false-positive ceiling and review SLA for dismissed findings.
- Document the approval checklist and owners needed to flip `reviewer.strict` to `true` in `.bmad-core/core-config.yaml`.

## Proposed Thresholds (2025-09-24)

| Metric                 | Target               | Measurement Window                             | Rationale                                                                                                                                                                        |
| ---------------------- | -------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime (median)       | ≤ 60 seconds         | Rolling 10 reviewer runs                       | Thoughtworks guidance keeps CI stages under five minutes and flags steps exceeding ~100 seconds; a 60s median keeps reviewer comfortably inside that budget.[^thoughtworks-fast] |
| Runtime (P95)          | ≤ 180 seconds        | Rolling 20 reviewer runs                       | Extreme Programming "ten-minute build" practice limits feedback loops; a 180s P95 leaves ample headroom for the rest of the pipeline.[^ten-minute-build]                         |
| False-positive rate    | ≤ 10%                | Monthly aggregate of triaged reviewer findings | Synopsys summarizes industry literature targeting 10–20% tolerances; holding reviewer to 10% maintains trust in strict mode.[^synopsys-fp]                                       |
| High severity response | ≤ 24 hours to triage | Rolling 30-day median                          | Ensures reviewer findings feed QA gate quickly enough to sustain strict mode.                                                                                                    |

### Operational Notes

- Recompute runtime metrics via `npm run reviewer:telemetry-sync` and export P50/P95 percentiles into the rollout tracker.
- False-positive rate is calculated as `dismissed findings / total findings` over the review period; outliers should trigger a retro with QA + Dev owners.
- Add a story-level checkbox once the strict-mode toggle reaches these thresholds for two consecutive review periods.

## Dependencies

- Metrics appended via `npm run reviewer:telemetry-sync` in Story 1.3.
- QA gate evidence referencing reviewer artifacts.
- Rollout tracker strict-mode governance checklist.

## Next Steps

1. Review telemetry generated during Story 1.3 pilot runs against the above thresholds.
2. Benchmark two additional repositories to validate runtime variance before enabling strict mode globally.
3. Update `docs/bmad/issues/reviewer-rollout.md` strict-mode checklist with agreed values.

## References

[^thoughtworks-fast]: James Shore, "Keep the Build Fast" (accessed 2025-09-24), <https://www.jamesshore.com/v2/blog/2021/continuous-delivery/keep-the-build-fast/>.

[^ten-minute-build]: James Shore, "Continuous Integration: The Ten-Minute Build" (accessed 2025-09-24), <https://www.jamesshore.com/v2/blog/2006/continuous-integration-the-ten-minute-build/>.

[^synopsys-fp]: Synopsys Software Integrity Group, "How to Mitigate False Positives in SAST" (accessed 2025-09-24), <https://www.synopsys.com/blogs/software-security/static-analysis-false-positive-rate/>.
