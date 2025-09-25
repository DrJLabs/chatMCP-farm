const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function assert(condition, message) {
  if (!condition) {
    console.error(`Assertion failed: ${message}`);
    process.exit(1);
  }
}

function createTempConfig(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-config-'));
  const file = path.join(dir, 'core-config.yaml');
  fs.writeFileSync(file, content);
  return file;
}

function createTempStory(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewer-story-'));
  const file = path.join(dir, 'story.md');
  fs.writeFileSync(file, content);
  return file;
}

function runResolver(configPath, extraEnv = {}, storyPath) {
  const env = {
    ...process.env,
    BMAD_REVIEWER_SKIP: undefined,
    BMAD_REVIEWER_STRICT: undefined,
    ...extraEnv,
  };
  const args = ['tools/reviewer/resolve-config.js', '--config', configPath];
  if (storyPath) {
    args.push('--story', storyPath);
  }
  const result = spawnSync('node', args, {
    cwd: path.resolve(__dirname, '..', '..'),
    env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`resolve-config exited with status ${result.status}`);
  }
  return JSON.parse(result.stdout.trim());
}

function main() {
  const enabledConfig = createTempConfig(
    `reviewer:\n  enabled: true\n  strict: false\n  skipTrivialDiff: true\n`,
  );
  const disabledConfig = createTempConfig(
    `reviewer:\n  enabled: false\n  strict: false\n  skipTrivialDiff: true\n`,
  );
  const strictConfig = createTempConfig(
    `reviewer:\n  enabled: true\n  strict: true\n  skipTrivialDiff: false\n`,
  );
  const overrideConfig = createTempConfig(
    `reviewer:\n  enabled: true\n  strict: false\n  skipTrivialDiff: false\n  perStoryOverrideKey: story.review.override_skip\n`,
  );
  const snakeCaseConfig = createTempConfig(
    `reviewer:\n  enabled: true\n  strict: false\n  skip_trivial_diff: true\n`,
  );

  // Disabled config should never run reviewer
  const disabled = runResolver(disabledConfig);
  assert(disabled.shouldRun === false, 'Expected reviewer to be skipped when disabled in config');

  // Enabled config should run by default
  const enabled = runResolver(enabledConfig);
  assert(enabled.shouldRun === true, 'Expected reviewer to run when enabled and no skip flags set');

  // Skip flag forces skip even when enabled
  const skipEnv = runResolver(enabledConfig, { BMAD_REVIEWER_SKIP: '1' });
  assert(skipEnv.shouldRun === false, 'Expected reviewer to skip when BMAD_REVIEWER_SKIP=1');

  // Strict flag is true when either config or env sets it
  const strictByConfig = runResolver(strictConfig);
  assert(strictByConfig.strictMode === true, 'Expected strictMode=true when config strict=true');

  const strictByEnv = runResolver(enabledConfig, { BMAD_REVIEWER_STRICT: 'true' });
  assert(
    strictByEnv.strictMode === true,
    'Expected strictMode=true when BMAD_REVIEWER_STRICT=true',
  );

  const snakeCase = runResolver(snakeCaseConfig);
  assert(snakeCase.skipTrivialDiff === true, 'Expected snake_case skip flag to be detected');

  const overrideStory = createTempStory(`---\nstory:\n  review:\n    override_skip: true\n---\n`);
  const overrideResult = runResolver(overrideConfig, {}, overrideStory);
  assert(overrideResult.storyOverrideSkip === true, 'Expected story override skip flag to be true');
  assert(
    overrideResult.shouldRun === false,
    'Expected reviewer to skip when story override requests it',
  );

  console.log('Reviewer config toggle tests passed.');
}

main();
