const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const yaml = require('js-yaml');

const repoRoot = path.resolve(__dirname, '..', '..');

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function loadYaml(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  return yaml.load(contents) || {};
}

function requireValue(args, index, arg) {
  if (index + 1 >= args.length) {
    throw new Error(`Missing value for argument: ${arg}`);
  }
  return args[index + 1];
}

function resolveConfig(options = {}) {
  const configPath = options.configPath || path.join(repoRoot, '.bmad-core', 'core-config.yaml');
  const config = loadYaml(configPath);
  const reviewerConfig = config.reviewer || {};

  const baseEnabled = parseBool(reviewerConfig.enabled);
  const baseStrict = parseBool(reviewerConfig.strict);
  const skipTrivialDiff = parseBool(
    reviewerConfig.skipTrivialDiff ?? reviewerConfig.skip_trivial_diff,
  );

  const envSkip = parseBool(process.env.BMAD_REVIEWER_SKIP);
  const envStrict = parseBool(process.env.BMAD_REVIEWER_STRICT);

  // Story override support (optional)
  let storyOverrideSkip = false;
  if (options.storyPath) {
    try {
      const storyData = fs.readFileSync(options.storyPath, 'utf8');
      const overrideKey = reviewerConfig.perStoryOverrideKey || '';
      if (overrideKey) {
        // naive YAML frontmatter parser
        const frontmatterMatch = storyData.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const meta = yaml.load(frontmatterMatch[1]) || {};
          const overrideSegments = overrideKey.split('.');
          let current = meta;
          for (const segment of overrideSegments) {
            if (!current || typeof current !== 'object') break;
            current = current[segment];
          }
          storyOverrideSkip = parseBool(current);
        }
      }
    } catch (error) {
      if (!options.ignoreStoryErrors) {
        throw error;
      }
    }
  }

  const effectiveSkip = !baseEnabled || envSkip || storyOverrideSkip;
  const shouldRun = baseEnabled && !effectiveSkip;
  const strictMode = envStrict || baseStrict;

  return {
    configPath,
    enabled: baseEnabled,
    strictConfigured: baseStrict,
    skipTrivialDiff,
    env: {
      skip: envSkip,
      strict: envStrict,
    },
    storyOverrideSkip,
    shouldRun,
    strictMode,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--config':
      case '--config-path': {
        const value = requireValue(args, i, arg);
        options.configPath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
        i += 1;
        break;
      }
      case '--story': {
        const value = requireValue(args, i, arg);
        options.storyPath = path.isAbsolute(value) ? value : path.join(repoRoot, value);
        i += 1;
        break;
      }
      case '--ignore-story-errors': {
        options.ignoreStoryErrors = true;
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

function usage() {
  console.log(
    `Usage: node tools/reviewer/resolve-config.js [--config <path>] [--story <path>] [--ignore-story-errors]\n`,
  );
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv);
    if (options.help) {
      usage();
      process.exit(0);
    }
    const result = resolveConfig(options);
    process.stdout.write(`${JSON.stringify(result)}${os.EOL}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { resolveConfig, parseBool };
