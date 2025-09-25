const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT_SOURCE = path.join(__dirname, '..', 'implement-fork-friendly-ci.sh');

async function createFixtureWorkflow(rootDir, filename, contents) {
  const workflowsDir = path.join(rootDir, '.github', 'workflows');
  await fs.ensureDir(workflowsDir);
  await fs.writeFile(path.join(workflowsDir, filename), contents);
}

describe('implement-fork-friendly-ci.sh', () => {
  let tmpDir;
  let scriptPath;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fork-friendly-ci-'));
    const toolsDir = path.join(tmpDir, 'tools');
    await fs.ensureDir(toolsDir);
    scriptPath = path.join(toolsDir, 'implement-fork-friendly-ci.sh');
    await fs.copyFile(SCRIPT_SOURCE, scriptPath);
    await fs.chmod(scriptPath, 0o755);
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.remove(tmpDir);
    }
  });

  test('adds fork guard when job lacks condition', async () => {
    await createFixtureWorkflow(
      tmpDir,
      'ci.yml',
      `name: CI\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n`,
    );

    const result = spawnSync('bash', [scriptPath], {
      cwd: tmpDir,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });

    expect(result.status).toBe(0);
    const updated = await fs.readFile(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(updated).toContain(
      "if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.fork != true || vars.ENABLE_CI_IN_FORK == 'true'",
    );
  });

  test('flags manual review when incompatible condition exists', async () => {
    await createFixtureWorkflow(
      tmpDir,
      'manual.yml',
      `name: Manual\non:\n  pull_request:\njobs:\n  lint:\n    if: always()\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo lint\n`,
    );

    const result = spawnSync('bash', [scriptPath], {
      cwd: tmpDir,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });

    expect(result.status).toBe(0);
    const workflow = await fs.readFile(path.join(tmpDir, '.github', 'workflows', 'manual.yml'), 'utf8');
    expect(workflow).toContain('if: always()');
    const summary = result.stdout || '';
    expect(summary.includes('manual review')).toBe(true);
  });
});
