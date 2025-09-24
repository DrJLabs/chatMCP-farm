// Test framework note:
// Using Node.js built-in test runner (node:test) and assert for zero-dependency, ESM-friendly tests.
// If this repository standardizes on another runner (e.g., Vitest or Jest), these tests can be
// adapted easily since they are pure assertions over parsed JSON.

import { test, describe, beforeAll } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const rootPkgPath = path.resolve(__dirname, '..', 'package.json');

let pkg;

beforeAll(async () => {
  const raw = await readFile(rootPkgPath, 'utf8');
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Root package.json is not valid JSON: ${e?.message || e}`);
  }
});

describe('root package.json', () => {
  test('has required top-level fields with correct types', () => {
    assert.equal(typeof pkg, 'object');
    assert.equal(pkg && typeof pkg.name, 'string');
    assert.equal(pkg && typeof pkg.version, 'string');
    assert.equal(pkg && typeof pkg.private, 'boolean');
    assert.equal(pkg.private, true, 'package.json should be private');
  });

  test('name and version match expected values', () => {
    assert.equal(pkg.name, 'mcp-servers-workspace');
    assert.equal(pkg.version, '0.1.0');
  });

  test('engines specify supported Node and npm ranges', () => {
    assert.equal(typeof pkg.engines, 'object');
    assert.equal(pkg.engines.node, '>=22 <25');
    assert.equal(pkg.engines.npm, '>=10');
  });

  test('workspaces are configured correctly', () => {
    assert.ok(Array.isArray(pkg.workspaces), 'workspaces should be an array');
    const required = ['packages/*', 'services/*'];
    for (const entry of required) {
      assert.ok(
        pkg.workspaces.includes(entry),
        `workspaces should include ${entry}`
      );
    }
  });

  test('scripts include all required commands with exact values', () => {
    const expected = {
      build: 'npm run build --workspaces --if-present',
      lint: 'npm run lint --workspaces --if-present',
      guard: 'bash scripts/run-guardrails.sh',
      pretest: 'npm run guard',
      test: 'npm run test --workspaces --if-present',
      'docs:render': 'node scripts/render-docs.mjs',
      'bmad:refresh': 'bmad-method install -f -i codex',
      'bmad:list': 'bmad-method list:agents',
      'bmad:validate': 'bmad-method validate',
      'postbump:test': 'node scripts/postbump-test.mjs',
      'test:ci': 'bash scripts/cloud-test.sh',
    };

    assert.equal(typeof pkg.scripts, 'object', 'scripts must be an object');

    // Ensure presence and exact value match
    for (const [k, v] of Object.entries(expected)) {
      assert.ok(k in pkg.scripts, `scripts should include "${k}"`);
      assert.equal(
        pkg.scripts[k],
        v,
        `scripts["${k}"] should equal exactly: ${v}`
      );
    }
  });

  test('scripts guard against accidental mutation: unknown scripts do not affect required ones', () => {
    // This test ensures required scripts remain intact even if other scripts exist.
    const requiredKeys = [
      'build',
      'lint',
      'guard',
      'pretest',
      'test',
      'docs:render',
      'bmad:refresh',
      'bmad:list',
      'bmad:validate',
      'postbump:test',
      'test:ci',
    ];
    for (const k of requiredKeys) {
      assert.ok(k in pkg.scripts, `required script "${k}" must exist`);
      assert.equal(typeof pkg.scripts[k], 'string', `"${k}" must be a string`);
      assert.notEqual(pkg.scripts[k].trim(), '', `"${k}" must be non-empty`);
    }
  });

  test('package.json remains parseable and free of trailing commas', async () => {
    // Re-read file and do a simple trailing comma heuristic check.
    const raw = await readFile(rootPkgPath, 'utf8');
    // Basic heuristic: no ", }" or ", ]" with only whitespace in between.
    assert.ok(!/,\s*}/.test(raw), 'No trailing comma before object closing brace');
    assert.ok(!/,\s*]/.test(raw), 'No trailing comma before array closing bracket');
  });

  test('node engine range is respected by simple semantic checks', () => {
    // Lightweight validation without adding semver dependency:
    // Ensure it starts with >=22 and includes <25
    const nodeRange = String(pkg.engines.node);
    assert.ok(nodeRange.includes('>=22'), 'node engine should include ">=22"');
    assert.ok(nodeRange.includes('<25'), 'node engine should include "<25"');
  });
});