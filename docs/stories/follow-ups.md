# Story Follow-ups

## Open Items

- **Stub Search/Fetch Tools (Story 1.2)** — Track implementation of lightweight `search` and `fetch` tools for ChatGPT compatibility. Owner: James (dev). Target: 2025-09-30. Notes: stubs can delegate to diagnostics responses, ensure manifest listings and smoke coverage.
- **Developer Mode Staging Smoke (Story 1.3)** — Schedule and execute full ChatGPT Developer Mode connector smoke in staging using the updated runbook. Owner: Quinn (QA). Target: 2025-10-10. Notes: follow validation playbook (`docs/oauth-keycloak.md`), capture headers/token evidence, log results in QA assessments.
## Closed Items

- **Align `mcp-auth-kit` Express 5 peers (Story 2.4)** — Peer range bumped to Express 5, `jose@^6.1.0` applied, workspace helper added, and Express 4 warnings removed via `npm ls`. Date closed: 2025-09-24. Owner: Sarah (PO).
- **Bridge Observability Metrics (Story 3.1)** — Wrapper now tails stdout/stderr to `/var/log/bridge`, publishes `/healthz` JSON plus Prometheus metrics on port 9300, and the primary service exposes `/observability/bridge/{logs,status}` for authenticated operators. Date closed: 2025-09-25. Owner: Codex (dev).
