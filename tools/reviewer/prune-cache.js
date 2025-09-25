const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cacheRoot = process.env.BMAD_REVIEWER_CACHE_ROOT
  ? path.resolve(process.env.BMAD_REVIEWER_CACHE_ROOT)
  : path.join(repoRoot, '.bmad-cache', 'reviewer');
const maxAgeDays = Number(process.env.BMAD_REVIEWER_CACHE_MAX_AGE_DAYS || 7);
const maxCacheMB = Number(process.env.BMAD_REVIEWER_CACHE_MAX_MB || 250);

function directorySizeBytes(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
    } else {
      total += stat.size;
    }
  }
  return total;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`Removed ${path.relative(repoRoot, dir)}`);
}

function ensureCacheRoot() {
  if (!fs.existsSync(cacheRoot)) {
    console.log('No reviewer cache found.');
    process.exit(0);
  }
}

function getRunDirectories() {
  const entries = [];
  for (const sha of fs.readdirSync(cacheRoot)) {
    const shaDir = path.join(cacheRoot, sha);
    if (!fs.statSync(shaDir).isDirectory()) continue;
    entries.push({
      path: shaDir,
      sha,
      mtime: fs.statSync(shaDir).mtime,
      size: directorySizeBytes(shaDir),
    });
  }
  return entries;
}

function pruneByAge(entries) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (entry.mtime.getTime() < cutoff) {
      removeDir(entry.path);
      entry.removed = true;
    }
  }
}

function pruneBySize(entries) {
  const active = entries.filter((e) => !e.removed);
  let totalBytes = active.reduce((sum, e) => sum + e.size, 0);
  const maxBytes = maxCacheMB * 1024 * 1024;
  if (totalBytes <= maxBytes) return;
  active.sort((a, b) => a.mtime - b.mtime); // oldest first
  for (const entry of active) {
    if (totalBytes <= maxBytes) break;
    removeDir(entry.path);
    entry.removed = true;
    totalBytes -= entry.size;
  }
}

function summarize(entries) {
  const remaining = entries
    .filter((e) => !e.removed)
    .map((e) => ({
      path: path.relative(repoRoot, e.path),
      sizeMB: Number((e.size / (1024 * 1024)).toFixed(2)),
      lastModified: e.mtime.toISOString(),
    }));
  console.log('\nRemaining cache directories:');
  if (remaining.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const item of remaining) {
    console.log(`  - ${item.path} (${item.sizeMB} MB, last modified ${item.lastModified})`);
  }
  const total = remaining.reduce((sum, e) => sum + e.sizeMB, 0);
  console.log(`\nTotal cache size: ${total.toFixed(2)} MB`);
}

function main() {
  ensureCacheRoot();
  const entries = getRunDirectories();
  if (entries.length === 0) {
    console.log('No reviewer cache entries found.');
    return;
  }
  pruneByAge(entries);
  pruneBySize(entries);
  summarize(entries);
}

main();
