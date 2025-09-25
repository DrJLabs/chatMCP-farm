const fs = require('node:fs');
const path = require('node:path');

const checks = [
  {
    file: 'docs/bmad/focused-epics/reviewer-agent/story-3-test-design.md',
    mustContain: [
      'artifacts/reviewer/<timestamp>/report.md',
      'artifacts/reviewer/<timestamp>/report.sarif',
      'artifacts/reviewer/<timestamp>/report.json',
      'artifacts/reviewer/<timestamp>/metrics.json',
      'docs/bmad/issues/reviewer-rollout.md',
    ],
  },
  {
    file: 'docs/bmad/focused-epics/reviewer-agent/story-3-risk-profile.md',
    mustContain: [
      'artifacts/reviewer/<timestamp>/report.md',
      'artifacts/reviewer/<timestamp>/report.sarif',
      'artifacts/reviewer/<timestamp>/report.json',
      'artifacts/reviewer/<timestamp>/metrics.json',
    ],
  },
];

function fail(message) {
  console.error(`\u001B[31m${message}\u001B[0m`);
  process.exitCode = 1;
}

for (const check of checks) {
  const filePath = path.resolve(check.file);
  if (!fs.existsSync(filePath)) {
    fail(`File missing: ${check.file}`);
    continue;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const fragment of check.mustContain) {
    if (!content.includes(fragment)) {
      fail(`Missing text "${fragment}" in ${check.file}`);
    }
  }
}

if (process.exitCode) {
  process.exit(1);
}
