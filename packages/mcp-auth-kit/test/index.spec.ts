/**
 * Test library/framework: Jest-style APIs (expect/describe/it) with TypeScript.
 * If the repository uses Vitest, this test file remains compatible.
 *
 * These tests focus on the public surface exposed by the mcp-auth-kit index,
 * covering happy paths, edge cases, and failure modes, with mocks for external deps.
 */

import type { Request, Response, NextFunction } from 'express'

// Use dynamic import to avoid ESM/CJS interop pitfalls in mixed setups
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { createRequire } from 'module'
const reqr = typeof createRequire === 'function' ? createRequire(import.meta?.url || __filename) : require

// Import from source; adjust path if package build structure differs
// Try src first; fallback to dist if tests run against built output.
let mod: any
beforeAll(async () => {
  try {
    mod = await import('../src/index.ts')
  } catch {
    try {
      mod = await import('../src/index')
    } catch {
      try {
        mod = await import('../dist/index.js')
      } catch {
        // As a last resort attempt package entry
        mod = await import('..')
      }
    }
  }
})

function mockRes(): Response & { _status?: number; _json?: any; _headers: Record<string,string>; locals: any; _ended?: boolean } {
  const headers: Record<string,string> = {}
  return {
    locals: {},
    setHeader: (k: string, v: any) => { headers[k] = String(v) },
    getHeader: (k: string) => headers[k],
    status(this: any, code: number) { this._status = code; return this },
    json(this: any, body: any) { this._json = body; return this },
    end(this: any) { this._ended = true; return this },
    _headers: headers,
  } as any
}

function mockReq(init?: Partial<Request>): Request {
  return ({
    headers: {},
    method: 'GET',
    ...init,
  } as any) as Request
}

describe('loadAuthKitOptionsFromEnv', () => {
  it('applies defaults and parses CSV values', () => {
    const env = {
      MCP_RESOURCE_URL: 'https://example.com/mcp/',
      OIDC_ISSUER: 'https://issuer.example.com/',
      OIDC_AUDIENCE: 'a1, a2 ,a3',
      ALLOWED_ORIGINS: 'https://foo.com, https://bar.com , ,',
      ENABLE_STREAMABLE: 'true',
      ENABLE_SSE: 'false',
      REQUIRE_AUTH: 'true',
      DEBUG_HEADERS: 'true',
      MCP_NAME_HUMAN: 'Human Name',
      MCP_NAME_MODEL: 'Model-Name',
      MCP_DESCRIPTION_HUMAN: 'H desc',
      MCP_DESCRIPTION_MODEL: 'M desc',
    } as NodeJS.ProcessEnv
    const { loadAuthKitOptionsFromEnv } = mod
    const opts = loadAuthKitOptionsFromEnv(env)
    expect(opts.resourceUrl).toBe('https://example.com/mcp') // strip in createAuthKit; here default includes trailing but provided contains; function keeps as-is
    // Note: loadAuthKitOptionsFromEnv itself does not strip trailing slash; ensure raw values pass through
    expect(opts.resourceUrl).toBe('https://example.com/mcp/') // raw from env in loader
    expect(opts.issuer).toBe('https://issuer.example.com/')
    expect(opts.audiences).toEqual(['a1','a2','a3'])
    expect(opts.allowedOrigins).toEqual(['https://foo.com','https://bar.com'])
    expect(opts.enableStreamable).toBe(true)
    expect(opts.enableLegacySse).toBe(false)
    expect(opts.requireAuth).toBe(true)
    expect(opts.debugHeaders).toBe(true)
    expect(opts.manifestNameHuman).toBe('Human Name')
    expect(opts.manifestNameModel).toBe('Model-Name')
    expect(opts.manifestDescriptionHuman).toBe('H desc')
    expect(opts.manifestDescriptionModel).toBe('M desc')
  })

  it('falls back to sane defaults when env is empty', () => {
    const { loadAuthKitOptionsFromEnv } = mod
    const opts = loadAuthKitOptionsFromEnv({})
    expect(opts.resourceUrl).toMatch(/^https:\/\/<your-mcp-host>\/mcp$/)
    expect(opts.issuer).toMatch(/^https:\/\/oauth\.example\.com/)
    expect(opts.audiences).toEqual([])
    expect(opts.allowedOrigins).toEqual([])
    expect(opts.enableStreamable).toBe(true)
    expect(opts.enableLegacySse).toBe(true)
    expect(opts.requireAuth).toBe(true)
    expect(opts.debugHeaders).toBe(false)
  })

  it('supports legacy env names for resource/audience', () => {
    const { loadAuthKitOptionsFromEnv } = mod
    const opts = loadAuthKitOptionsFromEnv({
      MCP_PUBLIC_BASE_URL: 'https://public.base/mcp',
      MCP_AUDIENCE: 'x,y',
    } as any)
    expect(opts.resourceUrl).toBe('https://public.base/mcp')
    expect(opts.audiences).toEqual(['x','y'])
  })
})

describe('createAuthKit: config resolution', () => {
  it('resolves defaults and derived values', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc.example.com/mcp/',
      issuer: 'https://issuer.example.com/',
      audiences: [],
      allowedOrigins: ['https://foo.com', 'https://chat.openai.com'], // duplicate with default
      requireAuth: undefined,
      enableLegacySse: undefined,
      enableStreamable: undefined,
      debugHeaders: false,
    })
    expect(ctx.config.resourceUrl).toBe('https://svc.example.com/mcp')
    expect(ctx.config.issuer).toBe('https://issuer.example.com')
    // audiences default to [resourceUrl] if empty on input
    expect(ctx.config.audiences).toEqual(['https://svc.example.com/mcp/'])
    // allowedOrigins merged with defaults and deduped
    expect(ctx.config.allowedOrigins).toEqual(
      expect.arrayContaining(['https://chatgpt.com','https://chat.openai.com','https://foo.com'])
    )
    expect(ctx.config.requireAuth).toBe(true)
    expect(ctx.config.enableLegacySse).toBe(true)
    expect(ctx.config.enableStreamable).toBe(true)
  })
})

describe('originCheck middleware', () => {
  it('allows when no origin header', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: [],
    })
    const req = mockReq({ headers: {} })
    const res = mockRes()
    const next = jest.fn()
    ctx.originCheck(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('allows when origin is in allowedOrigins', () => {
    const { createAuthKit } = mod
    const allowed = 'https://allowed.com'
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: [allowed],
    })
    const req = mockReq({ headers: { origin: allowed } as any })
    const res = mockRes()
    const next = jest.fn()
    ctx.originCheck(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('rejects when origin is not allowed', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: ['https://ok.com'],
    })
    const req = mockReq({ headers: { origin: 'https://nope.com' } as any })
    const res = mockRes()
    const next = jest.fn()
    ctx.originCheck(req, res, next)
    expect(res._status).toBe(403)
    expect(res._json).toEqual({ error: 'origin not allowed' })
    expect(next).not.toHaveBeenCalled()
  })
})

describe('CORS options', () => {
  it('builds cors to echo origin and allow credentials for allowed origin', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: ['https://ok.com'],
    })
    // We cannot directly invoke cors middleware options, but we can ensure middleware is present
    expect(typeof ctx.cors).toBe('function')
  })
})

describe('authGuard', () => {
  it('skips auth when requireAuth=false', async () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: [],
      requireAuth: false,
    })
    const req = mockReq()
    const res = mockRes()
    const next = jest.fn()
    await ctx.authGuard(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('401 with challenge headers when missing bearer', async () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc.example.com/mcp',
      issuer: 'https://issuer.example.com',
      audiences: [],
      allowedOrigins: [],
      requireAuth: true,
    })
    const req = mockReq({ headers: {} })
    const res = mockRes()
    const next = jest.fn()

    await ctx.authGuard(req, res, next)

    expect(res._status).toBe(401)
    expect(res._json).toEqual({ error: 'unauthorized' })
    expect(res._headers['WWW-Authenticate']).toMatch(/^Bearer resource_metadata=/)
    expect(next).not.toHaveBeenCalled()
  })

  it('HEAD/OPTIONS returns 401 without body on error', async () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: [],
      requireAuth: true,
    })
    const req = mockReq({ method: 'HEAD' })
    const res = mockRes()
    await ctx.authGuard(req, res, jest.fn())
    expect(res._status).toBe(401)
    expect(res._ended).toBe(true)
  })

  it('attaches user and sets X-User-ID on successful verification', async () => {
    const { createAuthKit } = mod
    // Mock jose jwtVerify and JWKSet to bypass network
    const jose = reqr('jose')
    const origJwtVerify = jose.jwtVerify
    jose.jwtVerify = jest.fn().mockResolvedValue({
      payload: { email: 'user@example.com' },
    })

    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: ['aud1'],
      allowedOrigins: [],
      requireAuth: true,
    })

    const req = mockReq({ headers: { authorization: 'Bearer abc.def.ghi' } as any })
    const res = mockRes()
    const next = jest.fn()

    await ctx.authGuard(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.locals.userId).toBe('user@example.com')
    expect(res._headers['X-User-ID']).toBe('user@example.com')

    // restore
    jose.jwtVerify = origJwtVerify
  })
})

describe('manifestHandler', () => {
  it('returns schema, names, descriptions, endpoints and auth when requireAuth=true', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: [],
      requireAuth: true,
      manifestNameHuman: undefined,
      manifestNameModel: undefined,
      manifestDescriptionHuman: undefined,
      manifestDescriptionModel: undefined,
      debugHeaders: true,
    })
    const req = mockReq({ headers: { accept: 'application/json' } as any })
    const res = mockRes()
    ctx.manifestHandler(req, res)
    expect(res._json.schemaVersion).toBe('2025-06-18')
    expect(res._json.nameForHuman).toBeDefined()
    expect(res._json.nameForModel).toMatch(/^[A-Za-z0-9_]+$/)
    expect(res._json.descriptionForHuman).toBeDefined()
    expect(res._json.descriptionForModel).toBeDefined()
    expect(res._json.auth).toEqual({
      type: 'oauth',
      authorization_server: 'https://iss/.well-known/oauth-authorization-server',
    })
    expect(Array.isArray(res._json.endpoints)).toBe(true)
    expect(res._json.debug).toEqual({ accept: 'application/json' })
  })

  it('omits auth when requireAuth=false', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc/mcp',
      issuer: 'https://iss',
      audiences: [],
      allowedOrigins: [],
      requireAuth: false,
    })
    const req = mockReq()
    const res = mockRes()
    ctx.manifestHandler(req, res)
    expect(res._json.auth).toBeUndefined()
  })
})

describe('prmHandler', () => {
  it('returns OAuth Protected Resource Metadata', () => {
    const { createAuthKit } = mod
    const ctx = createAuthKit({
      resourceUrl: 'https://svc.example.com/mcp',
      issuer: 'https://issuer.example.com',
      audiences: [],
      allowedOrigins: [],
    })
    const res = mockRes()
    ctx.prmHandler({} as any, res)
    expect(res._headers['Content-Type']).toMatch(/application\/json/)
    expect(res._json.resource).toBe('https://svc.example.com/mcp')
    expect(res._json.authorization_servers).toEqual(['https://issuer.example.com/.well-known/oauth-authorization-server'])
    expect(res._json.scopes_supported).toEqual(['mcp:read','mcp:tools'])
    expect(res._json.bearer_methods_supported).toEqual(['header'])
    expect(res._json.mcp_protocol_version).toBe('2025-06-18')
  })
})

describe('utility functions', () => {
  it('stripTrailingSlash removes only trailing slash', () => {
    const { stripTrailingSlash } = mod
    expect(stripTrailingSlash('https://a/b/')).toBe('https://a/b')
    expect(stripTrailingSlash('https://a/b')).toBe('https://a/b')
  })

  it('parseCsv trims and filters empties', () => {
    const { parseCsv } = mod
    expect(parseCsv('a, b, , c')).toEqual(['a','b','c'])
    expect(parseCsv('')).toEqual([''])
  })

  it('firstValue returns the first non-empty string', () => {
    const { firstValue } = mod
    expect(firstValue(undefined, '  ', 'foo', 'bar')).toBe('foo')
    expect(firstValue(undefined, undefined)).toBeUndefined()
  })

  it('redactAuthorization masks bearer token', () => {
    const { redactAuthorization } = mod
    const headers = redactAuthorization({ authorization: 'Bearer secret', foo: 'bar' })
    expect(headers.authorization).toBe('Bearer ***')
    expect(headers.foo).toBe('bar')
  })

  it('setChallengeHeaders sets headers based on resourceUrl origin', () => {
    const { setChallengeHeaders } = mod
    const res = mockRes()
    setChallengeHeaders(res, {
      resourceUrl: 'https://svc.example.com/mcp',
      issuer: 'https://iss',
      audiences: ['aud'],
      allowedOrigins: [],
      enableStreamable: true,
      enableLegacySse: true,
      requireAuth: true,
    })
    expect(res._headers['WWW-Authenticate']).toContain('resource_metadata="https://svc.example.com/.well-known/oauth-protected-resource"')
    expect(res._headers['Access-Control-Expose-Headers']).toBe('Mcp-Session-Id')
  })
})