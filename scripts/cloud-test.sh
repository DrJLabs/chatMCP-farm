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
  npm run test:integration -w "$W"
  if [ "${ENABLE_E2E:-0}" = "1" ]; then npm test -w "$W" || true; fi
fi

# 5) Guard against Express 4 regressions (service scope)
if [ -d "$W" ]; then
  node - <<'JS'
const fs = require('fs');
const path = require('path');
const pkgPath = path.join('services/mcp-test-server', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const expected = '^5.1.0';
const actual = pkg.dependencies?.express;
if (actual !== expected) {
  console.error(`ERROR: ${pkgPath} dependencies.express should be ${expected} (found ${actual ?? '<unset>'}).`);
  process.exit(1);
}
JS

  node - <<'JS'
const { execSync } = require('child_process');
function listTypes() {
  try {
    return execSync('npm ls @types/express --workspace services/mcp-test-server --json', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err) {
    if (err.stdout) return err.stdout.toString();
    throw err;
  }
}

const dataRaw = listTypes();
if (!dataRaw.trim()) process.exit(0);
const data = JSON.parse(dataRaw);
const violations = [];

function visit(node, path = []) {
  if (!node || !node.dependencies) return;
  for (const [name, dep] of Object.entries(node.dependencies)) {
    const nextPath = path.concat(dep.name || name);
    if (name === '@types/express') {
      const allowed = path.some(segment => segment.startsWith('mcp-auth-kit'));
      if (!allowed) {
        violations.push(nextPath.join(' > '));
      }
    }
    visit(dep, nextPath);
  }
}

visit(data);
if (violations.length > 0) {
  console.error('ERROR: @types/express detected outside mcp-auth-kit allowlist:\n' + violations.join('\n'));
  process.exit(1);
}
JS
fi
