/**
 * Tests for packages/mcp-auth-kit/src/env.ts
 * Framework: will adapt to Vitest or Jest based on repo tooling.
 * - Validates summarizeAuthEnv behavior across env/default/missing states
 * - Handles empty-string env values
 * - Verifies sensitive masking behavior by temporarily extending AUTH_ENV_VARS
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest' // Vitest path; if Jest is used, TS will resolve globals via @types/jest
// Fallback for Jest environments where importing from vitest is not desired.
// @ts-ignore

declare const jest: any

import { AUTH_ENV_VARS, summarizeAuthEnv, type AuthEnvVariable, type AuthEnvSummary } from './env'

/**
 * Helper to get a summary entry by name.
 */
function byName(list: AuthEnvSummary[], name: string): AuthEnvSummary | undefined {
  return list.find(e => e.name === name)
}

describe('summarizeAuthEnv', () => {
  const REQUIRED_WITHOUT_DEFAULT = 'OIDC_ISSUER' // required: true, no default
  const REQUIRED_WITHOUT_DEFAULT_2 = 'OIDC_AUDIENCE' // required: true, no default
  const OPTIONAL_WITH_DEFAULT = 'ALLOWED_ORIGINS' // has default
  const OPTIONAL_WITHOUT_DEFAULT = 'MCP_PUBLIC_BASE_URL' // no default

  let originalAuthEnvVars: AuthEnvVariable[]

  beforeEach(() => {
    // snapshot AUTH_ENV_VARS (shallow clone is fine as we only push/pop)
    originalAuthEnvVars = [...AUTH_ENV_VARS]
  })

  afterEach(() => {
    // restore any mutations to exported array to avoid cross-test bleed
    AUTH_ENV_VARS.length = 0
    AUTH_ENV_VARS.push(...originalAuthEnvVars)
  })

  it('returns source="env" when a variable is present and non-empty', () => {
    const env = {
      [REQUIRED_WITHOUT_DEFAULT]: 'https://issuer.example/realms/demo',
    } as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, REQUIRED_WITHOUT_DEFAULT) as AuthEnvSummary
    expect(entry).toBeTruthy()
    expect(entry.name).toBe(REQUIRED_WITHOUT_DEFAULT)
    expect(entry.source).toBe('env')
    expect(entry.value).toBe('https://issuer.example/realms/demo')
    // required flag should be preserved
    const def = originalAuthEnvVars.find(v => v.name === REQUIRED_WITHOUT_DEFAULT) as AuthEnvVariable
    expect(entry.required).toBe(def.required)
  })

  it('returns source="default" and default value when var missing but defaultValue exists', () => {
    const env = {} as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, OPTIONAL_WITH_DEFAULT) as AuthEnvSummary
    expect(entry).toBeTruthy()
    expect(entry.source).toBe('default')
    // Match the configured default exactly
    const def = originalAuthEnvVars.find(v => v.name === OPTIONAL_WITH_DEFAULT) as AuthEnvVariable
    expect(def.defaultValue).toBeTruthy()
    expect(entry.value).toBe(def.defaultValue)
  })

  it('returns source="missing" with undefined value when var missing and no default', () => {
    const env = {} as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, OPTIONAL_WITHOUT_DEFAULT) as AuthEnvSummary
    expect(entry).toBeTruthy()
    expect(entry.source).toBe('missing')
    expect(entry.value).toBeUndefined()
  })

  it('treats empty string as missing: falls back to default when available', () => {
    const env = {
      [OPTIONAL_WITH_DEFAULT]: '',
    } as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, OPTIONAL_WITH_DEFAULT) as AuthEnvSummary
    expect(entry.source).toBe('default')
    const def = originalAuthEnvVars.find(v => v.name === OPTIONAL_WITH_DEFAULT) as AuthEnvVariable
    expect(entry.value).toBe(def.defaultValue)
  })

  it('treats empty string as missing: reports "missing" when no default', () => {
    const env = {
      [REQUIRED_WITHOUT_DEFAULT_2]: '',
    } as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, REQUIRED_WITHOUT_DEFAULT_2) as AuthEnvSummary
    expect(entry.source).toBe('missing')
    expect(entry.value).toBeUndefined()
  })

  it('masks sensitive variables when present in env (source="env" and value="***")', () => {
    // Add a sensitive variable temporarily for test coverage
    const secretVar: AuthEnvVariable = {
      name: 'FAKE_SECRET_FOR_TEST',
      description: 'temporary secret for unit test',
      required: false,
      sensitive: true,
    }
    AUTH_ENV_VARS.push(secretVar)

    const env = {
      FAKE_SECRET_FOR_TEST: 'super-secret',
    } as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, 'FAKE_SECRET_FOR_TEST') as AuthEnvSummary
    expect(entry).toBeTruthy()
    expect(entry.source).toBe('env')
    expect(entry.value).toBe('***')
  })

  it('does not mask non-sensitive variables', () => {
    const env = {
      [OPTIONAL_WITHOUT_DEFAULT]: 'https://mcp.example.com/mcp',
    } as NodeJS.ProcessEnv

    const result = summarizeAuthEnv(env)
    const entry = byName(result, OPTIONAL_WITHOUT_DEFAULT) as AuthEnvSummary
    expect(entry.source).toBe('env')
    expect(entry.value).toBe('https://mcp.example.com/mcp')
  })

  it('includes all variables in the summary, matching AUTH_ENV_VARS length', () => {
    const env = {} as NodeJS.ProcessEnv
    const result = summarizeAuthEnv(env)
    expect(result.length).toBe(AUTH_ENV_VARS.length)
    // Ensure every item maps by name
    for (const v of AUTH_ENV_VARS) {
      expect(result.some(r => r.name === v.name)).toBe(true)
    }
  })

  it('preserves descriptions and flags from definitions', () => {
    const env = {} as NodeJS.ProcessEnv
    const result = summarizeAuthEnv(env)
    const check = (name: string) => {
      const base = originalAuthEnvVars.find(v => v.name === name) as AuthEnvVariable
      const entry = byName(result, name) as AuthEnvSummary
      expect(entry.description).toBe(base.description)
      expect(entry.required).toBe(base.required)
      expect((entry as any).sensitive).toBe(base.sensitive) // may be undefined
    }
    check(REQUIRED_WITHOUT_DEFAULT)
    check(OPTIONAL_WITHOUT_DEFAULT)
  })
})