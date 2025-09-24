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
const fs = require('fs');
const p = 'services/mcp-test-server/package.json';
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
const devDeps = pkg.devDependencies || {};
const scripts = pkg.scripts || {};
const wantDeps = {
  vitest: '^3.2.4',
  '@vitest/coverage-v8': '^3.2.4',
  'get-port': '^7.0.0',
  'node-fetch': '^3.3.2',
  supertest: '^7.1.1'
};
const wantScripts = ['test', 'test:unit', 'test:integration'];
const issues = [];

for (const [dep, version] of Object.entries(wantDeps)) {
  if (devDeps[dep] !== version) {
    issues.push(`- devDependency "${dep}" should be "${version}", but is "${devDeps[dep]}"`);
  }
}

for (const script of wantScripts) {
  if (!scripts[script]) {
    issues.push(`- script "${script}" is missing.`);
  }
}

if (issues.length > 0) {
  console.error(`ERROR: ${p} is not configured correctly for CI:\n` + issues.join('\n'));
  process.exit(1);
}
JS
  if [ ! -f "$W/vitest.config.ts" ]; then
    echo "ERROR: $W/vitest.config.ts is missing." >&2
    exit 1
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
