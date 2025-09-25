import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'

function buildTestEnv(overrides: Record<string, string> = {}) {
  return {
    OIDC_ISSUER: 'https://auth.local/realms/test',
    OIDC_AUDIENCE: 'https://mcp.local/mcp',
    MCP_PUBLIC_BASE_URL: 'https://mcp.local/mcp',
    MCP_ALLOWED_ORIGINS: 'https://chatgpt.com,https://chat.openai.com',
    REQUIRE_AUTH: 'false',
    MCP_NAME_HUMAN: 'Test Server',
    MCP_NAME_MODEL: 'test_server',
    MCP_DESCRIPTION_HUMAN: 'Human readable description',
    MCP_DESCRIPTION_MODEL: 'Model description',
    ...overrides,
  }
}

describe('github-mcp bridge proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('forwards MCP requests to the upstream when configured', async () => {
    const logDir = mkdtempSync(path.join(tmpdir(), 'bridge-proxy-'))
    const logPath = path.join(logDir, 'bridge.log')
    writeFileSync(logPath, '', 'utf8')

    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'mcp-session-id': 'session-abc',
        },
      })
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch)

    const env = buildTestEnv({
      MCP_UPSTREAM_URL: 'http://bridge.local:9090/mcp',
      MCP_BRIDGE_LOG_FILE: logPath,
      MCP_BRIDGE_LOG_TAIL_BYTES: '4096',
    })

    const { app } = await createApp({ env })

    const response = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json')
      .set('Authorization', 'Bearer token')
      .set('mcp-session-id', 'session-abc')
      .send({ jsonrpc: '2.0', id: 1 })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(url.toString()).toBe('http://bridge.local:9090/mcp')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer token')
    expect(headers['mcp-session-id']).toBe('session-abc')
    expect(headers['mcp-protocol-version']).toBe('2025-06-18')
    expect(typeof init.body).toBe('string')
    expect(JSON.parse(init.body as string)).toMatchObject({ jsonrpc: '2.0', id: 1 })
  })

  it('exposes bridge logs via the observability endpoint', async () => {
    const logDir = mkdtempSync(path.join(tmpdir(), 'bridge-logs-'))
    const logPath = path.join(logDir, 'bridge.log')
    writeFileSync(logPath, 'line-a\nline-b\n', 'utf8')

    const env = buildTestEnv({
      MCP_UPSTREAM_URL: 'http://bridge.local:9090/mcp',
      MCP_BRIDGE_LOG_FILE: logPath,
      MCP_BRIDGE_LOG_TAIL_BYTES: '32',
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 200 }))

    const { app } = await createApp({ env })

    const response = await request(app)
      .get('/observability/bridge/logs')
      .set('Accept', 'application/json')

    expect(response.status).toBe(200)
    expect(response.text).toContain('line-b')
  })

  it('reports bridge health status and metrics metadata', async () => {
    const logDir = mkdtempSync(path.join(tmpdir(), 'bridge-status-'))
    const logPath = path.join(logDir, 'bridge.log')
    writeFileSync(logPath, '', 'utf8')

    const env = buildTestEnv({
      MCP_UPSTREAM_URL: 'http://bridge.local:9090/mcp',
      MCP_UPSTREAM_HEALTH_URL: 'http://bridge.local:9300/healthz',
      MCP_UPSTREAM_METRICS_URL: 'http://bridge.local:9300/metrics',
      MCP_BRIDGE_LOG_FILE: logPath,
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof URL ? input.toString() : String(input)
      if (url.endsWith('/healthz')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.endsWith('/metrics')) {
        return new Response('bridge_process_up 1', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        })
      }
      return new Response(null, { status: 200 })
    })

    const { app } = await createApp({ env })

    const response = await request(app)
      .get('/observability/bridge/status')
      .query({ sample: 'true' })
      .set('Accept', 'application/json')

    expect(response.status).toBe(200)
    expect(response.body.enabled).toBe(true)
    expect(response.body.proxy.totalRequests).toBe(0)
    expect(response.body.health).toMatchObject({ ok: true, status: 200 })
    expect(response.body.metrics.url).toBe('http://bridge.local:9300/metrics')
    expect(response.body.metrics.sample).toMatchObject({ sample: 'bridge_process_up 1', status: 200 })
  })
})
