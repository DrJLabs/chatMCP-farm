import crypto from 'crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import morgan from 'morgan'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createAuthKit, loadAuthKitOptionsFromEnv, type AuthKitContext } from 'mcp-auth-kit'
import { loadServiceEnvConfig, type ServiceEnvConfig, buildAuthEnv } from './config.js'
import { buildMcpServer, diagnosticsToolMetadata } from './mcp.js'

export interface CreateAppResult {
  app: express.Express
  envConfig: ServiceEnvConfig
  authKit: AuthKitContext
}

export interface CreateAppOptions {
  env?: NodeJS.ProcessEnv
}

export async function createApp(options: CreateAppOptions = {}): Promise<CreateAppResult> {
  const envSource = options.env ?? process.env
  const envConfig = loadServiceEnvConfig(envSource)
  const authEnv = buildAuthEnv(envConfig, envSource)
  const authKit = createAuthKit(loadAuthKitOptionsFromEnv(authEnv))
  const app = express()
  app.set('trust proxy', true)

  const MCP_PROTOCOL_VERSION = '2025-06-18'

  const transports = new Map<string, StreamableHTTPServerTransport>()

  morgan.token('authFlag', req => (req.headers.authorization ? 'present' : 'absent'))
  app.use(morgan(':date[iso] :remote-addr :method :url :status :res[content-length] auth=:authFlag'))

  app.use(authKit.originCheck)
  app.use(authKit.cors)
  app.use(express.json({ limit: '1mb' }))

  const manifestHandler = buildManifestHandler(authKit)

  app.get('/.well-known/mcp/manifest.json', manifestHandler)
  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    if (authKit.config.requireAuth) authKit.setChallengeHeaders(res)
    authKit.prmHandler(req, res)
  })

  app.all(/\/.well-known\/oauth-authorization-server(\/.*)?$/, (req: Request, res: Response) => {
    const issuer = authKit.config.issuer.replace(/\/$/, '')
    const suffix = (req.params as any)[0] || ''
    res.redirect(308, `${issuer}/.well-known/oauth-authorization-server${suffix}`)
  })

  app.get('/', (_req, res) => {
    if (authKit.config.requireAuth) authKit.setChallengeHeaders(res)
    res.json({
      name: authKit.config.manifestNameHuman,
      transports: {
        streamableHttp: authKit.config.enableStreamable,
        sse: authKit.config.enableLegacySse,
      },
      resource: authKit.config.resourceUrl,
      allowedOrigins: authKit.config.allowedOrigins,
      tools: [diagnosticsToolMetadata],
    })
  })

  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'mcp-test-server' }))

  const mcpServer = await buildMcpServer({ allowedOrigins: authKit.config.allowedOrigins })

  function ensureAcceptHeader(req: Request, res: Response) {
    const accept = `${req.headers['accept'] || ''}`
    if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
      if (authKit.config.requireAuth) authKit.setChallengeHeaders(res)
      res.status(406).json({
        error: 'not_acceptable',
        message: 'Accept header must include application/json or text/event-stream',
      })
      return false
    }
    return true
  }

  function mcpHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!ensureAcceptHeader(req, res)) return
    res.setHeader('Mcp-Protocol-Version', MCP_PROTOCOL_VERSION)
    next()
  }

  async function createTransport() {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid: string) => {
        transports.set(sid, transport)
      },
    })
    transport.onclose = () => {
      const sid = transport.sessionId
      if (sid) transports.delete(sid)
    }
    await mcpServer.connect(transport)
    return transport
  }

  const authGuard = authKit.authGuard

  app.options('/mcp', (_req, res) => {
    res.setHeader('Allow', 'OPTIONS,POST,GET,DELETE,HEAD')
    res.status(204).end()
  })

  app.post('/mcp', authGuard, mcpHeadersMiddleware, async (req: Request, res: Response) => {
    try {
      const sid = req.headers['mcp-session-id'] as string | undefined
      const existingTransport = sid ? transports.get(sid) : undefined
      const transport = existingTransport ?? (await createTransport())
      await transport.handleRequest(req as any, res as any, (req as any).body)
    } catch (err) {
      console.error('Streamable POST error', err)
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
    }
  })

  app.get('/mcp', authGuard, mcpHeadersMiddleware, async (req: Request, res: Response) => {
    const sid = req.headers['mcp-session-id'] as string | undefined
    if (!sid) {
      res.status(400).json({ error: 'missing_session' })
      return
    }
    const transport = transports.get(sid)
    if (!transport) {
      res.status(400).json({ error: 'invalid_session' })
      return
    }
    try {
      await transport.handleRequest(req as any, res as any)
    } catch (err) {
      console.error('Streamable GET error', err)
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
    }
  })

  app.delete('/mcp', authGuard, mcpHeadersMiddleware, async (req: Request, res: Response) => {
    const sid = req.headers['mcp-session-id'] as string | undefined
    if (!sid) {
      res.status(400).json({ error: 'missing_session' })
      return
    }
    const transport = transports.get(sid)
    if (!transport) {
      res.status(400).json({ error: 'invalid_session' })
      return
    }
    try {
      await transport.handleRequest(req as any, res as any)
    } catch (err) {
      console.error('Streamable DELETE error', err)
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
    }
  })

  app.head('/mcp', authGuard, async (_req, res) => {
    res.status(204).end()
  })

  return { app, envConfig, authKit }
}

function buildManifestHandler(authKit: AuthKitContext) {
  const fallbackName = 'MCP Service'
  const fallbackModelName = 'mcp_service'
  const fallbackDescriptionHuman = 'OAuth-protected Model Context Protocol server.'
  const fallbackDescriptionModel = 'Provides MCP tools protected by OAuth 2.1.'

  const getManifestNameHuman = () => authKit.config.manifestNameHuman ?? fallbackName
  const getManifestNameModel = () => (authKit.config.manifestNameModel ?? fallbackModelName).replace(/\W+/g, '_')
  const getDescriptionHuman = () => authKit.config.manifestDescriptionHuman ?? fallbackDescriptionHuman
  const getDescriptionModel = () => authKit.config.manifestDescriptionModel ?? fallbackDescriptionModel

  const endpoints = buildEndpointsList(authKit)

  return (req: Request, res: Response) => {
    if (authKit.config.requireAuth) authKit.setChallengeHeaders(res)
    res.json({
      schemaVersion: '2025-06-18',
      nameForHuman: getManifestNameHuman(),
      nameForModel: getManifestNameModel(),
      descriptionForHuman: getDescriptionHuman(),
      descriptionForModel: getDescriptionModel(),
      auth: authKit.config.requireAuth
        ? {
            type: 'oauth',
            authorization_server: `${authKit.config.issuer}/.well-known/oauth-authorization-server`,
          }
        : undefined,
      endpoints,
      capabilities: {
        tools: { values: true },
      },
      tools: [
        {
          name: diagnosticsToolMetadata.name,
          description: diagnosticsToolMetadata.description,
        },
      ],
      metadata: {
        resource: authKit.config.resourceUrl,
        allowedOrigins: authKit.config.allowedOrigins,
      },
      debug: authKit.config.debugHeaders ? { headers: redactHeaders(req.headers) } : undefined,
    })
  }
}

function buildEndpointsList(authKit: AuthKitContext) {
  const endpoints = ['/mcp']
  return endpoints
}

function redactHeaders(headers: Request['headers']) {
  const clone: Record<string, unknown> = { ...headers };
  const headersToRedact = ['authorization', 'cookie', 'proxy-authorization'];

  for (const header of Object.keys(clone)) {
    if (headersToRedact.includes(header.toLowerCase())) {
      clone[header] = '<redacted>';
    }
  }
  return clone;
}
