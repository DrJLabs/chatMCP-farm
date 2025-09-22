# Chat MCP Farm Product Requirements Document (PRD)

**Version:** 0.1.1  
**Last Updated:** September 20, 2025  
**Document Owner:** Codex Planning Team  
**Status:** Draft (Initial)

---

## 1. Goals and Background Context

### 1.1 Goals
- Deliver a standalone workspace for Model Context Protocol (MCP) services that share Keycloak-backed OAuth plumbing.
- Provide a reusable authentication kit so new MCP services inherit secure defaults without duplicating code.
- Supply automation, documentation, and templates that make creating a new MCP service a repeatable, day-one task.
- Maintain high signal documentation (bootstrap checklist, OAuth guide, service playbooks) that stays local to this repository.
- Ensure every MCP service can be validated locally (docker-compose + smoke tests) before shipping.

### 1.2 Background Context
The `chat-mcp-farm` repository was split from a larger monorepo to focus on hosting OAuth-protected MCP services. Today it contains the MCP test server, a TypeScript package (`mcp-auth-kit`) that hides Keycloak/OIDC boilerplate, and automation scripts for provisioning scopes and trusted hosts in the shared `OMA` Keycloak realm. The test server is the first MCP we validated end to end; the project goal is to make it easy to add and operate many independent MCP services. The near-term goal is to harden the workspace so additional MCP services can be bootstrapped with consistent tooling, documentation, and release standards.

### 1.3 Change Log
| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2025-09-20 | 0.1.1 | Captured updated automation doc coverage and documentation backlog | Codex |
| 2025-09-19 | 0.1.0 | Initial PRD drafted for standalone MCP workspace | Codex |

---

## 2. Requirements

### 2.1 Functional Requirements
- **FR1:** Provide a monorepo workspace that builds, lints, and tests each MCP package/service via root npm scripts.
- **FR2:** Expose a reusable `mcp-auth-kit` package that encapsulates Keycloak integration (manifest, PRM handler, auth guard, origin/CORS enforcement).
- **FR3:** Maintain the MCP test server as the reference implementation (Streamable HTTP transport with optional SSE fallback) while ensuring the farm structure supports additional, unrelated MCP services.
- **FR4:** Deliver bootstrap assets (docker-compose snippets, service template, scripts) that provision a new MCP service with working OAuth wiring in <10 minutes.
- **FR5:** Publish operator documentation (bootstrap checklist, OAuth guide, migration plan) that stays synchronized with automation scripts.
- **FR6:** Provide Keycloak automation helpers that register MCP audiences, trusted hosts, and status checks using `kcadm`.
- **FR7:** Capture structured debug endpoints (health, config, OIDC diagnostics) for every MCP service.

### 2.2 Non-Functional Requirements
- **NFR1:** All services run on Node.js 24.x (current release with October 2025 LTS promotion planned) with ESM modules and TypeScript 5+ transpilation.
- **NFR2:** OAuth enforcement must default to enabled; disabling it requires explicit environment configuration and is only allowed in local development.
- **NFR3:** Root `npm run lint|test|build` must complete within 5 minutes on a standard developer machine.
- **NFR4:** Logging must include request identifiers, remote IP, OAuth status, and MCP session identifiers to aid incident response.
- **NFR5:** Documentation must be versioned within the repo and updated alongside code changes (change log entries per revision).
- **NFR6:** New services must ship with smoke tests runnable via `npm run test` and tied into CI before release.
- **NFR7:** Secrets (Keycloak credentials, service tokens) may only be supplied via `.env` / `.keycloak-env` templates; no secrets in source control.

---

## 3. Technical Assumptions
- **Languages & Runtime:** TypeScript targeting Node.js 24.x (pre-LTS with October 2025 promotion expected); ESM output with strict typing, TSConfig shared via `tsconfig.base.json`.
- **Frameworks & Libraries:** Express 4 for HTTP handling, `@modelcontextprotocol/sdk` for MCP transports, `zod` for tool schema validation, `morgan` for logging.
- **Package Manager:** npm workspaces (monorepo). pnpm/Nx considered later if performance requires.
- **Repository Structure:** Monorepo containing `packages/` for shared libs, `services/` for deployable MCP servers, `templates/` for scaffolding, `scripts/` for automation, `docs/` for operator guides.
- **Deployment:** Containerized via Docker images orchestrated behind Traefik/Cloudflare, authenticated through shared Keycloak realm (`OMA`).
- **Environments:** Local (docker-compose), staging (internal cluster), production (Cloudflare-protected). All require network access to Keycloak and any downstream systems exercised by the MCP services.
- **Observability Stack:** Structured logs shipped to centralized aggregator; optional metrics via Prometheus sidecar TBD.

---

## 4. Domain Concepts & Data Sources
- **Downstream APIs:** Each service defines its own downstream integration surface. The current MCP test server focuses on deterministic diagnostics rather than external data sources.
- **Keycloak (OMA Realm):** OAuth Authorization Server that issues access tokens containing MCP-specific audiences. Trusted hosts enforce inbound origin rules.
- **MCP Client:** ChatGPT Developer Mode connector or other MCP-compatible clients requiring manifest and PRM endpoints plus Streamable HTTP transport (SSE fallback only when a client explicitly requires it).
- **Auth Kit Config:** Consolidated TypeScript config struct bridging env vars to runtime (`MCP_PUBLIC_BASE_URL`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, etc.).

---

## 5. APIs & Tooling Surface
- **Service Endpoints:**
  - `/.well-known/mcp/manifest.json` – manifest discovery (requires origin logging).
  - `/.well-known/oauth-protected-resource` – PRM endpoint for OAuth metadata.
  - `/mcp` – Streamable HTTP transport (POST) guarded by OAuth bearer tokens.
  - `/sse` & `/mcp/sse` – Legacy SSE fallback routes, enabled only when a client cannot consume Streamable HTTP.
  - `/debug/config`, `/debug/oidc` – diagnostics for issuers, JWKS, and config.
  - `/healthz` – readiness probe.
- **MCP Tools:** `ping`, `search`, `fetch`, `write`, `om.search`, `om.add`.
- **CLI/Automation:** `scripts/kc/*.sh` manage Keycloak scopes, trusted hosts, and status; `scripts/bootstrap.sh` scaffolds services from templates; `scripts/compose.sh` aggregates per-service docker configurations; `scripts/render-docs.mjs` renders configuration-aware docs.

---

## 6. Integrations & Dependencies
- **Keycloak Admin CLI (`kcadm`):** Used by automation scripts; containerized via docker-compose.
- **Downstream Harness:** Provide service-specific environment variables documenting required external systems or test harness configuration.
- **ChatGPT Developer Accounts:** Consumer of MCP manifest; needs Trusted Host entry and scope assignment within Keycloak.
- **Docker Compose:** Provides local Keycloak stack (`docker-compose.yml`) exposing services on loopback for development.

---

## 7. Infrastructure, DevOps & Delivery
- **Source Control:** Git monorepo hosted in stand-alone repository.
- **CI/CD:** GitHub Actions (planned) to run lint/test, publish Docker images, and deploy service containers.
- **Container Registry:** TBD; default assumption is GitHub Container Registry with environment-specific tags.
- **Secrets Management:** `.env` & `.keycloak-env` templates for local; staging/production use environment-specific secret stores (Vault or GitHub Environments).
- **Branching Strategy:** trunk-based with short-lived feature branches; release tags per service.
- **Deployment Pipeline:** Build TypeScript → unit tests → docker image build → push → environment deploy (staging/prod) with smoke tests.

---

## 8. Observability & Supportability
- **Logging:** Morgan + custom request ID; logs forwarded to central aggregator with `X-Request-Id` context.
- **Metrics:** Placeholder for future integration (Prometheus exporter or StatsD). Document instrumentation requirements for memory counts, latency, error rates.
- **Alerts:** Configure health check monitors on `/healthz` and error-rate thresholds on `/mcp` endpoints.
- **Debugging:** `/debug/oidc` and `/debug/config` provide runtime diagnostics; ensure they remain auth-protected when OAuth is enabled.

---

## 9. Security & Compliance Requirements
- Enforce OAuth bearer validation on every MCP transport; deny anonymous traffic by default.
- Apply CORS allowlists drawn from env `ALLOWED_ORIGINS` (ChatGPT Developer Mode hosts + internal tooling).
- Redirect attempts to access OAuth discovery on service host to Keycloak issuer to prevent loops.
- redact sensitive headers in logs, while optionally exposing sanitized metadata when `DEBUG_HEADERS=true`.
- Provide TLS through upstream ingress (Traefik/Cloudflare); services assume HTTPS termination at edge.
- Ensure automation scripts never persist secrets; rely on env injection.

---

## 10. Risks & Mitigations
- **Risk:** Documentation drift between scripts and guides. **Mitigation:** Require PR change log updates and doc review in Definition of Done.
- **Risk:** Divergent service configurations causing inconsistent OAuth behaviour. **Mitigation:** Centralize defaults in `mcp-auth-kit`; require new services to extend kit rather than reimplement.
- **Risk:** Keycloak automation scripts breaking due to upstream changes. **Mitigation:** Provide smoke tests invoking scripts in CI against local Keycloak container.
- **Risk:** Downstream API outages. **Mitigation:** Implement retries/backoff in service calls, instrument error alerts, provide circuit-breaker guidance.

---

## 11. Release Strategy
1. Harden workspace scripts and ensure `npm run lint|test|build` succeeds across packages.
2. Stabilize `mcp-auth-kit` and publish using npm dist-tag or internal registry.
3. Finalize MCP test server defaults and document environment variables.
4. Implement CI pipeline (lint/test build) and container publishing.
5. Announce MVP when automation, docs, and at least one production-ready service exist.

---

## 12. Epics & Story Overview

### Epic 1 – Workspace Foundation & Tooling
Establish the monorepo, documentation, automation scripts, and CI backbone.
- **Story 1.1:** Wire root npm scripts (`lint`, `test`, `build`) to execute package targets.  
  **Acceptance Criteria:** Scripts execute per workspace; failure surfaces aggregated exit codes; README updated with usage.
- **Story 1.2:** Harden `scripts/kc` automation (create scope, trusted hosts, status) with documented env expectations.  
  **Acceptance Criteria:** Scripts run against local Keycloak container; logging highlights actions; docs reference them.
- **Story 1.3:** Document developer bootstrap (env templates, docker-compose, smoke tests) in docs/bootstrap-checklist.md.  
  **Acceptance Criteria:** Checklist covers prerequisites, env vars, validation steps.
- **Story 1.4:** Upgrade workspace tooling to Node.js 24.x ahead of the October 2025 LTS promotion.
  **Acceptance Criteria:** Engines, Docker images, and CI runners target Node 24.x; docs explain local install steps (call out the pre-LTS status and upgrade timeline); `npm run lint|test|build` passes under Node 24.x; PRD change log notes the upgrade.

### Epic 2 – MCP Test Server Hardening
Complete the reference MCP server and ensure production readiness.
- **Story 2.1:** Finalize Express server with manifest, PRM, Streamable HTTP, and debug endpoints (add SSE fallback only if a consuming client needs it).  
  **Acceptance Criteria:** Endpoints respond with expected payloads; OAuth guard enforced; health checks ready.
- **Story 2.2:** Extend MCP test server diagnostics and automation hooks for compose-based validation.  
  **Acceptance Criteria:** Tools return formatted results; failures return informative errors; env defaults documented.
- **Story 2.3:** Add smoke tests (`npm run smoke`) covering Streamable HTTP flows and include optional SSE checks when that fallback is enabled.  
  **Acceptance Criteria:** Tests run locally and in CI; failures fail pipeline; docs explain usage.

### Epic 3 – Service Bootstrap & Release Enablement
Enable team to add new services rapidly with consistent guardrails.
- **Story 3.1:** Update `templates/service` scaffold and `scripts/bootstrap.sh` to copy latest best practices.  
  **Acceptance Criteria:** Running bootstrap yields lint/test-ready service with auth kit wired in.
- **Story 3.2:** Introduce release tooling (Changesets or similar) for versioning packages and publishing containers.  
  **Acceptance Criteria:** Release guide exists; sample release run documented.
- **Story 3.3:** Define migration checklist for repo split and publish in docs.  
  **Acceptance Criteria:** Checklist covers network, secrets, CI updates; referenced from PROJECT_SPLIT_PLAN.md.

---

## 13. Next Steps & Hand-Off Prompts
- **For UX Expert:** Not required; project is backend/service focused.
- **For Architect:** "Use the PRD to draft the backend architecture focusing on Express-based MCP services, shared auth kit, and Docker-based deployment across environments. Highlight component boundaries between shared package(s) and service implementations."
- **For QA/Test Architect:** "Design QA gate strategy for MCP services emphasizing OAuth coverage, diagnostics tooling, and smoke test expectations across CI/CD."
- **For Documentation Owner:** "Maintain script coverage across docs—verify `scripts/compose.sh`, `scripts/render-docs.mjs`, and automation READMEs stay in sync and create a dedicated runbook if gaps recur."
