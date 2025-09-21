# Chat MCP Farm Architecture Document

**Version:** 0.1.1  
**Last Updated:** September 20, 2025  
**Author:** Codex Architecture Team  
**Status:** Draft (Initial)

---

## 1. Introduction
This document captures the backend architecture for the Chat MCP Farm workspace. It establishes component boundaries, technology choices, operational standards, and security expectations that govern every MCP service hosted in this repository.

### 1.1 Starter Template or Existing Project
The project originates from the `mcp-servers` workspace. We retain its monorepo layout, the `openmemory` reference service, templates, and automation scripts. No external starter template is required; future services should be generated via `scripts/bootstrap.sh` which copies the maintained template under `templates/service`.

### 1.2 Change Log
| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2025-09-20 | 0.1.1 | Documented script/runtime inventory and doc generation pipeline | Codex |
| 2025-09-19 | 0.1.0 | Initial architecture draft for standalone MCP workspace | Codex |

---

## 2. High-Level Architecture

### 2.1 Technical Summary
Chat MCP Farm is a Node.js/TypeScript monorepo that ships OAuth-secured MCP services. Each service is an Express application wrapped with `mcp-auth-kit` for Keycloak integration and exposes Streamable HTTP transport by default; SSE is implemented only for clients that explicitly require it. Shared packages live under `packages/`, deployable services under `services/`, and automation under `scripts/`. Docker images deliver services behind ingress (Traefik/Cloudflare) and depend on external systems such as Keycloak for authorization plus whatever downstream API each server targets (the `openmemory` MCP is simply the first proven example).

### 2.2 High-Level Overview
- **Architecture Style:** Modular monolith within a monorepo; each MCP service is a deployable container sharing infrastructure tooling.
- **Repository Structure:** npm workspaces; shared base configs (`tsconfig.base.json`), root scripts orchestrate builds/tests.
- **Tooling & Automation:** `scripts/bootstrap.sh` scaffolds services, `scripts/compose.sh` merges per-service compose files, and `scripts/render-docs.mjs` applies configuration overlays during documentation renders.
- **Service Boundary:** `packages/mcp-auth-kit` centralizes auth behaviour; each entry under `services/*` consumes it and exposes domain-specific MCP tools for its chosen downstream integration.
- **Primary Flow:** ChatGPT Developer Mode → Ingress → MCP Service (Express) → Auth kit verifies bearer token via Keycloak → Service executes domain logic against its target system (for example, the OpenMemory REST API) → Response streamed back to client.
- **Key Decisions:** Enforce OAuth by default, keep automation local, standardize on Streamable HTTP transport (add SSE only when explicitly required), prefer TypeScript strict mode, treat docs as first-class assets.

### 2.3 High-Level Diagram
```mermaid
graph LR
  A[ChatGPT / MCP Client]
  B[Ingress (Traefik / Cloudflare)]
  C[Express MCP Service]
  D[MCP Auth Kit]
  E[Keycloak OIDC]
  F[Downstream API (e.g., OpenMemory)]

  A -- MCP Manifest / Streamable HTTP --> B
  B -- Forwarded HTTPS --> C
  C -- uses --> D
  D -- Validate Token --> E
  C -- Domain Calls --> F
  C -- Logs / Metrics --> G[Observability Stack]
```

### 2.4 Key Architecture Decisions
| ID | Decision | Rationale | Status |
| --- | --- | --- | --- |
| AD-01 | Centralize OAuth in `mcp-auth-kit` | Avoid duplication, enforce uniform security defaults | Accepted |
| AD-02 | Retain monorepo with npm workspaces | Simplifies shared tooling, allows atomic PRs | Accepted |
| AD-03 | Treat Streamable HTTP as the default transport (add SSE only when a client mandates it) | Compatibility with current MCP clients & legacy connectors | Accepted |
| AD-04 | Use docker-compose for local orchestration | Simplifies Keycloak + service bootstrap | Accepted |
| AD-05 | Document operational runbooks within repo | Prevent doc drift and off-platform dependencies | Accepted |

---

## 3. Component Architecture

### 3.1 Shared Packages (`packages/`)
- **mcp-auth-kit:** TypeScript library that loads env configuration, exposes Express middleware, manifest generator, protected resource metadata handler, and auth guard. Handles origin allowlists, JWKS retrieval, and manifest descriptions.

### 3.2 Services (`services/*`)
- **Transport Layer:** Each MCP service is an Express app instrumented with `morgan`, Streamable HTTP endpoints, request ID middleware, and debug endpoints delivered through the auth kit. SSE routes are added only when a target client cannot consume Streamable HTTP.
- **Domain Logic:** `mcp.ts` (or equivalent) registers tools with `@modelcontextprotocol/sdk` and brokers calls to the service's downstream system. The `openmemory` directory demonstrates this pattern against the OpenMemory REST API but is not a shared dependency.
- **Configuration:** Environment variables define base URLs, credentials, and transport toggles (e.g., enabling legacy SSE) per service; no global runtime contract beyond the auth kit.

### 3.3 Templates & Scripts
- **templates/service/**: Skeleton for new services (Express + auth kit + tests) updated as best practices evolve.
- **scripts/bootstrap.sh:** Scaffolds new MCP services from the template, wiring dependencies and Docker snippets.
- **scripts/compose.sh:** Aggregates every `services/*/compose.yml` into a single docker-compose invocation for local stacks.
- **scripts/kc/*.sh:** Shell helpers wrapping `kcadm` to configure Keycloak (scopes, trusted hosts, status checks).
- **scripts/render-docs.mjs:** Applies overrides from `docs/config.sample.json` + `docs/local/` to render environment-specific documentation.

---

## 4. Runtime View

### 4.1 Request Lifecycle
1. Client fetches manifest from MCP service via ingress. Manifest served using auth kit defaults.
2. Client obtains OAuth token from Keycloak (outside scope of service).
3. Client invokes `/mcp` or `/sse`; auth guard validates bearer token audience and issuer using JWKS.
4. Service executes requested tool logic (for example, invoking a downstream REST API such as OpenMemory) and streams the response.
5. Request/response metadata logged with request ID and auth flag.

### 4.2 Deployment Environments
- **Local:** Docker Compose standing up Keycloak + service containers; `.env.example` provides defaults.
- **Staging:** Container deployed behind internal ingress; shares Keycloak realm but uses staging hostnames and client scopes.
- **Production:** Container deployed behind Cloudflare / Traefik with trusted host entries; replicates staging configuration with tightened allowed origins and secrets from secure store.

### 4.3 Scaling Strategy
- Single container per service with horizontal scaling managed by the orchestrator (Kubernetes or container platform). Services are stateless; scale-out requires consistent environment variables and shared secrets. Each downstream API (e.g., OpenMemory) must tolerate the resulting concurrency.

---

## 5. Build & Release Pipeline
- **Build:** `npm run build --workspaces` compiles packages & services (TypeScript → ESM). Docker images built per service using multi-stage Dockerfiles.
- **Lint/Test:** Root scripts orchestrate `npm run lint|test` for each workspace. Smoke tests verify Streamable HTTP flows; enable SSE scenarios only for services that ship that fallback.
- **CI:** GitHub Actions pipeline (to be configured) triggers on pull request and main branch merges. Jobs: install deps (npm), lint, test, build docker image, optionally push to registry.
- **Release:** Changesets (planned) manage version bumps for shared packages. Docker images tagged with git SHA and semantic version, published to container registry.

---

## 6. Data & Integrations
- **External APIs:**
  - Keycloak OIDC endpoints for token validation and metadata.
  - Service-specific downstream APIs (the current example is the OpenMemory API).
- **Data Storage:** No shared database; each service depends on its downstream system. For the openmemory example this means relying on the OpenMemory backend, while future services can document their own data sources.
- **Configuration Sources:** Environment variables injected via `.env`, `.keycloak-env`, or orchestrator secrets.

---

## 7. Security Architecture
- **Authentication:** OAuth 2.0 bearer tokens validated via `mcp-auth-kit`; supports multiple audiences via env configuration.
- **Authorization:** MCP tools rely on downstream systems to enforce their own data-access rules (e.g., OpenMemory scopes for memory operations). Future services must document any additional authorization model they expose.
- **Secrets Management:** Developers use template env files; production secrets managed via secret stores (GitHub, Vault). No secrets in repo.
- **Transport Security:** HTTPS termination handled by ingress; services assume TLS offload but enforce HSTS via ingress configuration.
- **Logging Hygiene:** Authorization header redacted prior to logging; optional debug header logging sanitized to avoid sensitive leakage.
- **Trusted Hosts:** Automation scripts ensure MCP hostnames exist in Keycloak trusted host policy to prevent token replay attacks.

---

## 8. Observability & Operations
- **Logging:** Structured logs via `morgan` include request ID, method, path, origin, session id, auth status.
- **Metrics:** Placeholder for Node process metrics (e.g., via `prom-client`). Future work to expose HTTP latency and downstream API call success/failure counts per service (OpenMemory, etc.).
- **Tracing:** Optional integration with OpenTelemetry; not yet implemented.
- **Dashboards:** To be defined once metrics instrumentation is added.
- **Runbooks:** docs/bootstrap-checklist.md and docs/oauth-keycloak.md provide operator guidance; future runbooks should live alongside service directories.

---

## 9. Testing Strategy
- **Unit Tests:** Target reusable modules in `packages/` and isolated logic in services (e.g., request builders, error handlers).
- **Integration Tests:** Smoke Streamable HTTP flows using the service's downstream mock or sandbox (OpenMemory today), and verify OAuth enforcement by hitting endpoints with/without tokens. Add SSE parity checks only when a service exposes that legacy path.
- **End-to-End:** Validate handshake between ChatGPT Developer Mode and deployed service via manifest, PRM, token exchange, tool invocation.
- **CI Gates:** Lint + unit + smoke tests required before merge. Security scanning (npm audit, dependency review) to be added.

---

## 10. Operational Playbook
- **Configuration Promotion:** Manage `.env` templates per environment; commit templates but not secrets.
- **Rollback:** Redeploy previous container image tag; ensure migrations (if introduced) are idempotent.
- **Incident Response:** On auth failures, review `/debug/oidc` output, confirm audiences/trusted hosts, inspect logs with request ID correlation.
- **Capacity Planning:** Monitor downstream API quotas (OpenMemory and others) and scale service containers as needed based on request throughput.

---

## 11. Next Steps & Hand-Off Prompts
- **Frontend Architecture:** Not required; project currently backend-only.
- **Dev Agent Guidance:** Always load `docs/architecture/tech-stack.md`, `docs/architecture/source-tree.md`, and `docs/architecture/coding-standards.md` before implementing stories.
- **QA Guidance:** Reference testing strategy to design gates once stories begin.
- **Future Enhancements:** Instrument metrics, finalize CI/CD pipeline, extend architecture doc with service-specific sections as new MCP services are added.
