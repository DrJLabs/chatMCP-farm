import crypto from 'crypto'
import express, { Request, Response } from 'express'
import morgan from 'morgan'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { loadAuthKitOptionsFromEnv, createAuthKit } from 'mcp-auth-kit'
import { buildMcpServer } from './mcp.js'

const app = express()
app.set('trust proxy', true)

const authKit = createAuthKit(loadAuthKitOptionsFromEnv())
const authConfig = authKit.config
const authGuard = authKit.authGuard

app.use(authKit.originCheck)
app.use(authKit.cors)
app.use(express.json({ limit: '1mb' }))
app.use(morgan(':date[iso] :remote-addr :method :url :status :res[content-length] auth=%req[authorization]'))

app.get('/.well-known/oauth-protected-resource', authKit.prmHandler)
app.get('/.well-known/mcp/manifest.json', authKit.manifestHandler)

app.all(/^\/\.well-known\/oauth-authorization-server(\/.*)?$/, (req: Request, res: Response) => {
  const issuer = authConfig.issuer.replace(/\/$/, '')
  const suffix = (req.params as any)[0] || ''
  res.redirect(308, `${issuer}/.well-known/oauth-authorization-server${suffix}`)
})

app.get('/', (_req, res) => {
  res.json({
    name: authConfig.manifestNameHuman,
    transports: {
      streamableHttp: authConfig.enableStreamable,
      sse: authConfig.enableLegacySse,
    },
    resource: authConfig.resourceUrl,
  })
})

app.get('/healthz', (_req, res) => res.json({ ok: true }))

const mcpServer = await buildMcpServer()
const transports = new Map<string, StreamableHTTPServerTransport>()

function ensureAcceptHeader(req: Request, res: Response) {
  const accept = `${req.headers['accept'] || ''}`
  if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
    if (authConfig.requireAuth) authKit.setChallengeHeaders(res)
    res.status(406).json({
      error: 'Not Acceptable',
      message: 'Accept header must include application/json or text/event-stream',
    })
    return false
  }
  return true
}

async function ensureTransport(sessionId: string | undefined) {
  if (sessionId) {
    const existing = transports.get(sessionId)
    if (existing) return existing
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)),
    onsessioninitialized: (sid: string) => transports.set(sid, transport),
  })
  transport.onclose = () => {
    const sid = transport.sessionId
    if (sid) transports.delete(sid)
  }
  await mcpServer.connect(transport)
  return transport
}

app.options('/mcp', (_req, res) => {
  res.setHeader('Allow', 'OPTIONS,POST,GET,DELETE,HEAD')
  res.status(204).end()
})

app.post('/mcp', authGuard, async (req: Request, res: Response) => {
  if (!ensureAcceptHeader(req, res)) return
  try {
    const sid = req.headers['mcp-session-id'] as string | undefined
    const transport = await ensureTransport(sid)
    await transport.handleRequest(req as any, res as any, (req as any).body)
  } catch (err) {
    console.error('Streamable POST error', err)
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
  }
})

app.get('/mcp', authGuard, async (req: Request, res: Response) => {
  if (!ensureAcceptHeader(req, res)) return
  try {
    const sid = req.headers['mcp-session-id'] as string | undefined
    const transport = sid ? transports.get(sid) : undefined
    if (!transport) return res.status(400).json({ error: 'invalid_session' })
    await transport.handleRequest(req as any, res as any)
  } catch (err) {
    console.error('Streamable GET error', err)
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
  }
})

app.delete('/mcp', authGuard, async (req: Request, res: Response) => {
  if (!ensureAcceptHeader(req, res)) return
  try {
    const sid = req.headers['mcp-session-id'] as string | undefined
    const transport = sid ? transports.get(sid) : undefined
    if (!transport) return res.status(400).json({ error: 'invalid_session' })
    await transport.handleRequest(req as any, res as any)
  } catch (err) {
    console.error('Streamable DELETE error', err)
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
  }
})

app.head('/mcp', authGuard, async (_req, res) => {
  res.status(204).end()
})

const port = Number(process.env.PORT ?? '8765')
app.listen(port, () => {
  console.log(`MCP service template listening on :${port}`)
})
