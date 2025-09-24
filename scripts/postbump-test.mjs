import { spawnSync } from 'node:child_process';
import process from 'node:process';

const MIN_MAJOR = 20;
const MIN_MINOR = 19;

/**
 * Determine whether a dot-separated Node.js version string meets the minimum supported version.
 *
 * Parses the `major` and `minor` components from `versionString` (format "major.minor[.patch]").
 * Returns true when the major version is greater than MIN_MAJOR, or when the major equals MIN_MAJOR
 * and the minor is greater than or equal to MIN_MINOR. If the major or minor components are not
 * numeric, the function returns false.
 *
 * @param {string} versionString - Version string to evaluate, e.g. "20.19.0" or "20.19".
 * @returns {boolean} True if the version is >= MIN_MAJOR.MIN_MINOR, otherwise false.
 */
function versionIsSupported(versionString) {
  const [majorStr, minorStr = '0'] = versionString.split('.', 3);
  const major = Number.parseInt(majorStr, 10);
  const minor = Number.parseInt(minorStr, 10);
  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return false;
  }
  if (major > MIN_MAJOR) {
    return true;
  }
  if (major < MIN_MAJOR) {
    return false;
  }
  return minor >= MIN_MINOR;
}

const versionString = process.env.POSTBUMP_NODE_VERSION ?? process.versions.node;

if (!versionIsSupported(versionString)) {
  console.error(
    `postbump:test requires Node.js ${MIN_MAJOR}.${MIN_MINOR}.0 or newer (workspace standard is >=22). ` +
      `Detected ${versionString}. Please upgrade your runtime before running dependency regression checks.`
  );
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(
  npmBinary,
  ['run', 'test', '--workspaces', '--if-present', ...extraArgs],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'test' }
  }
);

if (result.error) {
  console.error('Failed to execute workspace tests:', result.error.message);
  process.exit(result.status ?? 1);
}

process.exit(result.status ?? 0);
