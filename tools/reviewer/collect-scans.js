const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const cacheRoot = path.join(repoRoot, '.bmad-cache', 'reviewer');
const artifactRoot = path.join(repoRoot, 'artifacts', 'reviewer');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readCommandOutput(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...options });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed with exit code ${result.status}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function getGitSha() {
  return readCommandOutput('git', ['rev-parse', '--short', 'HEAD']);
}

function getBaselineCommit() {
  if (process.env.SEMGREP_BASELINE_COMMIT) {
    return process.env.SEMGREP_BASELINE_COMMIT;
  }
  try {
    return readCommandOutput('git', ['merge-base', 'HEAD', 'origin/main']);
  } catch {
    try {
      return readCommandOutput('git', ['rev-parse', 'HEAD~1']);
    } catch {
      return readCommandOutput('git', ['rev-parse', 'HEAD']);
    }
  }
}

function timestamp() {
  return new Date().toISOString().replaceAll('-', '').replaceAll(':', '').split('.')[0] + 'Z';
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function directorySizeMB(dir) {
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
  return Number((total / (1024 * 1024)).toFixed(2));
}

function runCommand(bin, args, logStream, label, options = {}) {
  const start = Date.now();
  const result = spawnSync(bin, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const durationMs = Date.now() - start;
  const entry = {
    ts: new Date().toISOString(),
    command: [bin, ...args],
    status: result.status,
    durationMs,
  };
  if (result.stdout && result.stdout.length > 0) {
    entry.stdout = result.stdout.trim().split('\n').slice(0, 20);
  }
  if (result.stderr && result.stderr.length > 0) {
    entry.stderr = result.stderr.trim().split('\n').slice(0, 20);
  }
  fs.appendFileSync(logStream, JSON.stringify(entry) + '\n');
  if (result.error) throw result.error;
  const allowed = options.allowedExitCodes || [0];
  if (!allowed.includes(result.status)) {
    throw new Error(
      `Command ${bin} ${args.join(' ')} failed with exit code ${result.status}\n${result.stderr}`,
    );
  }
  const trimmedStdout = result.stdout ? result.stdout.trim() : '';
  return { durationMs, stdout: trimmedStdout, status: result.status };
}

function getSemgrepVersion(bin) {
  const output = readCommandOutput(bin, ['--version']);
  const parts = output.split(/\s+/);
  return parts.at(-1);
}

function getJscpdVersion(bin, baseArgs) {
  if (bin === 'npx') {
    const args = [...baseArgs, '--version'];
    const output = readCommandOutput(bin, args);
    return output.split(/\s+/).at(-1);
  }
  const output = readCommandOutput(bin, ['--version']);
  return output.split(/\s+/).at(-1);
}

function collectChurn(days, outputFile) {
  const logOutput = readCommandOutput('git', [
    'log',
    `--since=${days}.days`,
    '--numstat',
    '--pretty=format:commit %H',
  ]);
  const files = new Map();
  for (const line of logOutput.split('\n')) {
    if (!line || line.startsWith('commit ')) continue;
    const parts = line.split('\t');
    if (parts.length !== 3) continue;
    const [add, del, file] = parts;
    if (add === '-' || del === '-') continue; // binary
    const key = file.trim();
    const entry = files.get(key) || { additions: 0, deletions: 0, touches: 0 };
    entry.additions += Number(add);
    entry.deletions += Number(del);
    entry.touches += 1;
    files.set(key, entry);
  }
  const churn = [...files.entries()]
    .map(([file, stats]) => ({ file, ...stats }))
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
  writeJson(outputFile, {
    generatedAt: new Date().toISOString(),
    repo: path.basename(repoRoot),
    sinceDays: days,
    files: churn,
  });
}

function diffCoverage() {
  const diff = readCommandOutput('git', ['diff', '--numstat', 'HEAD']);
  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;
  if (!diff) {
    return { filesChanged, additions, deletions };
  }
  for (const line of diff.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3) continue;
    const [add, del] = parts;
    if (add === '-' || del === '-') continue;
    filesChanged += 1;
    additions += Number(add);
    deletions += Number(del);
  }
  return { filesChanged, additions, deletions };
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function main() {
  const gitSha = getGitSha();
  const runTimestamp = timestamp();
  const cacheShaDir = path.join(cacheRoot, gitSha);
  const runCacheDir = path.join(cacheShaDir, runTimestamp);
  const runArtifactDir = path.join(artifactRoot, runTimestamp);
  ensureDir(runCacheDir);
  ensureDir(runArtifactDir);

  const logFile = path.join(runCacheDir, 'log.jsonl');
  fs.writeFileSync(logFile, '');

  const semgrepBin = process.env.SEMgrep_BIN || 'semgrep';
  const jscpdBin = process.env.JSCPD_BIN || 'npx';
  const jscpdBaseArgs = process.env.JSCPD_BIN ? [] : ['--yes', 'jscpd@^3.5.4'];

  const semgrepVersion = getSemgrepVersion(semgrepBin);
  const jscpdVersion = getJscpdVersion(jscpdBin, jscpdBaseArgs);

  const semgrepJson = path.join(runCacheDir, 'semgrep.json');
  const semgrepSarif = path.join(runCacheDir, 'semgrep.sarif');
  const semgrepConfig = path.join(repoRoot, 'tools', 'reviewer', 'semgrep.yaml');
  const baselineCommit = getBaselineCommit();
  const semgrepArgsJson = [
    'scan',
    '--config',
    'auto',
    '--config',
    semgrepConfig,
    '--baseline-commit',
    baselineCommit,
    '--json',
    '--output',
    semgrepJson,
  ];
  const semgrepArgsSarif = [
    'scan',
    '--config',
    'auto',
    '--config',
    semgrepConfig,
    '--baseline-commit',
    baselineCommit,
    '--sarif',
    '--output',
    semgrepSarif,
  ];
  const semgrepAllowedCodes = [0, 1, 2, 3, 4, 7];
  const semgrepRunJson = runCommand(semgrepBin, semgrepArgsJson, logFile, 'semgrep-json', {
    allowedExitCodes: semgrepAllowedCodes,
  });
  const semgrepRunSarif = runCommand(semgrepBin, semgrepArgsSarif, logFile, 'semgrep-sarif', {
    allowedExitCodes: semgrepAllowedCodes,
  });

  const jscpdOutputDir = path.join(runCacheDir, 'jscpd');
  ensureDir(jscpdOutputDir);
  const jscpdConfig = path.join(repoRoot, 'tools', 'reviewer', 'jscpd.json');
  const jscpdArgs = [
    ...jscpdBaseArgs,
    '--reporters',
    'json',
    '--output',
    jscpdOutputDir,
    '--threshold',
    '60',
    '--gitignore',
    '--config',
    jscpdConfig,
  ];
  const jscpdRun = runCommand(jscpdBin, jscpdArgs, logFile, 'jscpd');
  const jscpdReportPath = path.join(jscpdOutputDir, 'jscpd-report.json');

  const churnStart = Date.now();
  collectChurn(30, path.join(runCacheDir, 'churn.json'));
  const churnRunSeconds = Number(((Date.now() - churnStart) / 1000).toFixed(2));

  const semgrepResults = JSON.parse(fs.readFileSync(semgrepJson, 'utf8'));
  const jscpdReport = fs.existsSync(jscpdReportPath)
    ? JSON.parse(fs.readFileSync(jscpdReportPath, 'utf8'))
    : { statistics: { total: { clones: 0 } } };

  const semgrepSeconds = Number(
    ((semgrepRunJson.durationMs + semgrepRunSarif.durationMs) / 1000).toFixed(2),
  );
  const jscpdSeconds = Number((jscpdRun.durationMs / 1000).toFixed(2));
  const totalRuntimeSeconds = Number((semgrepSeconds + jscpdSeconds + churnRunSeconds).toFixed(2));
  const cacheSizeMB = directorySizeMB(cacheShaDir);
  const alerts = [];
  if (totalRuntimeSeconds > 180) {
    alerts.push({
      type: 'runtime',
      level: 'warning',
      message: `Total runtime ${totalRuntimeSeconds}s exceeds 180s target`,
    });
  }
  if (cacheSizeMB > 250) {
    alerts.push({
      type: 'cache',
      level: 'warning',
      message: `Cache footprint ${cacheSizeMB}MB exceeds 250MB limit`,
    });
  }

  const metrics = {
    generatedAt: new Date().toISOString(),
    repo: path.basename(repoRoot),
    gitSha,
    run: {
      timestamp: runTimestamp,
      cacheDir: path.relative(repoRoot, runCacheDir),
      artifactDir: path.relative(repoRoot, runArtifactDir),
      baselineCommit,
    },
    durations: {
      semgrepSeconds,
      jscpdSeconds,
      churnSeconds: churnRunSeconds,
    },
    runtimeSeconds: totalRuntimeSeconds,
    semgrep: {
      version: semgrepVersion,
      findings: Array.isArray(semgrepResults.results) ? semgrepResults.results.length : 0,
    },
    jscpd: {
      version: jscpdVersion,
      duplicates: jscpdReport.statistics?.total?.clones ?? 0,
    },
    diffCoverage: diffCoverage(),
    cache: {
      path: path.relative(repoRoot, cacheShaDir),
      sizeMB: cacheSizeMB,
    },
  };
  if (alerts.length > 0) {
    metrics.alerts = alerts;
  }

  writeJson(path.join(runCacheDir, 'metrics.json'), metrics);

  copyRecursive(runCacheDir, runArtifactDir);
  console.log(`Reviewer scan artifacts written to ${path.relative(repoRoot, runArtifactDir)}`);
}

main();
