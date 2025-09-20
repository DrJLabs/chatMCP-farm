import express, { Request, Response } from 'express'
import morgan from 'morgan'
import { loadAuthKitOptionsFromEnv, createAuthKit } from 'mcp-auth-kit'
import { buildMcpServer } from './mcp.js'

// MCP transports
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import crypto from 'crypto'

const app = express()
// behind Traefik/CF; trust proxy for correct IPs
app.set('trust proxy', true)

const authKitOptions = loadAuthKitOptionsFromEnv()
const authKit = createAuthKit({
  ...authKitOptions,
  manifestDescriptionHuman:
    authKitOptions.manifestDescriptionHuman ??
    'OpenMemory tools (search/add) protected by OAuth via Keycloak.',
  manifestDescriptionModel:
    authKitOptions.manifestDescriptionModel ??
    'Provides memory.search and memory.add tools via OpenMemory backend; uses OAuth.',
})
const authConfig = authKit.config
const REQUIRE_AUTH = authConfig.requireAuth
const ENABLE_SSE = authConfig.enableLegacySse
const ENABLE_STREAMABLE = authConfig.enableStreamable
const authGuard = authKit.authGuard

if (!ENABLE_SSE) {
  console.log('[transport] SSE fallback disabled; set ENABLE_SSE=true to expose /sse routes')
}

app.use(authKit.originCheck)
app.use(authKit.cors)
// Assign request id and expose it
app.use((req, res, next) => {
  try {
    const id = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2)
    ;(req as any)._rid = id
    res.setHeader('X-Request-Id', id)
  } catch {}
  next()
})
// Morgan with extra tokens helpful for MCP debugging
morgan.token('rid', (req: any) => req._rid || '-')
morgan.token('accept', (req: any) => req.headers['accept'] || '-')
morgan.token('origin', (req: any) => req.headers['origin'] || '-')
morgan.token('mcpid', (req: any) => req.headers['mcp-session-id'] || '-')
morgan.token('auth', (req: any) => (req.headers['authorization'] ? 'yes' : 'no'))
app.use(morgan(':date[iso] :rid :remote-addr :method :url :status :res[content-length] ua=":user-agent" accept=":accept" origin=":origin" mcp=":mcpid" auth=":auth"'))

function logReq(tag: string, req: Request) {
  try {
    const rid = (req as any)._rid || '-'
    const h = req.headers as any
    console.log(`[${tag}] rid=${rid} ip=${(req as any).ip} method=${req.method} path=${(req as any).path} host=${h['host']} ua="${h['user-agent']}" accept="${h['accept']}" origin="${h['origin']}" referer="${h['referer']||''}" mcp-session-id="${h['mcp-session-id']||''}" auth=${!!h['authorization']}`)
    if (authConfig.debugHeaders) {
      const redacted = { ...h, authorization: h['authorization'] ? 'Bearer ***' : undefined }
      console.log(`[${tag}] headers=`, redacted)
    }
  } catch (e) {}
}
app.use(express.json({ limit: '1mb' }))

// PRM endpoint for MCP
app.get('/.well-known/oauth-protected-resource', authKit.prmHandler)

// MCP manifest for discovery
app.get('/.well-known/mcp/manifest.json', (req: Request, res: Response) => {
  logReq('manifest', req)
  authKit.manifestHandler(req, res)
})

// Authorization Server metadata must be served by Keycloak (issuer), not MCP.
// Redirect any GET/HEAD (and suffix variants) hitting the MCP host to the issuer to avoid discovery loops.
app.all(/^\/\.well-known\/oauth-authorization-server(\/.*)?$/, (req: Request, res: Response) => {
  const issuerEnv = process.env.OIDC_ISSUER
  if (!issuerEnv) return res.status(500).json({ error: 'OIDC_ISSUER not set' })
  const issuer = issuerEnv.replace(/\/$/, '')
  const suffix = (req.params as any)[0] || ''
  const dest = `${issuer}/.well-known/oauth-authorization-server${suffix || ''}`
  res.redirect(308, dest)
})

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }))

// Friendly root (avoids 404 noise from client probes)
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'OpenMemory MCP',
    endpoints: ['/mcp', '/mcp/sse', '/sse', '/.well-known/mcp/manifest.json', '/.well-known/oauth-protected-resource'],
    auth: REQUIRE_AUTH ? 'oauth' : 'disabled'
  })
})

// OIDC debug endpoint: fetch discovery + JWKS from the configured issuer
app.get('/debug/oidc', async (_req: Request, res: Response) => {
  logReq('debug/oidc', _req)
  const issuerEnv = process.env.OIDC_ISSUER
  if (!issuerEnv) {
    return res.status(500).json({ issuer: '', ok: false, error: 'OIDC_ISSUER not set' })
  }
  const issuer = issuerEnv.replace(/\/$/, '')
  const out: any = { issuer, ok: false }
  try {
    const discoUrl = `${issuer}/.well-known/openid-configuration`
    out.discovery_url = discoUrl
    const t0 = Date.now()
    const r = await fetch(discoUrl, { redirect: 'follow' })
    out.discovery_status = r.status
    out.discovery_ct = r.headers.get('content-type') || ''
    const j = await r.json()
    out.discovery_time_ms = Date.now() - t0
    out.discovery_issuer = j.issuer
    out.discovery_matches_issuer = j.issuer === issuer
    out.jwks_uri = j.jwks_uri
    // Fetch JWKS
    if (j.jwks_uri) {
      const t1 = Date.now()
      const r2 = await fetch(j.jwks_uri)
      out.jwks_status = r2.status
      out.jwks_ct = r2.headers.get('content-type') || ''
      await r2.text() // don't echo keys
      out.jwks_time_ms = Date.now() - t1
    }
    out.ok = r.ok
    res.json(out)
  } catch (e: any) {
    out.error = String(e?.message || e)
    res.status(502).json(out)
  }
})

// Debug configuration snapshot
app.get('/debug/config', (_req: Request, res: Response) => {
  logReq('debug/config', _req)
  res.json({
    require_auth: REQUIRE_AUTH,
    issuer: authConfig.issuer,
    audiences: authConfig.audiences,
    resource: authConfig.resourceUrl,
    allowed_origins: authConfig.allowedOrigins,
    transports: { sse: ENABLE_SSE, streamable: ENABLE_STREAMABLE },
  })
})

// MCP server setup
const transports: Record<string, any> = {}
const mcpServer = await buildMcpServer()

// SSE transport routes (primary). Aliases: /mcp/sse and /sse
if (ENABLE_SSE) {
  // Legacy SSE: GET /sse starts stream
  app.get('/sse', authGuard, async (req: Request, res: Response) => {
    logReq('sse', req as any)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    const transport = new SSEServerTransport('/messages', res)
    transports[transport.sessionId] = transport
    res.on('close', () => { delete transports[transport.sessionId] })
    await (mcpServer as any).connect(transport)
  })
  // Some clients may POST to /sse; respond 405 with PRM hint
  app.post('/sse', async (req: Request, res: Response) => {
    logReq('sse-post', req)
    if (REQUIRE_AUTH) authKit.setChallengeHeaders(res)
    res.status(405).json({ error: 'Method Not Allowed: use GET for SSE' })
  })
  app.post('/messages', authGuard, express.json({ limit: '4mb' }), async (req: Request, res: Response) => {
    logReq('messages', req as any)
    const sessionId = (req.query.sessionId as string) || ''
    const transport = transports[sessionId]
    if (!transport || !(transport instanceof SSEServerTransport)) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid SSE session' }, id: null })
    }
    await transport.handlePostMessage(req as any, res as any, (req as any).body)
  })
  app.get('/mcp/sse', authGuard, async (req: Request, res: Response) => {
    logReq('mcp/sse', req as any)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    const transport = new SSEServerTransport('/mcp/messages', res)
    transports[transport.sessionId] = transport
    res.on('close', () => { delete transports[transport.sessionId] })
    await (mcpServer as any).connect(transport)
  })
  // HEAD support on /mcp/sse to advertise 401 with PRM hint when unauthenticated
  app.head('/mcp/sse', authGuard, async (_req: Request, res: Response) => {
    res.status(204).end()
  })
  app.post('/mcp/sse', async (req: Request, res: Response) => {
    logReq('mcp/sse-post', req)
    if (REQUIRE_AUTH) authKit.setChallengeHeaders(res)
    res.status(405).json({ error: 'Method Not Allowed: use GET for SSE' })
  })
  app.post('/mcp/messages', authGuard, express.json({ limit: '4mb' }), async (req: Request, res: Response) => {
    logReq('mcp/messages', req as any)
    const sessionId = (req.query.sessionId as string) || ''
    const transport = transports[sessionId]
    if (!transport || !(transport instanceof SSEServerTransport)) {
      return res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: No valid SSE session' }, id: null })
    }
    await transport.handlePostMessage(req as any, res as any, (req as any).body)
  })
  app.get('/mcp/messages', authGuard, async (_req: Request, res: Response) => {
    res.status(405).json({ error: 'Method Not Allowed: use POST with sessionId' })
  })
}

// Streamable HTTP (newer clients)
if (ENABLE_STREAMABLE) {
  const transportsForStream: Record<string, any> = transports

  app.post('/mcp', authGuard, async (req: Request, res: Response) => {
    try {
      console.log('[Streamable] POST /mcp body=', (req as any).body)
      const sid = req.headers['mcp-session-id'] as string | undefined
      let transport: any = sid ? transportsForStream[sid] : undefined

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
          onsessioninitialized: (sessionId: string) => { transportsForStream[sessionId] = transport },
        })
        transport.onclose = () => {
          const s = transport.sessionId
          if (s) delete transportsForStream[s]
        }
        await (mcpServer as any).connect(transport)
      }

      await transport.handleRequest(req as any, res as any, (req as any).body)
    } catch (e) {
      console.error('Streamable POST error', e)
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
      }
    }
  })

  app.get('/mcp', authGuard, async (req: Request, res: Response) => {
    try {
      const sid = req.headers['mcp-session-id'] as string | undefined
      const transport = sid ? transportsForStream[sid] : undefined
      if (!transport) return res.status(400).send('Invalid or missing session ID')
      await transport.handleRequest(req as any, res as any)
    } catch (e) {
      console.error('Streamable GET error', e)
      if (!res.headersSent) res.status(500).send('Internal server error')
    }
  })

  app.head('/mcp', authGuard, async (_req: Request, res: Response) => {
    res.status(204).end()
  })

  app.delete('/mcp', authGuard, async (req: Request, res: Response) => {
    try {
      const sid = req.headers['mcp-session-id'] as string | undefined
      const transport = sid ? transportsForStream[sid] : undefined
      if (!transport) return res.status(400).send('Invalid or missing session ID')
      await transport.handleRequest(req as any, res as any)
    } catch (e) {
      console.error('Streamable DELETE error', e)
      if (!res.headersSent) res.status(500).send('Internal server error')
    }
  })
}

const PORT = parseInt(process.env.PORT || '8765', 10)
app.listen(PORT, () => {
  console.log(`OpenMemory MCP (TS) on :${PORT}`)
  console.log(`  Auth: ${REQUIRE_AUTH ? 'JWT (Keycloak)' : 'DISABLED'}`)
  console.log(`  Transports: SSE=${ENABLE_SSE} StreamableHTTP=${ENABLE_STREAMABLE}`)
  console.log('  Endpoints: /mcp (POST), /mcp/sse (GET), /sse (GET), /.well-known/oauth-protected-resource')
})
