import request from 'supertest'
import { describe, expect, it } from 'vitest'

type CreateApp = (options: {
  env: Record<string, string>
}) => Promise<{ app: import('express').Express }>

type EnvOverrides = Record<string, string>

const BASE_ENV = {
  OIDC_ISSUER: 'https://auth.local/realms/test',
  OIDC_AUDIENCE: 'https://mcp.local/mcp',
  MCP_PUBLIC_BASE_URL: 'https://mcp.local/mcp',
  MCP_ALLOWED_ORIGINS: 'https://chatgpt.com,https://chat.openai.com',
  REQUIRE_AUTH: 'true',
  MCP_NAME_HUMAN: 'Test Server',
  MCP_NAME_MODEL: 'test_server',
  MCP_DESCRIPTION_HUMAN: 'Human readable description',
  MCP_DESCRIPTION_MODEL: 'Model description',
}

function buildTestEnv(overrides: EnvOverrides = {}) {
  return {
    ...BASE_ENV,
    ...overrides,
  }
}

export function registerManifestSuite(createApp: CreateApp) {
  describe('manifest and metadata endpoints', () => {
    it('returns manifest populated from environment and emits challenges', async () => {
      const { app } = await createApp({ env: buildTestEnv() })

      const response = await request(app).get('/.well-known/mcp/manifest.json')

      expect(response.status).toBe(200)
      expect(response.headers['www-authenticate']).toContain('Bearer')

      expect(response.body.nameForHuman).toBe('Test Server')
      expect(response.body.nameForModel).toBe('test_server')
      expect(response.body.descriptionForHuman).toContain('Human readable')
      expect(response.body.descriptionForModel).toContain('Model description')
      expect(response.body.metadata.resource).toBe('https://mcp.local/mcp')
      expect(response.body.tools).toEqual([
        {
          name: 'diagnostics.ping',
          description: expect.stringContaining('deterministic response'),
        },
      ])
    })

    it('returns protected-resource metadata with challenge header', async () => {
      const { app } = await createApp({ env: buildTestEnv({ REQUIRE_AUTH: 'true' }) })

      const response = await request(app).get('/.well-known/oauth-protected-resource')

      expect(response.status).toBe(200)
      expect(response.headers['www-authenticate']).toContain('Bearer')
      expect(response.body.resource).toBe('https://mcp.local/mcp')
      expect(response.body.authorization_servers[0]).toBe(
        'https://auth.local/realms/test/.well-known/oauth-authorization-server',
      )
    })

    it('root endpoint advertises transports and allowed origins', async () => {
      const { app } = await createApp({ env: buildTestEnv() })

      const response = await request(app).get('/')

      expect(response.status).toBe(200)
      expect(response.headers['www-authenticate']).toContain('Bearer')
      expect(response.body.resource).toBe('https://mcp.local/mcp')
      expect(response.body.allowedOrigins).toContain('https://chatgpt.com')
      expect(response.body.tools[0].name).toBe('diagnostics.ping')
    })
  })
}
