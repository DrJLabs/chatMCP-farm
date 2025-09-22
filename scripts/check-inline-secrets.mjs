#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const allowGlobs = [/\.keycloak-env(?:\.example)?$/, /node_modules\//, /package-lock\.json$/, /coverage\//]

const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)

const offenders = []

const isAllowed = file => allowGlobs.some(pattern => pattern.test(file))

for (const file of files) {
  if (isAllowed(file)) continue
  const absPath = resolve(root, file)
  const contents = readFileSync(absPath, 'utf8')

  const clientSecretRegex = /(client_secret|CLIENT_SECRET)\s*=\s*([^\s"'`$]|"[^$]|'[^$])/g
  let match
  while ((match = clientSecretRegex.exec(contents)) !== null) {
    offenders.push({ file, index: match.index, snippet: contents.slice(match.index, match.index + 80) })
  }

  const flagRegex = /--client-secret/g
  while ((match = flagRegex.exec(contents)) !== null) {
    offenders.push({ file, index: match.index, snippet: contents.slice(match.index, match.index + 80) })
  }
}

if (offenders.length > 0) {
  console.error('Inline client secrets or forbidden flags detected:')
  for (const offender of offenders) {
    console.error(`- ${offender.file}:${offender.index}: ${offender.snippet.trim()}`)
  }
  process.exit(1)
}
