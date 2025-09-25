# Filesystem MCP Bridge Runbook

> **Audience:** Platform engineers and operators enabling the filesystem MCP bridge profile.
> **Goal:** Bring up, validate, and manage the filesystem MCP bridge with secure defaults while capturing the evidence required by BMAD workflows.

## 1. Prerequisites
- `services/filesystem-mcp/.env` created from `.env.example` with project-specific hosts and network settings. Keep `ALLOW_WRITE=false` and `ENABLE_ROOTS=false` unless the approval workflow in §5 has concluded. [Ref: services/filesystem-mcp/.env.example]
- Docker Compose v2 on PATH and the shared wrapper script `scripts/compose.sh` available. [Ref: docs/runbooks/compose-and-docs.md#aggregated-compose-workflow]
- Docker network declared in `.env` (`MCP_NETWORK_EXTERNAL`) exists or will be created (`docker network create traefik`).
- `.keycloak-env` populated if OAuth guardrails will be exercised; not required for initial bridge smoke checks. [Ref: docs/bootstrap-checklist.md#prerequisites]
- Optional local image build: `docker build -f services/filesystem-mcp/Bridge.Dockerfile -t filesystem-mcp-bridge:local .` when iterating on Dockerfile changes. [Ref: docs/stories/4.1.filesystem-mcp-bridge-container.md]

## 2. Configuration Reference
| Variable | Default | Notes |
| --- | --- | --- |
| `FS_ALLOWED` | `/projects:/VAULTS` | Colon-separated container paths exposed to the bridge CLI. Reject empty values; keep restricted until reviewed. [Ref: docs/bmad/focused-epics/filesystem-mcp/epic.md#risk-mitigation] |
| `ALLOW_WRITE` | `false` | Controls write access. Must remain `false` until PO & QA sign-off; enabling requires §5 workflow. |
| `ENABLE_ROOTS` | `false` | Toggles discovery of additional allowed roots. Enable only with the same approval as write access. |
| `SSE_PORT` | `12010` | Port exposed by `mcp-proxy` for Streamable HTTP. Traefik routes `Host(${MCP_PUBLIC_HOST})` here. [Ref: docs/stories/4.2.filesystem-mcp-compose-profile.md#acceptance-criteria] |
| `HOST_PROJECTS_ROOT` | `/srv/projects` | Host-side bind mount mapped read-only to `/projects`. |
| `HOST_VAULTS_ROOT` | `/srv/vaults` | Host-side bind mount mapped read-only to `/VAULTS`. |

> **Security Reminder:** Do not alter bind mounts to read-write mode without completing §5. Read-only enforcement is a core mitigation against accidental writes and path escape.

## 3. Bring-up Workflow
1. **Dry-run the aggregated compose file**
   ```bash
   scripts/compose.sh --profile filesystem-mcp config
   ```
   Confirms compose fragments resolve. Capture output for Dev Notes when running in BMAD workflows. [Ref: docs/stories/4.2.filesystem-mcp-compose-profile.md#testing]
2. **Start the profile**
   ```bash
   COMPOSE_PROFILES=filesystem-mcp scripts/compose.sh up --build
   ```
   The bridge container builds from `Bridge.Dockerfile`, attaches to the proxy network, and honors `.env` variables.
3. **Inspect startup logs**
   ```bash
   scripts/compose.sh --profile filesystem-mcp logs -f
   ```
   Confirm log lines show allowed roots, SSE port 12010, and read-only status. Record timestamps for QA artifacts.
4. **Optional detached mode** – add `--detach` to the `up` command for long-running sessions.

## 4. Validation Checklist
- **Compose dry-run evidence** – store the `config` output or hash in Dev Notes/QA gate.
- **Bridge log verification** – capture log snippet showing `FS_ALLOWED` values and `SSE port 12010`.
- **Smoke script**
  ```bash
  scripts/filesystem-mcp-bridge-smoke.sh filesystem-mcp-bridge:local
  ```
  Assures the container enforces the `FS_ALLOWED` guard, pins `mcp-proxy==0.9.0`, and keeps the port reachable. [Ref: scripts/filesystem-mcp-bridge-smoke.sh]
- **Teardown confirmation**
  ```bash
  scripts/compose.sh --profile filesystem-mcp down --remove-orphans
  ```
  Ensures containers stop cleanly after validation.
- **Evidence capture** – log command outputs in the story’s Dev Notes, QA gate, or Runbook appendix as required by BMAD.

## 5. Enabling Write Mode (Approval Required)
1. Obtain written approval from the Product Owner and QA gate referencing risk ID `SEC-4.2-001`.
2. Update `services/filesystem-mcp/.env`:
   ```bash
   ALLOW_WRITE=true
   ENABLE_ROOTS=true   # only if broader discovery is justified
   ```
3. Re-run bring-up workflow (§3) and smoke tests (§4). The smoke script should reject invalid roots even with write mode active.
4. Document before/after configuration, approvals, and validation evidence in `docs/stories/follow-ups.md` or relevant QA assessments.
5. Revisit approvals whenever host paths or scope widen.

## 6. Troubleshooting
- **`compose.sh ... config` fails** – ensure `.env` exports `MCP_NETWORK_EXTERNAL` and the referenced docker network exists. Recreate with `docker network create <name>`.
- **No log line for SSE port** – confirm the container built the latest entrypoint; rebuild the image (`docker build ...`) before re-running compose.
- **Smoke script fails port check** – inspect container logs to ensure service started; verify no other process bound port 12010 on the host.
- **`FS_ALLOWED` empty error** – expected safeguard; set a non-empty list before restarting.
- **Traefik routing missing** – confirm `MCP_PUBLIC_HOST` in `.env` matches DNS and that the proxy network is attached (see compose logs for `traefik` labels).

## 7. Related Documentation
- Story 4.1 – Bridge container build requirements (`docs/stories/4.1.filesystem-mcp-bridge-container.md`).
- Story 4.2 – Compose profile and `.env` template (`docs/stories/4.2.filesystem-mcp-compose-profile.md`).
- BMAD Story 4.3 – Context and testing expectations (`docs/stories/4.3.filesystem-mcp-runbook.md`).
- Compose wrapper reference (`docs/runbooks/compose-and-docs.md`).
- Bootstrap checklist for new services (`docs/bootstrap-checklist.md`).

Keep this runbook alongside compose tooling references so operators can bring the filesystem bridge online without re-reading prior stories.
