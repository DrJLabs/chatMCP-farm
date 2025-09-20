# Source Tree Reference

```
/                    Root workspace (npm workspaces)
├── docs/            Planning and operator documentation (PRD, architecture, guides)
│   ├── architecture/  Architecture shards loaded by dev agent
│   └── prd/           PRD shards (overview, requirements, epics)
├── packages/
│   └── mcp-auth-kit/  Shared OAuth + manifest helpers consumed by services
├── services/
│   └── openmemory/    Reference MCP service wired to OpenMemory backend
├── scripts/
│   └── kc/            Keycloak automation (scope, trusted hosts, status)
├── templates/
│   └── service/       Scaffolding for new MCP services
├── docker-compose.yml Root compose file for local Keycloak + services
├── tsconfig.base.json Shared TS compiler options
└── PROJECT_SPLIT_PLAN.md Extraction roadmap and operations checklist
```

**Guidelines**
- Place new shared libraries under `packages/` and add them to the workspace.
- Each deployable MCP service lives under `services/<name>` with its own `package.json`, tests, and Dockerfile.
- Document every new script/template in `docs/` and update the PRD or architecture shards when behaviour changes.
