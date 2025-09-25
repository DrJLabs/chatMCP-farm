const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const fixtureRoot = path.join(repoRoot, '.bmad-cache', 'reviewer-fixture');

function resetFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });
}

function touchDir(dir, date) {
  fs.utimesSync(dir, date, date);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      touchDir(target, date);
    } else {
      fs.utimesSync(target, date, date);
    }
  }
}

function createFixture() {
  // Old run (age pruning)
  const oldSha = path.join(fixtureRoot, 'sha-old');
  const oldRun = path.join(oldSha, '20240101T000000Z');
  fs.mkdirSync(oldRun, { recursive: true });
  fs.writeFileSync(path.join(oldRun, 'metrics.json'), '{}');
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  touchDir(oldRun, eightDaysAgo);
  touchDir(oldSha, eightDaysAgo);

  // Oversized run (size pruning)
  const heavyRun = path.join(fixtureRoot, 'sha-heavy', '20250924T000000Z');
  fs.mkdirSync(heavyRun, { recursive: true });
  const largeFile = path.join(heavyRun, 'large.bin');
  fs.writeFileSync(largeFile, Buffer.alloc(3 * 1024 * 1024)); // 3 MB

  // Fresh run (should remain)
  const freshRun = path.join(fixtureRoot, 'sha-fresh', '20250924T193704Z');
  fs.mkdirSync(freshRun, { recursive: true });
  fs.writeFileSync(path.join(freshRun, 'metrics.json'), '{}');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

function main() {
  resetFixture();
  createFixture();

  const env = {
    ...process.env,
    BMAD_REVIEWER_CACHE_ROOT: fixtureRoot,
    BMAD_REVIEWER_CACHE_MAX_AGE_DAYS: '7',
    BMAD_REVIEWER_CACHE_MAX_MB: '2',
  };

  const result = spawnSync('node', ['tools/reviewer/prune-cache.js'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error('prune-cache.js exited with non-zero status');
    process.exit(result.status || 1);
  }

  const oldRunParent = path.join(fixtureRoot, 'sha-old');
  const heavyRunParent = path.join(fixtureRoot, 'sha-heavy');
  const freshRunParent = path.join(fixtureRoot, 'sha-fresh');

  assert(!fs.existsSync(oldRunParent), 'Expected age-pruned run to be removed');
  assert(!fs.existsSync(heavyRunParent), 'Expected size-pruned run to be removed');
  assert(fs.existsSync(freshRunParent), 'Expected fresh run to remain after pruning');

  console.log('Prune cache test passed.');
}

main();
