# Source Tree Reference

```
/                    Root workspace (npm workspaces)
├── .bmad-core/        BMAD method definitions, agent configs, tasks
├── docs/              Planning and operator documentation
│   ├── architecture/    Sharded architecture references (source-tree, tech-stack, coding-standards)
│   ├── prd/             PRD shards (overview, requirements, epics)
│   ├── bootstrap-checklist.md  Bootstrap quickstart for new services
│   ├── oauth-keycloak.md        ChatGPT Developer Mode + Keycloak integration guide
│   └── config.sample.json       Template variables consumed by doc renderer
├── packages/
│   └── mcp-auth-kit/    Shared OAuth + manifest helpers consumed by services
│       ├── src/
│       │   ├── env.ts       Env parsing + validation
│       │   └── index.ts     Express middleware + manifest/PRM helpers
│       └── README.md        Package usage expectations
├── services/
│   └── openmemory/      Reference MCP service wired to OpenMemory backend
│       ├── src/
│       │   ├── server.ts    Express bootstrapping + transport wiring
│       │   ├── mcp.ts        Tool registration + OpenMemory client calls
│       │   ├── smoke.ts      Streamable HTTP smoke tester
│       │   └── smoke_sse.ts  Optional SSE smoke tester
│       └── compose.yml       Service compose fragment consumed by scripts/compose.sh
├── scripts/
│   ├── bootstrap.sh     Copies templates/service into services/<name>
│   ├── compose.sh       Aggregates services/*/compose.yml for docker-compose
│   ├── render-docs.mjs  Applies config overrides to docs
│   └── kc/              Keycloak automation (create scope, status, trusted hosts)
├── templates/
│   └── service/         Scaffolding for new MCP services (Dockerfile, env template, compose snippet)
├── PROJECT_SPLIT_PLAN.md  Extraction roadmap and operations checklist
├── README.md            Workspace overview + setup guidance
├── docker-compose.yml   Local Keycloak + shared services stack
├── package.json         npm workspace root manifest
└── tsconfig.base.json   Shared TypeScript compiler options
```

**Guidelines**
- Place new shared libraries under `packages/` and add them to the workspace.
- Each deployable MCP service lives under `services/<name>` with its own `package.json`, tests, and Dockerfile.
- Document every new script/template in `docs/` and update the PRD or architecture shards when behaviour changes.
- Keep `.bmad-core/` synchronized with AGENTS expectations; regenerate via BMAD tooling when agent definitions evolve.
