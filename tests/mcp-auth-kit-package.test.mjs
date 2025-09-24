/**
 * Test framework: Node.js built-in test runner (node:test) with assert/strict.
 * These tests validate the mcp-auth-kit package.json fields as per the PR diff.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

/**
 * Recursively find the package.json whose "name" matches pkgName.
 * Skips heavy/irrelevant directories.
 */
function findPackageJsonByName(pkgName, startDir = repoRoot) {
  const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next', '.pnpm', '.yarn', '.cache'
  ]);

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === 'package.json') {
        try {
          const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          if (json && json.name === pkgName) {
            return { path: fullPath, json };
          }
        } catch {
          // ignore invalid JSON files
        }
      } else if (entry.isDirectory()) {
        const found = walk(fullPath);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(startDir);
}

const found = findPackageJsonByName('mcp-auth-kit');

test('mcp-auth-kit package.json exists and is readable', () => {
  assert.ok(found, 'Could not find package.json for "mcp-auth-kit" anywhere in the repository');
  assert.ok(fs.existsSync(found.path), `File does not exist: ${found?.path}`);
});

test('package metadata fields are correctly set', () => {
  const pkg = found.json;
  assert.equal(pkg.name, 'mcp-auth-kit');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.private, true);
});

test('package uses ESM with correct entry points', () => {
  const pkg = found.json;
  assert.equal(pkg.type, 'module', 'Package should be ESM');
  assert.equal(pkg.main, 'dist/index.js', 'main should point to compiled JS in dist');
  assert.equal(pkg.types, 'dist/index.d.ts', 'types should point to compiled type declarations in dist');
  assert.ok(pkg.types.endsWith('.d.ts'), 'types should reference a .d.ts file');
  assert.ok(pkg.main.endsWith('.js'), 'main should reference a .js file');
});

test('scripts include proper build and prepare commands', () => {
  const pkg = found.json;
  assert.ok(pkg.scripts, 'scripts must be defined');
  assert.equal(pkg.scripts.build, 'tsc -p tsconfig.json', 'build script should compile with tsconfig project');
  assert.equal(pkg.scripts.prepare, 'npm run build', 'prepare should build the package');
});

test('runtime dependencies are correct', () => {
  const pkg = found.json;
  assert.ok(pkg.dependencies, 'dependencies must be defined');
  const depKeys = Object.keys(pkg.dependencies).sort();
  assert.deepEqual(depKeys, ['jose'], 'Only "jose" should be listed as a runtime dependency');
  const joseVersion = pkg.dependencies.jose;
  assert.match(joseVersion, /^\^6\.\d+\.\d+$/, 'jose should be pinned to ^6.x.x');
  // Ensure no unexpected specifiers in runtime deps
  for (const [name, ver] of Object.entries(pkg.dependencies)) {
    assert.notMatch(
      String(ver),
      /^(file:|git\+|link:|workspace:|latest)$/,
      `Unexpected version specifier for dependency "${name}": ${ver}`
    );
  }
});

test('peerDependencies correctly declare express and cors', () => {
  const pkg = found.json;
  assert.ok(pkg.peerDependencies, 'peerDependencies must be defined');
  assert.equal(pkg.peerDependencies.express, '^5.1.0', 'express should be a peer dependency at ^5.1.0');
  assert.equal(pkg.peerDependencies.cors, '^2.8.5', 'cors should be a peer dependency at ^2.8.5');
  // Ensure they are not incorrectly placed in runtime dependencies
  assert.ok(!pkg.dependencies?.express, 'express must not be in dependencies');
  assert.ok(!pkg.dependencies?.cors, 'cors must not be in dependencies');
});

test('devDependencies include type packages and TypeScript', () => {
  const pkg = found.json;
  assert.ok(pkg.devDependencies, 'devDependencies must be defined');
  assert.equal(pkg.devDependencies['@types/cors'], '^2.8.17', '@types/cors should match expected version');
  assert.equal(pkg.devDependencies['@types/express'], '^5.0.3', '@types/express should match expected version');
  assert.match(pkg.devDependencies.typescript, /^\^5\.\d+\.\d+$/, 'TypeScript should be ^5.x.x');
});