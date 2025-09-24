#!/usr/bin/env bash
set -euo pipefail
# Cloud/CI-safe test runner: installs dev deps, ensures Vitest, runs unit+integration
# Optional e2e via Playwright when ENABLE_E2E=1

# 0) Require Node >=22
node -e 'p=+process.versions.node.split(".")[0];process.exit(p>=22?0:1)' || { echo "Need Node >=22"; exit 1; }

# 1) Install deps with dev (avoid production-only installs)
export NODE_ENV=
export npm_config_audit=false npm_config_fund=false
if [ -f package-lock.json ]; then
  npm ci --workspaces --no-audit --no-fund || npm i --workspaces --no-audit --no-fund
else
  npm i  --workspaces --no-audit --no-fund
fi

# 2) Ensure Vitest toolchain for the MCP test service (idempotent)
W="services/mcp-test-server"
if [ -d "$W" ] && [ -f "$W/package.json" ]; then
  node - <<'JS'
const fs=require('fs'), p='services/mcp-test-server/package.json';
const pkg=JSON.parse(fs.readFileSync(p,'utf8'));
pkg.devDependencies=pkg.devDependencies||{};
const currentVitest=(pkg.devDependencies.vitest||'').match(/\d+/);
const vitestMajor=currentVitest?Number(currentVitest[0]):3;
const vitestVersion=vitestMajor>=3?'^3.2.4':'^1.6.1';
const coverageVersion=vitestMajor>=3?'^3.2.4':'^1.6.1';
const want={
  vitest: vitestVersion,
  '@vitest/coverage-v8': coverageVersion,
  'get-port': '^7.0.0',
  'node-fetch': '^3.3.2',
  supertest: '^7.1.1'
};
let changed=false;
for(const [k,v] of Object.entries(want)){
  if(pkg.devDependencies[k]!==v){
    pkg.devDependencies[k]=v;
    changed=true;
  }
}
pkg.scripts=pkg.scripts||{};
if(!pkg.scripts['test']){ pkg.scripts['test']='vitest run'; changed=true; }
if(!pkg.scripts['test:unit']){ pkg.scripts['test:unit']='vitest run'; changed=true; }
if(!pkg.scripts['test:integration']){ pkg.scripts['test:integration']='vitest run tests/integration --reporter=default'; changed=true; }
if(changed){
  fs.writeFileSync(p, JSON.stringify(pkg,null,2)+"\n");
}
JS
  npm i -w "$W" --no-audit --no-fund
  if [ ! -f "$W/vitest.config.ts" ]; then
    cat > "$W/vitest.config.ts" <<'TS'
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true, mockReset: true, restoreMocks: true,
    coverage: {
      provider: "v8", reporter: ["text","html","json"], reportsDirectory: "./coverage",
      all: true, include: ["src/**"], exclude: ["**/*.d.ts","test/**","dist/**"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 }
    }
  }
});
TS
  fi
fi

# 3) Optional Playwright e2e if allowed
if [ "${ENABLE_E2E:-0}" = "1" ]; then
  npm i -D @playwright/test --no-audit --no-fund || true
  npx playwright install --only=chromium || true
fi

# 4) Run tests (parity to CLI where possible)
if [ -d "$W" ]; then
  npm run test:unit -w "$W"
  if [ -d "$W/tests/integration" ]; then
    npm run test:integration -w "$W"
  fi
  if [ "${ENABLE_E2E:-0}" = "1" ]; then npm test -w "$W" || true; fi
fi
