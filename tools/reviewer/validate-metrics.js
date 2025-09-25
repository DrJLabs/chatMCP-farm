const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const artifactRoot = path.join(repoRoot, 'artifacts', 'reviewer');

function usage() {
  console.log('Usage: node tools/reviewer/validate-metrics.js [--file <metrics.json>]');
  console.log('Validates reviewer metrics structure and runtime thresholds.');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let file;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      if (i + 1 >= args.length) {
        throw new Error('Missing value for --file');
      }
      file = args[i + 1];
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { file };
}

function isDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function findLatestMetrics() {
  if (!isDirectory(artifactRoot)) {
    throw new Error(`Artifacts directory not found: ${path.relative(repoRoot, artifactRoot)}`);
  }
  const runs = fs
    .readdirSync(artifactRoot)
    .map((name) => ({
      name,
      dir: path.join(artifactRoot, name),
      metrics: path.join(artifactRoot, name, 'metrics.json'),
    }))
    .filter((entry) => isDirectory(entry.dir) && fs.existsSync(entry.metrics));
  if (runs.length === 0) {
    throw new Error('No reviewer artifacts with metrics.json found.');
  }
  runs.sort((a, b) => (a.name < b.name ? 1 : -1));
  return runs[0].metrics;
}

function readMetrics(filePath) {
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  const data = fs.readFileSync(resolved, 'utf8');
  try {
    const parsed = JSON.parse(data);
    return { parsed, resolved };
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function ensure(condition, message, errors) {
  if (!condition) {
    errors.push(message);
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateMetricsShape(metrics) {
  const errors = [];
  ensure(
    typeof metrics.generatedAt === 'string' && metrics.generatedAt.length > 0,
    'generatedAt must be a non-empty string',
    errors,
  );
  ensure(
    typeof metrics.repo === 'string' && metrics.repo.length > 0,
    'repo must be a non-empty string',
    errors,
  );
  ensure(
    typeof metrics.gitSha === 'string' && metrics.gitSha.length > 0,
    'gitSha must be a non-empty string',
    errors,
  );

  ensure(metrics.run && typeof metrics.run === 'object', 'run block missing', errors);
  if (metrics.run && typeof metrics.run === 'object') {
    ensure(
      typeof metrics.run.timestamp === 'string' && metrics.run.timestamp.length > 0,
      'run.timestamp must be set',
      errors,
    );
    ensure(
      typeof metrics.run.cacheDir === 'string' && metrics.run.cacheDir.length > 0,
      'run.cacheDir must be set',
      errors,
    );
    ensure(
      typeof metrics.run.artifactDir === 'string' && metrics.run.artifactDir.length > 0,
      'run.artifactDir must be set',
      errors,
    );
    ensure(
      typeof metrics.run.baselineCommit === 'string' && metrics.run.baselineCommit.length > 0,
      'run.baselineCommit must be set',
      errors,
    );
  }

  ensure(
    metrics.durations && typeof metrics.durations === 'object',
    'durations block missing',
    errors,
  );
  if (metrics.durations && typeof metrics.durations === 'object') {
    ensure(
      isFiniteNumber(metrics.durations.semgrepSeconds),
      'durations.semgrepSeconds must be numeric',
      errors,
    );
    ensure(
      isFiniteNumber(metrics.durations.jscpdSeconds),
      'durations.jscpdSeconds must be numeric',
      errors,
    );
    ensure(
      isFiniteNumber(metrics.durations.churnSeconds),
      'durations.churnSeconds must be numeric',
      errors,
    );
  }

  ensure(metrics.semgrep && typeof metrics.semgrep === 'object', 'semgrep block missing', errors);
  if (metrics.semgrep && typeof metrics.semgrep === 'object') {
    ensure(
      typeof metrics.semgrep.version === 'string' && metrics.semgrep.version.length > 0,
      'semgrep.version must be set',
      errors,
    );
    ensure(
      Number.isInteger(metrics.semgrep.findings) && metrics.semgrep.findings >= 0,
      'semgrep.findings must be a non-negative integer',
      errors,
    );
  }

  ensure(metrics.jscpd && typeof metrics.jscpd === 'object', 'jscpd block missing', errors);
  if (metrics.jscpd && typeof metrics.jscpd === 'object') {
    ensure(
      typeof metrics.jscpd.version === 'string' && metrics.jscpd.version.length > 0,
      'jscpd.version must be set',
      errors,
    );
    ensure(
      Number.isInteger(metrics.jscpd.duplicates) && metrics.jscpd.duplicates >= 0,
      'jscpd.duplicates must be a non-negative integer',
      errors,
    );
  }

  ensure(
    metrics.diffCoverage && typeof metrics.diffCoverage === 'object',
    'diffCoverage block missing',
    errors,
  );
  if (metrics.diffCoverage && typeof metrics.diffCoverage === 'object') {
    ensure(
      Number.isInteger(metrics.diffCoverage.filesChanged) && metrics.diffCoverage.filesChanged >= 0,
      'diffCoverage.filesChanged must be a non-negative integer',
      errors,
    );
    ensure(
      Number.isInteger(metrics.diffCoverage.additions) && metrics.diffCoverage.additions >= 0,
      'diffCoverage.additions must be a non-negative integer',
      errors,
    );
    ensure(
      Number.isInteger(metrics.diffCoverage.deletions) && metrics.diffCoverage.deletions >= 0,
      'diffCoverage.deletions must be a non-negative integer',
      errors,
    );
  }

  ensure(metrics.cache && typeof metrics.cache === 'object', 'cache block missing', errors);
  if (metrics.cache && typeof metrics.cache === 'object') {
    ensure(
      typeof metrics.cache.path === 'string' && metrics.cache.path.length > 0,
      'cache.path must be set',
      errors,
    );
    ensure(
      isFiniteNumber(metrics.cache.sizeMB) && metrics.cache.sizeMB >= 0,
      'cache.sizeMB must be a non-negative number',
      errors,
    );
  }

  return errors;
}

function validateThresholds(metrics) {
  const errors = [];
  const totalRuntime =
    (metrics.durations?.semgrepSeconds || 0) +
    (metrics.durations?.jscpdSeconds || 0) +
    (metrics.durations?.churnSeconds || 0);
  if (totalRuntime > 300) {
    errors.push(`Total runtime ${totalRuntime.toFixed(2)}s exceeds 300s limit`);
  }
  if ((metrics.cache?.sizeMB || 0) > 250) {
    errors.push(`Cache size ${metrics.cache.sizeMB}MB exceeds 250MB limit`);
  }
  return errors;
}

function main() {
  const { file } = parseArgs(process.argv);
  const target = file || findLatestMetrics();
  const { parsed: metrics, resolved } = readMetrics(target);

  const structuralErrors = validateMetricsShape(metrics);
  const thresholdErrors = validateThresholds(metrics);
  const errors = [...structuralErrors, ...thresholdErrors];

  if (errors.length > 0) {
    console.error(`Metrics validation failed for ${path.relative(repoRoot, resolved)}:`);
    for (const err of errors) {
      console.error(`- ${err}`);
    }
    process.exit(1);
  }

  console.log(`Metrics validation passed for ${path.relative(repoRoot, resolved)}`);
  console.log(
    `Runtime total: ${(
      (metrics.durations?.semgrepSeconds || 0) +
      (metrics.durations?.jscpdSeconds || 0) +
      (metrics.durations?.churnSeconds || 0)
    ).toFixed(2)}s, cache usage: ${(metrics.cache?.sizeMB || 0).toFixed(2)}MB.`,
  );
}

main();
