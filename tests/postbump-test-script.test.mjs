// Testing library and framework: Node's built-in node:test and assert/strict
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import url from 'node:url';

// Resolve the script under test relative to repo root.
// Adjust this path if your script lives elsewhere.

const RUNNER_PATH = (() => {
  // Preferred env variable for flexibility in CI, but default to scripts/postbump-test.mjs
  return process.env.POSTBUMP_RUNNER_PATH ?? 'scripts/postbump-test.mjs';
})();

function nodeExec(args, options) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf8',
    env: options?.env ?? process.env,
    cwd: options?.cwd ?? process.cwd(),
    timeout: options?.timeout ?? 30000,
    // default stdio is 'pipe', which allows us to capture output from the script and its children
  });
}

function makeTempDir(prefix = 'postbump-test-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makeNpmStub(dir, { exitCode = 0, recordArgsPath, printEnv = false } = {}) {
  const isWin = process.platform === 'win32';

  // Create POSIX npm stub
  const npmPath = join(dir, 'npm');
  const npmScript = [
    '#\\!/usr/bin/env bash',
    'set -euo pipefail',
    'if [ -n "${RECORD_ARGS_PATH:-}" ]; then',
    '  printf "%s\\n" "$0" "$@" > "${RECORD_ARGS_PATH}"',
    'fi',
    'if [ -n "${PRINT_ENV:-}" ]; then',
    '  echo "NODE_ENV=${NODE_ENV:-}"',
    'fi',
    `exit ${exitCode}`,
    ''
  ].join('\n');
  writeFileSync(npmPath, npmScript, { encoding: 'utf8', mode: 0o755 });
  chmodSync(npmPath, 0o755);

  // Create Windows npm.cmd stub (harmless on non-Windows)
  const npmCmdPath = join(dir, 'npm.cmd');
  const npmCmdScript = [
    '@echo off',
    'setlocal enabledelayedexpansion',
    'if not "%RECORD_ARGS_PATH%"=="" (',
    '  > "%RECORD_ARGS_PATH%" (',
    '    echo %0 %*',
    '  )',
    ')',
    'if not "%PRINT_ENV%"=="" (',
    '  echo NODE_ENV=%NODE_ENV%',
    ')',
    `exit /b ${exitCode}`
  ].join('\r\n');
  writeFileSync(npmCmdPath, npmCmdScript, { encoding: 'utf8' });

  return { npmPath, npmCmdPath };
}

describe('postbump test runner CLI behavior', () => {
  let tmp;
  let originalEnv;

  beforeEach(() => {
    tmp = makeTempDir();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
    process.env = originalEnv;
  });

  test('exits 1 and prints helpful error when Node version is below minimum', () => {
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: '20.18.9', // below 20.19
      PATH: join(tmp, 'bin'), // no npm here; should not be needed because it exits early
    };
    // Ensure PATH dir exists but empty
    const bin = join(tmp, 'bin');
    writeFileSync(join(tmp, '.keep'), '');
    // Spawn the script
    const res = nodeExec([RUNNER_PATH], { env });

    assert.equal(res.status, 1, 'should exit with code 1 for unsupported version');
    assert.match(res.stderr ?? '', /requires Node\.js 20\.19\.0 or newer/i);
    assert.match(res.stderr ?? '', /Detected 20\.18\.9/i);
  });

  test('treats non-numeric version as unsupported and exits 1', () => {
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: 'x.y.z',
      PATH: join(tmp, 'bin'),
    };
    const res = nodeExec([RUNNER_PATH], { env });
    assert.equal(res.status, 1);
    assert.match(res.stderr ?? '', /requires Node\.js 20\.19\.0 or newer/i);
  });

  test('supports exact minimum version 20.19 and runs npm with expected args', () => {
    const bin = join(tmp, 'bin');
    const recordFile = join(tmp, 'args.txt');
    // Prepare stubbed npm
    writeFileSync(join(tmp, '.keep'), '');
    makeNpmStub(bin, { exitCode: 0, recordArgsPath: recordFile });
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: '20.19',
      PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      RECORD_ARGS_PATH: recordFile,
    };
    const extraArgs = ['--', '--reporter=dot', '-w', 'packages/foo'];
    const res = nodeExec([RUNNER_PATH, ...extraArgs], { env });

    assert.equal(res.status, 0, 'exit code should mirror stubbed npm success');

    // Validate npm invocation and forwarded args
    assert.ok(existsSync(recordFile), 'npm stub should record args');
    const recorded = readFileSync(recordFile, 'utf8').trim();
    // On POSIX we wrote "$0" and "$@" on separate lines; on Windows one line. Normalize to a single string.
    const normalized = recorded.replace(/\r?\n/g, ' ');
    assert.match(normalized, /\brun test\b/, 'should run test script');
    assert.match(normalized, /--workspaces/, 'should include --workspaces');
    assert.match(normalized, /--if-present/, 'should include --if-present');
    // The extra args slice(2) are forwarded after the defaults
    assert.match(normalized, /-- --reporter=dot -w packages\/foo/, 'should forward extra cli args after defaults');
  });

  test('passes NODE_ENV=test to npm by default', () => {
    const bin = join(tmp, 'bin');
    makeNpmStub(bin, { exitCode: 0 });
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: '21.0.0',
      PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      PRINT_ENV: '1',
    };
    const res = nodeExec([RUNNER_PATH], { env });
    assert.equal(res.status, 0);
    assert.match(res.stdout ?? '', /NODE_ENV=test/, 'should default NODE_ENV to test');
  });

  test('preserves pre-set NODE_ENV when provided', () => {
    const bin = join(tmp, 'bin');
    makeNpmStub(bin, { exitCode: 0 });
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: '22.3.1',
      NODE_ENV: 'development',
      PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
      PRINT_ENV: '1',
    };
    const res = nodeExec([RUNNER_PATH], { env });
    assert.equal(res.status, 0);

    assert.match(res.stdout ?? '', /NODE_ENV=development/, 'should pass through NODE_ENV when already set');
  });

  test('when npm binary is missing, prints spawn error and exits with nonzero', () => {
    const emptyBin = join(tmp, 'empty-bin');
    // Ensure empty dir on PATH to cause ENOENT
    writeFileSync(join(tmp, '.keep2'), '');
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: '22.0.0',
      PATH: `${emptyBin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    };
    // Create the directory but no npm/npm.cmd inside
    // Using mkdir via fs not necessary; spawn will search PATH and fail
    // But we do ensure the dir exists:
    try { chmodSync(emptyBin, 0o755); } catch {}
    // Spawn the runner
    const res = nodeExec([RUNNER_PATH], { env });
    assert.notEqual(res.status, 0);
    assert.match(res.stderr ?? '', /Failed to execute workspace tests:/, 'should print failure to execute');
  });

  test('supports versions with patch and higher majors (e.g., 21.0.0) and mirrors npm exit code', () => {
    const bin = join(tmp, 'bin');
    // Stub npm to fail with a specific code to verify mirroring
    const failCode = 7;
    makeNpmStub(bin, { exitCode: failCode });
    const env = {
      ...process.env,
      POSTBUMP_NODE_VERSION: '21.0.0',
      PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    };
    const res = nodeExec([RUNNER_PATH], { env });
    assert.equal(res.status, failCode, 'script should mirror npm exit status');
  });
});