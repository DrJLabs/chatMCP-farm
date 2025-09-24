/**
 * Note: Tests assume the repository uses a Jest/Vitest-style testing framework
 * (describe/it/expect). If using Vitest, add: import { describe, it, expect } from 'vitest';
 * If using Jest with globals, no import necessary. No new dependencies introduced.
 */

import { AUTH_ENV_VARS, summarizeAuthEnv } from '../src/env' // Adjust if source path differs
import type { AuthEnvSummary, AuthEnvVariable } from '../src/env'

describe('summarizeAuthEnv', () => {
  function byName(list: AuthEnvSummary[], name: string): AuthEnvSummary {
    const item = list.find(v => v.name === name);
    if (!item) throw new Error(`Missing summary for ${name}`);
    return item;
  }

  it('returns "env" source with raw value when variable is set', () => {
    const env = {
      OIDC_ISSUER: 'https://keycloak.example.com/realms/demo',
      OIDC_AUDIENCE: 'aud1,aud2',
    } as NodeJS.ProcessEnv

    const res = summarizeAuthEnv(env)
    expect(byName(res, 'OIDC_ISSUER')).toEqual(
      expect.objectContaining({ value: 'https://keycloak.example.com/realms/demo', source: 'env' })
    )
    expect(byName(res, 'OIDC_AUDIENCE')).toEqual(
      expect.objectContaining({ value: 'aud1,aud2', source: 'env' })
    )
  })

  it('uses defaultValue and "default" source when unset and default exists', () => {
    const env = {} as NodeJS.ProcessEnv
    const res = summarizeAuthEnv(env)

    expect(byName(res, 'ALLOWED_ORIGINS')).toEqual(
      expect.objectContaining({ value: 'https://chatgpt.com,https://chat.openai.com', source: 'default' })
    )
    expect(byName(res, 'ENABLE_STREAMABLE')).toEqual(
      expect.objectContaining({ value: 'true', source: 'default' })
    )
    expect(byName(res, 'ENABLE_SSE')).toEqual(
      expect.objectContaining({ value: 'false', source: 'default' })
    )
    expect(byName(res, 'REQUIRE_AUTH')).toEqual(
      expect.objectContaining({ value: 'true', source: 'default' })
    )
    expect(byName(res, 'DEBUG_HEADERS')).toEqual(
      expect.objectContaining({ value: 'false', source: 'default' })
    )
  })

  it('returns "missing" when unset and no defaultValue provided', () => {
    const env = {} as NodeJS.ProcessEnv
    const res = summarizeAuthEnv(env)

    // required true/no default
    expect(byName(res, 'OIDC_ISSUER')).toEqual(
      expect.objectContaining({ value: undefined, source: 'missing' })
    )
    expect(byName(res, 'OIDC_AUDIENCE')).toEqual(
      expect.objectContaining({ value: undefined, source: 'missing' })
    )

    // optional/no default
    expect(byName(res, 'MCP_PUBLIC_BASE_URL')).toEqual(
      expect.objectContaining({ value: undefined, source: 'missing' })
    )
  })

  it('treats empty string as missing (falls back to default if present)', () => {
    const env = {
      ALLOWED_ORIGINS: '', // falsy -> should use default
      MCP_NAME_HUMAN: '',  // falsy -> no default -> missing
    } as NodeJS.ProcessEnv

    const res = summarizeAuthEnv(env)

    expect(byName(res, 'ALLOWED_ORIGINS')).toEqual(
      expect.objectContaining({ value: 'https://chatgpt.com,https://chat.openai.com', source: 'default' })
    )
    expect(byName(res, 'MCP_NAME_HUMAN')).toEqual(
      expect.objectContaining({ value: undefined, source: 'missing' })
    )
  })

  it('preserves whitespace-only values as env source (non-empty string)', () => {
    const env = {
      MCP_NAME_MODEL: '  ModelAgent  ',
    } as NodeJS.ProcessEnv

    const res = summarizeAuthEnv(env)
    expect(byName(res, 'MCP_NAME_MODEL')).toEqual(
      expect.objectContaining({ value: '  ModelAgent  ', source: 'env' })
    )
  })

  it('honors sensitive flag by masking value', () => {
    // Temporarily add a sensitive variable to the exported list; restore after test.
    const sensitiveVar: AuthEnvVariable = {
      name: 'SECRET_TOKEN',
      description: 'Sensitive token',
      required: false,
      sensitive: true,
    }

    try {
      ;(AUTH_ENV_VARS as AuthEnvVariable[]).push(sensitiveVar)
      const res = summarizeAuthEnv({ SECRET_TOKEN: 'super-secret' } as NodeJS.ProcessEnv)
      const secret = res.find(v => v.name === 'SECRET_TOKEN')
      expect(secret).toBeTruthy()
      expect(secret).toEqual(expect.objectContaining({ source: 'env', value: '***' }))
    } finally {
      const idx = (AUTH_ENV_VARS as AuthEnvVariable[]).findIndex(v => v.name === 'SECRET_TOKEN')
      if (idx >= 0) (AUTH_ENV_VARS as AuthEnvVariable[]).splice(idx, 1)
    }
  })

  it('maintains order of AUTH_ENV_VARS in the summary output', () => {
    const res = summarizeAuthEnv({})
    const names = res.map(r => r.name)
    expect(names).toEqual((AUTH_ENV_VARS as AuthEnvVariable[]).map(v => v.name))
  })

  it('prefers env value over default when both exist', () => {
    const env = {
      REQUIRE_AUTH: 'false', // override default 'true'
      ENABLE_SSE: 'false',
      ENABLE_STREAMABLE: 'false',
    } as NodeJS.ProcessEnv

    const res = summarizeAuthEnv(env)
    expect(byName(res, 'REQUIRE_AUTH')).toEqual(expect.objectContaining({ value: 'false', source: 'env' }))
    expect(byName(res, 'ENABLE_SSE')).toEqual(expect.objectContaining({ value: 'false', source: 'env' }))
    expect(byName(res, 'ENABLE_STREAMABLE')).toEqual(expect.objectContaining({ value: 'false', source: 'env' }))
  })
})