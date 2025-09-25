import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function usage() {
  console.log(
    `Usage: npm run reviewer:telemetry-sync -- --metrics <file|dir> [--tracker <markdown>] [options]\n\nOptions:\n  --report <file>          Optional reviewer report JSON for severity metrics\n  --mode <name>            Reviewer execution mode (default, strict, etc.)\n  --run-id <id>            Override run identifier (defaults to GITHUB_RUN_ID or metrics timestamp)\n  --repo <name>            Override repository name (defaults to metrics.repo or GITHUB_REPOSITORY)\n  --tracker <markdown>     Override tracker path (defaults to reviewer.telemetryTracker in core-config)\n  --dry-run                Print the computed row without editing the tracker\n  --help                   Show this message\n`,
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = { dryRun: false };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--metrics': {
        options.metrics = requireOptionValue(args, i, arg);
        i += 1;
        break;
      }
      case '--tracker': {
        options.tracker = requireOptionValue(args, i, arg);
        i += 1;
        break;
      }
      case '--report': {
        options.report = requireOptionValue(args, i, arg);
        i += 1;
        break;
      }
      case '--mode': {
        options.mode = requireOptionValue(args, i, arg);
        i += 1;
        break;
      }
      case '--run-id': {
        options.runId = requireOptionValue(args, i, arg);
        i += 1;
        break;
      }
      case '--repo': {
        options.repo = requireOptionValue(args, i, arg);
        i += 1;
        break;
      }
      case '--dry-run': {
        options.dryRun = true;
        break;
      }
      case '--help':
      case '-h': {
        options.help = true;
        break;
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }
  return options;
}

function requireOptionValue(args, index, flag) {
  if (index + 1 >= args.length) {
    throw new Error(`Missing value for argument: '${flag}'`);
  }
  return args[index + 1];
}

function resolvePath(input) {
  if (!input) return null;
  return path.isAbsolute(input) ? input : path.join(repoRoot, input);
}

function loadCoreConfig() {
  const configPath = path.join(repoRoot, '.bmad-core', 'core-config.yaml');
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const contents = fs.readFileSync(configPath, 'utf8');
    return yaml.load(contents) || {};
  } catch (error) {
    console.warn(`Could not parse ${path.relative(repoRoot, configPath)}: ${error.message}`);
    return {};
  }
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function latestMetricsFromDir(dir) {
  const direct = path.join(dir, 'metrics.json');
  if (fs.existsSync(direct)) {
    return direct;
  }
  const entries = fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((entry) => fs.statSync(entry).isDirectory())
    .map((entry) => ({
      dir: entry,
      metrics: path.join(entry, 'metrics.json'),
    }))
    .filter((candidate) => fs.existsSync(candidate.metrics));
  if (entries.length === 0) {
    throw new Error(`No metrics.json found under ${path.relative(repoRoot, dir)}`);
  }
  entries.sort((a, b) => (a.dir < b.dir ? 1 : -1));
  return entries[0].metrics;
}

function resolveTrackerCandidate(options, config) {
  if (options.tracker) {
    const candidate = resolvePath(options.tracker);
    if (candidate) {
      return candidate;
    }
  }
  const configTracker = config?.reviewer?.telemetryTracker;
  if (configTracker) {
    const candidate = resolvePath(configTracker);
    if (candidate) {
      return candidate;
    }
  }
  return resolvePath('docs/bmad/issues/reviewer-rollout.md');
}

function ensureFile(filePath, description) {
  if (!filePath) {
    throw new Error(`Missing required ${description}`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} not found: ${path.relative(repoRoot, filePath)}`);
  }
  return filePath;
}

function readJson(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path.relative(repoRoot, filePath)}: ${error.message}`);
  }
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function inferMode(options, metricsPath) {
  if (options.mode) return options.mode;
  if (process.env.BMAD_REVIEWER_MODE) return process.env.BMAD_REVIEWER_MODE;
  const normalizedPath = toPosix(path.relative(repoRoot, metricsPath));
  if (normalizedPath.includes('/strict/')) return 'strict';
  if (normalizedPath.includes('/default/')) return 'default';
  return 'default';
}

function inferRunId(options, metricsData) {
  if (options.runId) return options.runId;
  if (process.env.GITHUB_RUN_ID) return process.env.GITHUB_RUN_ID;
  return metricsData.run?.timestamp || new Date().toISOString();
}

function inferRepo(options, metricsData) {
  if (options.repo) return options.repo;
  if (process.env.BMAD_REVIEWER_REPO) return process.env.BMAD_REVIEWER_REPO;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return metricsData.repo || path.basename(repoRoot);
}

function findReportPath(options, metricsPath) {
  if (options.report) {
    const candidate = resolvePath(options.report);
    if (!fs.existsSync(candidate)) {
      throw new Error(`report file not found: ${path.relative(repoRoot, candidate)}`);
    }
    return candidate;
  }
  const dir = path.dirname(metricsPath);
  const reportJson = path.join(dir, 'report.json');
  if (fs.existsSync(reportJson)) return reportJson;
  return null;
}

function countHighFindings(report) {
  if (!report) return null;
  if (Array.isArray(report.findings)) {
    return report.findings.filter((item) => {
      const severity = (item.severity || item.level || '').toString().toUpperCase();
      return ['HIGH', 'CRITICAL'].includes(severity);
    }).length;
  }
  if (report.summary && typeof report.summary.highSeverityCount === 'number') {
    return report.summary.highSeverityCount;
  }
  if (report.metrics && typeof report.metrics.highSeverityCount === 'number') {
    return report.metrics.highSeverityCount;
  }
  return null;
}

function extractFalsePositiveRate(report) {
  if (!report) return null;
  const candidates = [
    report.falsePositiveRate,
    report.metrics?.falsePositiveRate,
    report.summary?.falsePositiveRate,
    report.telemetry?.falsePositiveRate,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function computeRuntime(metrics) {
  if (typeof metrics.runtimeSeconds === 'number') {
    return metrics.runtimeSeconds;
  }
  const durations = metrics.durations || {};
  return ['semgrepSeconds', 'jscpdSeconds', 'churnSeconds']
    .map((key) => Number(durations[key]) || 0)
    .reduce((sum, value) => sum + value, 0);
}

function formatNumber(value, fractionDigits = 2) {
  return Number(value || 0).toFixed(fractionDigits);
}

function buildReportLink({ repo, runId, linkTarget }) {
  if (repo && runId) {
    const server = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
    return `${server}/${repo}/actions/runs/${runId}`;
  }
  return linkTarget || 'N/A';
}

function updateTelemetryTable(trackerPath, row) {
  const content = fs.readFileSync(trackerPath, 'utf8');
  const lines = content.split('\n');
  const headerIndex = lines.findIndex((line) => line.startsWith('| run_id'));
  if (headerIndex === -1 || headerIndex + 1 >= lines.length) {
    throw new Error('Telemetry Runs table header not found in tracker.');
  }
  let dataEnd = headerIndex + 2;
  while (dataEnd < lines.length && lines[dataEnd].startsWith('|')) {
    dataEnd += 1;
  }
  const existingRows = lines
    .slice(headerIndex + 2, dataEnd)
    .filter((line) => line.trim().length > 0);
  const sanitizedExisting = existingRows.filter((line) => !line.includes(`| ${row.runId} |`));
  const withoutSeed = sanitizedExisting.filter((line) => !line.includes('| _seed_ '));
  const finalRows = [row.toString(), ...withoutSeed];
  const nextLines = lines.slice(dataEnd);
  const updated = [...lines.slice(0, headerIndex + 2), ...finalRows, ...nextLines].join('\n');
  fs.writeFileSync(trackerPath, updated);
}

function main() {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      usage();
      return;
    }
    const coreConfig = loadCoreConfig();
    const metricsInput = options.metrics || 'artifacts/reviewer/metrics.json';
    let metricsPath = resolvePath(metricsInput);
    if (!metricsPath) {
      throw new Error('Metrics path not provided.');
    }
    if (!fs.existsSync(metricsPath)) {
      if (isDirectory(metricsPath)) {
        metricsPath = latestMetricsFromDir(metricsPath);
      } else {
        throw new Error(`Metrics not found: ${path.relative(repoRoot, metricsPath)}`);
      }
    } else if (isDirectory(metricsPath)) {
      metricsPath = latestMetricsFromDir(metricsPath);
    }

    ensureFile(metricsPath, 'metrics file');
    const metrics = readJson(metricsPath);
    const trackerCandidate = resolveTrackerCandidate(options, coreConfig);
    const trackerPath = ensureFile(trackerCandidate, 'tracker file');

    const repo = inferRepo(options, metrics);
    const runId = inferRunId(options, metrics);
    const mode = inferMode(options, metricsPath);

    const reportPath = findReportPath(options, metricsPath);
    const report = reportPath ? readJson(reportPath) : null;
    const highFindings = countHighFindings(report);
    const falsePositiveRate = extractFalsePositiveRate(report);

    const runtimeSeconds = computeRuntime(metrics);
    const reportMdPath = reportPath ? path.join(path.dirname(reportPath), 'report.md') : null;
    const linkTarget =
      reportMdPath && fs.existsSync(reportMdPath) ? reportMdPath : reportPath || metricsPath;
    const relativeLink = toPosix(path.relative(repoRoot, linkTarget));
    const reportLink = buildReportLink({ repo, runId, linkTarget: relativeLink });

    const row = {
      runId,
      repo,
      mode,
      runtime: formatNumber(runtimeSeconds),
      highFindings:
        typeof highFindings === 'number' ? highFindings : (metrics.semgrep?.findings ?? 0),
      falsePositiveRate: formatNumber(
        typeof falsePositiveRate === 'number' ? falsePositiveRate : 0,
      ),
      reportLink,
      toString() {
        return `| ${this.runId} | ${this.repo} | ${this.mode} | ${this.runtime} | ${this.highFindings} | ${this.falsePositiveRate} | ${this.reportLink} |`;
      },
    };

    if (options.dryRun) {
      console.log(row.toString());
      return;
    }

    updateTelemetryTable(trackerPath, row);
    console.log(
      `Appended telemetry row for ${row.runId} to ${path.relative(repoRoot, trackerPath)}`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
