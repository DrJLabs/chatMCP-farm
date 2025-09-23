#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const allowGlobs = [
  /\.keycloak-env(?:\.example)?$/,
  /node_modules\//,
  /package-lock\.json$/,
  /coverage\//,
  /scripts\/check-inline-secrets\.mjs$/
]
const fileContents = new Map()

const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const offenders = []

const isAllowed = file => allowGlobs.some(pattern => pattern.test(file))

for (const file of files) {
  if (isAllowed(file)) continue
  const absPath = resolve(root, file)
  const contents = readFileSync(absPath, 'utf8')
  fileContents.set(file, contents)

  // Match assignments where the value is not an env-substitution ($...)
  // Example: flag hardcoded CLIENT_SECRET values, but ignore references that delegate to $KC_CLIENT_SECRET.
  const clientSecretRegex =
    /\b(?:client_secret|CLIENT_SECRET)\s*=\s*(?:"([^"$\n]*)"|'([^'$\n]*)'|([^\s$'"`]+))/g
  let match
  while ((match = clientSecretRegex.exec(contents)) !== null) {
    offenders.push({ file, index: match.index })
  }

  const flagRegex = /--client-secret\b/g
  while ((match = flagRegex.exec(contents)) !== null) {
    offenders.push({ file, index: match.index })
  }
}

if (offenders.length > 0) {
  const toLineCol = (text, idx) => {
    const pre = text.slice(0, idx).split('\n')
    return { line: pre.length, col: pre[pre.length - 1].length + 1 }
  }
  console.error('Inline client secrets or forbidden flags detected:')
  for (const offender of offenders) {
    const contents = fileContents.get(offender.file) ?? readFileSync(resolve(root, offender.file), 'utf8')
    const { line, col } = toLineCol(contents, offender.index)
    console.error(`- ${offender.file}:${line}:${col} (value redacted)`)
  }
  process.exit(1)
}
