#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const sampleConfigPath = path.join(repoRoot, 'docs', 'config.sample.json');
const localConfigPath = path.join(repoRoot, 'docs', 'local', 'config.local.json');

async function loadJson(filePath) {
  const data = await readFile(filePath, 'utf8');
  return JSON.parse(data);
}

function mergeTemplates(baseTemplates = [], overrideTemplates = []) {
  const merged = [...baseTemplates];
  for (const tpl of overrideTemplates) {
    const existingIndex = merged.findIndex((item) => item.source === tpl.source);
    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], ...tpl };
    } else {
      merged.push(tpl);
    }
  }
  return merged;
}

function renderTemplate(content, variables) {
  return content.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const value = resolveVariable(variables, key.trim());
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
}

function resolveVariable(variables, rawKey) {
  const parts = rawKey.split('.');
  let current = variables;
  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

async function main() {
  if (!existsSync(sampleConfigPath)) {
    console.error('Missing docs/config.sample.json.');
    process.exit(1);
  }

  const sampleConfig = await loadJson(sampleConfigPath);
  let localConfig = { variables: {}, templates: [] };
  if (existsSync(localConfigPath)) {
    localConfig = await loadJson(localConfigPath);
  }

  const variables = {
    ...(sampleConfig.variables || {}),
    ...(localConfig.variables || {}),
  };
  const templates = mergeTemplates(sampleConfig.templates, localConfig.templates);

  if (!templates.length) {
    console.warn('No templates defined.');
    return;
  }

  for (const template of templates) {
    const sourcePath = path.join(repoRoot, template.source);
    const outputPath = path.join(repoRoot, template.output);

    const sourceContent = await readFile(sourcePath, 'utf8');
    const rendered = renderTemplate(sourceContent, variables);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rendered, 'utf8');
    console.log(`Rendered ${template.source} -> ${template.output}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
