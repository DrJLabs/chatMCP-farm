#!/usr/bin/env node

/**
 * BMad Method CLI - Direct execution wrapper for npx
 * This file ensures proper execution when run via npx from GitHub
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

// Check if we're running in an npx temporary directory
const isNpxExecution = __dirname.includes('_npx') || __dirname.includes('.npm');

// If running via npx, we need to handle things differently
if (isNpxExecution) {
  const arguments_ = process.argv.slice(2);

  // Use the installer for all commands
  const bmadScriptPath = path.join(__dirname, 'installer', 'bin', 'bmad.js');

  if (!fs.existsSync(bmadScriptPath)) {
    console.error('Error: Could not find bmad.js at', bmadScriptPath);
    console.error('Current directory:', __dirname);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [bmadScriptPath, ...arguments_], {
    stdio: 'inherit',
    cwd: path.dirname(__dirname),
  });

  if (result.error) {
    console.error('Error executing bmad.js:', result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
} else {
  // Local execution - use installer for all commands
  require('./installer/bin/bmad.js');
}
