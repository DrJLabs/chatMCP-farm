import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'

const BASE_ENV = {
  OIDC_ISSUER: 'https://auth.local/realms/test',
  OIDC_AUDIENCE: 'https://mcp.local/mcp',
  MCP_PUBLIC_BASE_URL: 'https://mcp.local/mcp',
  MCP_ALLOWED_ORIGINS: 'https://chatgpt.com,https://chat.openai.com',
}

describe('Accept header enforcement', () => {
  it('returns 406 when Accept header missing', async () => {
    const env = {
      ...BASE_ENV,
      REQUIRE_AUTH: 'false',
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

  it('honours Accept header and returns protocol + session metadata', async () => {
    const env = {
      ...BASE_ENV,
      REQUIRE_AUTH: 'false',
    }
    const { app } = await createApp({ env })

    const response = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 'smoke',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      })

    expect(response.status).toBe(200)
    expect(response.headers['mcp-session-id']).toBeTruthy()
    expect(response.headers['mcp-protocol-version']).toBe('2025-06-18')
  })

  it('reuses an established session for session teardown', async () => {
    const env = {
      ...BASE_ENV,
      REQUIRE_AUTH: 'false',
    }
    const { app } = await createApp({ env })

    const initialise = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 'smoke',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      })

    const sessionId = initialise.headers['mcp-session-id']
    expect(sessionId).toBeTruthy()

    const deleteResponse = await request(app)
      .delete('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('mcp-session-id', sessionId)

    expect(deleteResponse.status).toBe(200)
  })

  it('returns 400 when follow-up requests omit the session id', async () => {
    const env = {
      ...BASE_ENV,
      REQUIRE_AUTH: 'false',
    }
    const { app } = await createApp({ env })

    const response = await request(app)
      .get('/mcp')
      .set('Accept', 'application/json, text/event-stream')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ error: 'missing_session' })
  })

  it('returns 400 for unknown session ids', async () => {
    const env = {
      ...BASE_ENV,
      REQUIRE_AUTH: 'false',
    }
    const { app } = await createApp({ env })

    const initialise = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 'smoke',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.1' },
        },
      })

    expect(initialise.status).toBe(200)

    const deleteResponse = await request(app)
      .delete('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('mcp-session-id', 'non-existent-session')

    expect(deleteResponse.status).toBe(400)
    expect(deleteResponse.body).toMatchObject({ error: 'invalid_session' })
  })
})
