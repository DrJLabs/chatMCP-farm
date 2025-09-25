// Load required modules
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const semver = require('semver');

// Parse CLI arguments
const arguments_ = process.argv.slice(2);
const packId = arguments_[0];
const bumpType = arguments_[1] || 'minor';

const packIdPattern = /^[a-z0-9][a-z0-9-]*$/i;

// Validate arguments
if (!packId || arguments_.length > 2 || !packIdPattern.test(packId)) {
  console.log('Usage: node bump-expansion-version.js <expansion-pack-id> [major|minor|patch]');
  console.log('Default: minor');
  console.log('Example: node bump-expansion-version.js bmad-creator-tools patch');
  if (packId && !packIdPattern.test(packId)) {
    console.log('Error: expansion-pack-id must match /^[a-z0-9][a-z0-9-]*$/i');
  }
  process.exit(1);
}

if (!['major', 'minor', 'patch'].includes(bumpType)) {
  console.error('Error: Bump type must be major, minor, or patch');
  process.exit(1);
}

// Version bump logic
function bumpVersion(currentVersion, type) {
  const coerced = semver.valid(semver.coerce(currentVersion)) || '1.0.0';
  const next = semver.inc(coerced, type);
  return next || coerced;
}

// Main function to bump version
function updateVersion() {
  const configPath = path.join(__dirname, '..', 'expansion-packs', packId, 'config.yaml');

  // Check if config exists
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Expansion pack '${packId}' not found at ${configPath}`);
    console.log('\nAvailable expansion packs:');

    const packsDir = path.join(__dirname, '..', 'expansion-packs');
    if (!fs.existsSync(packsDir)) {
      console.log('  (none found)');
      process.exit(1);
    }
    const entries = fs.readdirSync(packsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        console.log(`  - ${entry.name}`);
      }
    }

    process.exit(1);
  }

  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configContent);

    const oldVersion = config.version || '1.0.0';
    const newVersion = bumpVersion(oldVersion, bumpType);

    config.version = newVersion;

    const updatedYaml = yaml.dump(config, { indent: 2 });
    fs.writeFileSync(configPath, updatedYaml);

    console.log(`✓ ${packId}: ${oldVersion} → ${newVersion}`);
    console.log(`\n✓ Successfully bumped ${packId} with ${bumpType} version bump`);
    console.log('\nNext steps:');
    console.log(`1. Test the changes`);
    console.log(
      `2. Commit: git add -A && git commit -m "chore: bump ${packId} version (${bumpType})"`,
    );
  } catch (error) {
    console.error('Error updating version:', error.message);
    process.exit(1);
  }
}

updateVersion();
