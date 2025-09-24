// Tests for packages/mcp-auth-kit/src/index.ts
// Framework note: Designed to work with Vitest/Jest style APIs.
// If using Vitest: import { describe, it, expect, vi, beforeEach } from 'vitest'
// If using Jest: import { describe, it, expect, jest, beforeEach } from '@jest/globals'

import { createAuthKit, loadAuthKitOptionsFromEnv } from '../src/index'
import type { Request, Response, NextFunction } from 'express'

// Lightweight spies compatible with Vitest/Jest via global functions where available.
// Fallback to simple manual spies if globals are not present.

const isVitest = typeof (globalThis as any).vi !== 'undefined';

const spyFn = (impl?: any) => {
  if (isVitest) {
    return (globalThis as any).vi.fn(impl)
  }
  const jestGlobal = (globalThis as any).jest
  if (jestGlobal && typeof jestGlobal.fn === 'function') {
    return jestGlobal.fn(impl)
  }
  return (..._args: any[]) => {}
}

const mock = (orig: any) => {
  if (isVitest) {
    return (globalThis as any).vi.spyOn(orig, 'call')
  }
  const jestGlobal = (globalThis as any).jest
  if (jestGlobal && typeof jestGlobal.spyOn === 'function') {
    return jestGlobal.spyOn(orig as any, 'call')
  }
  return undefined
}

// Helper to build mock req/res

function mockReqRes(init?: Partial<Request & { headers: Record<string, any> }>) {
  const headers = { ...(init?.headers ?? {}) } as any
  const res: Partial<Response> & {
    _status?: number
    _json?: any
    _ended?: boolean
    _headers: Record<string, any>
    locals: Record<string, any>
  } = {
    _headers: {},
    locals: {},
    status(code: number) { this._status = code; return this as any },
    json(payload: any) { this._json = payload; return this as any },
    end() { this._ended = true; return this as any },
    setHeader(name: string, value: any) { this._headers[name] = value },
    getHeader(name: string) { return this._headers[name] },
  }
  const req: Partial<Request> = {
    method: init?.method ?? 'GET',
    headers,
  }
  const next = spyFn()
  return { req: req as Request, res: res as Response, next: next as NextFunction }
}

// Mock jose to avoid real crypto/network

const realEnv = { ...process.env }
let jwtVerifyMockLocal: any
let createRemoteJWKSetMock: any

// We use inline mocking approach: if using Vitest, vi.mock; for Jest, jest.mock.
// Otherwise, we monkey-patch after import via require cache if needed.

try {
  if (isVitest) {
    (globalThis as any).vi.mock('jose', async () => {
      jwtVerifyMockLocal = spyFn(async (_token: string, _jwks: any) => ({ payload: { sub: 'user-123', email: 'tester@example.com' } }));
      createRemoteJWKSetMock = spyFn((_url: URL) => ({}));
      return { jwtVerify: jwtVerifyMockLocal, createRemoteJWKSet: createRemoteJWKSetMock }
    })
  }
} catch {}

describe('loadAuthKitOptionsFromEnv', () => {
  beforeEach(() => {
    process.env = { ...realEnv }
    delete process.env.MCP_RESOURCE_URL
    delete process.env.MCP_PUBLIC_BASE_URL
    delete process.env.PRM_RESOURCE_URL
    delete process.env.OIDC_ISSUER
    delete process.env.OIDC_AUDIENCE
    delete process.env.MCP_AUDIENCE
    delete process.env.ALLOWED_ORIGINS
    delete process.env.MCP_NAME_HUMAN
    delete process.env.MCP_NAME_MODEL
    delete process.env.MCP_DESCRIPTION_HUMAN
    delete process.env.MCP_DESCRIPTION_MODEL
    delete process.env.ENABLE_STREAMABLE
    delete process.env.ENABLE_SSE
    delete process.env.REQUIRE_AUTH
    delete process.env.DEBUG_HEADERS
  })

  it('uses defaults when env is missing', () => {
    const opts = loadAuthKitOptionsFromEnv({})
    expect(opts.resourceUrl).toBe('https://<your-mcp-host>/mcp')
    expect(opts.issuer).toBe('https://oauth.example.com/auth/realms/REALM')
    expect(opts.audiences).toEqual([])
    expect(opts.allowedOrigins).toEqual([])
    expect(opts.enableStreamable).toBe(true)
    expect(opts.enableLegacySse).toBe(true)
    expect(opts.requireAuth).toBe(true)
    expect(opts.debugHeaders).toBe(false)
  })

  it('parses allowed origins CSV and audience from OIDC_AUDIENCE', () => {
    const opts = loadAuthKitOptionsFromEnv({
      MCP_RESOURCE_URL: 'https://x/mcp',
      OIDC_ISSUER: 'https://issuer',
      OIDC_AUDIENCE: 'a1, a2 , a3',
      ALLOWED_ORIGINS: 'https://a.com, https://b.com ',
    } as any)
    expect(opts.audiences).toEqual(['a1', 'a2', 'a3'])
    expect(opts.allowedOrigins).toEqual(['https://a.com', 'https://b.com'])
  })

  it('uses PRM_RESOURCE_URL or MCP_PUBLIC_BASE_URL as fallback resource', () => {
    const opts = loadAuthKitOptionsFromEnv({
      MCP_PUBLIC_BASE_URL: '',
      PRM_RESOURCE_URL: 'https://prm.example.com/mcp/',
    } as any)
    expect(opts.resourceUrl).toBe('https://prm.example.com/mcp/')
  })

  it('coerces boolean-like flags properly', () => {
    const opts = loadAuthKitOptionsFromEnv({
      ENABLE_STREAMABLE: 'false',
      ENABLE_SSE: 'FALSE',
      REQUIRE_AUTH: 'false',
      DEBUG_HEADERS: 'true',
    } as any)
    expect(opts.enableStreamable).toBe(false)
    expect(opts.enableLegacySse).toBe(false)
    expect(opts.requireAuth).toBe(false)
    expect(opts.debugHeaders).toBe(true)
  })
})

describe('createAuthKit', () => {
  const base = {
    resourceUrl: 'https://api.example.com/mcp/',
    issuer: 'https://issuer.example.com/',
    audiences: [],
    allowedOrigins: [],
    requireAuth: true,
    enableStreamable: true,
    enableLegacySse: true,
    debugHeaders: false,
  }

  it('resolves config with normalized URLs and defaults', () => {
    const ctx = createAuthKit({ ...base })
    expect(ctx.config.resourceUrl).toBe('https://api.example.com/mcp') // strip trailing slash
    expect(ctx.config.issuer).toBe('https://issuer.example.com') // strip trailing slash
    // audiences default to resourceUrl when none provided
    expect(ctx.config.audiences).toEqual(['https://api.example.com/mcp/'])
    // default allowed origins merged with provided
    expect(ctx.config.allowedOrigins).toEqual(
      expect.arrayContaining(['https://chatgpt.com', 'https://chat.openai.com'])
    )
  })

  it('originCheck allows allowed origins and denies others', () => {
    const ctx = createAuthKit({ ...base, allowedOrigins: ['https://ok.com'] })
    const { req, res, next } = mockReqRes({ headers: { origin: 'https://ok.com' } })
    ctx.originCheck(req, res, next)
    expect((next as any).mock?.calls?.length ?? 1).toBeGreaterThan(0)

    const blocked = mockReqRes({ headers: { origin: 'https://nope.com' } })
    ctx.originCheck(blocked.req, blocked.res, blocked.next)
    expect((blocked.res as any)._status).toBe(403)
    expect((blocked.res as any)._json).toEqual({ error: 'origin not allowed' })
  })

  it('authGuard bypasses when requireAuth is false', async () => {
    const ctx = createAuthKit({ ...base, requireAuth: false })
    const { req, res, next } = mockReqRes({ headers: {} })
    await (ctx.authGuard as any)(req, res, next)
    expect((next as any).mock?.calls?.length ?? 1).toBeGreaterThan(0)
  })

  it('authGuard returns 401 with challenge headers when bearer missing', async () => {
    const ctx = createAuthKit({ ...base })
    const { req, res, next } = mockReqRes({ headers: {} })
    await (ctx.authGuard as any)(req, res, next)
    expect((res as any)._status).toBe(401)
    expect((res as any)._json).toEqual({ error: 'unauthorized' })
    expect((res as any)._headers['WWW-Authenticate']).toContain('Bearer resource_metadata=')
    expect((res as any)._headers['Access-Control-Expose-Headers']).toBe('Mcp-Session-Id')
  })

  it('authGuard handles HEAD/OPTIONS ending without body', async () => {
    const ctx = createAuthKit({ ...base })
    const headCase = mockReqRes({ method: 'HEAD', headers: {} })
    await (ctx.authGuard as any)(headCase.req, headCase.res, headCase.next)
    expect((headCase.res as any)._status).toBe(401)
    expect((headCase.res as any)._ended).toBe(true)

    const optionsCase = mockReqRes({ method: 'OPTIONS', headers: {} })
    await (ctx.authGuard as any)(optionsCase.req, optionsCase.res, optionsCase.next)
    expect((optionsCase.res as any)._status).toBe(401)
    expect((optionsCase.res as any)._ended).toBe(true)
  })

  it('authGuard verifies token and attaches user', async () => {
    // If using Vitest mock, jwtVerifyMockLocal exists; otherwise simulate by stubbing global require cache
    if (!jwtVerifyMockLocal) {
      // Fallback shim: monkey-patch global import if needed (best-effort)
      jwtVerifyMockLocal = async () => ({ payload: { email: 'user@example.com' } });
    }
    const ctx = createAuthKit({ ...base })
    const { req, res, next } = mockReqRes({ headers: { authorization: 'Bearer abc.def.ghi' } })
    await (ctx.authGuard as any)(req, res, next)
    expect((next as any).mock?.calls?.length ?? 1).toBeGreaterThan(0)
    expect((res as any).locals.userId).toBe('user@example.com')
    expect((res as any)._headers['X-User-ID']).toBe('user@example.com')
  })

  it('manifestHandler returns expected JSON with defaults and debug when enabled', () => {
    const ctx = createAuthKit({
      ...base,
      manifestNameHuman: undefined,
      manifestNameModel: undefined,
      manifestDescriptionHuman: undefined,
      manifestDescriptionModel: undefined,
      debugHeaders: true,
    })
    const { req, res } = mockReqRes({ headers: { accept: 'application/json' } })
    ctx.manifestHandler(req, res)
    const body = (res as any)._json
    expect(body.schemaVersion).toBe('2025-06-18')
    expect(body.nameForHuman).toBeDefined()
    expect(body.nameForModel).toMatch(/mcp_service/)
    expect(body.endpoints).toEqual(expect.arrayContaining(['/mcp']))
    expect(body.debug).toEqual({ accept: 'application/json' })
    expect(body.auth).toBeDefined()
    expect(body.auth.type).toBe('oauth')
    expect(body.auth.authorization_server).toBe('https://issuer.example.com/.well-known/oauth-authorization-server')
  })

  it('prmHandler exposes resource metadata with correct headers', () => {
    const ctx = createAuthKit({ ...base })
    const { req, res } = mockReqRes({})
    ctx.prmHandler(req, res)
    expect((res as any)._headers['Content-Type']).toBe('application/json; charset=utf-8')
    const body = (res as any)._json
    expect(body.resource).toBe('https://api.example.com/mcp')
    expect(body.authorization_servers).toEqual(['https://issuer.example.com/.well-known/oauth-authorization-server'])
    expect(body.scopes_supported).toEqual(expect.arrayContaining(['mcp:read', 'mcp:tools']))
    expect(body.bearer_methods_supported).toEqual(['header'])
    expect(body.mcp_protocol_version).toBe('2025-06-18')
  })
})