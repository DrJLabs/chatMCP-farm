import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

const BASE_ENV = {
  OIDC_ISSUER: 'https://auth.local/realms/test',
  OIDC_AUDIENCE: 'https://mcp.local/mcp',
  MCP_PUBLIC_BASE_URL: 'https://mcp.local/mcp',
  MCP_TEST_SERVER_ALLOWED_ORIGINS: 'https://chatgpt.com,https://chat.openai.com',
}

describe('Accept header enforcement', () => {
  it('returns 406 when Accept header missing', async () => {
    const env = {
      ...BASE_ENV,
      MCP_TEST_SERVER_REQUIRE_AUTH: 'false',
    }
    const { app } = await createApp({ env })

    const response = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      })

    expect(response.status).toBe(406)
    expect(response.body).toMatchObject({ error: 'not_acceptable' })
  })
})
