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

/**
 * Create and configure the Express application for the MCP service.
 *
 * Builds runtime configuration and an AuthKit context from environment variables, mounts request logging,
 * CORS/origin checks, OAuth-protected endpoints, a manifest endpoint, health check, and the MCP endpoints
 * that manage StreamableHTTPServerTransport sessions. Also initializes an MCP server instance and tracks
 * per-session transports.
 *
 * @param options - Optional overrides (e.g., a custom `env` object) used to load configuration.
 * @returns An object containing the configured Express app, the loaded service environment config, and the AuthKit context.
 */
export async function createApp(options: CreateAppOptions = {}): Promise<CreateAppResult> {
  const envSource = options.env ?? process.env
  const envConfig = loadServiceEnvConfig(envSource)
  const authEnv = buildAuthEnv(envConfig, envSource)
  const authKit = createAuthKit(loadAuthKitOptionsFromEnv(authEnv))
  const app = express()
  app.set('trust proxy', true)
  app.disable('x-powered-by')

  const MCP_PROTOCOL_VERSION = process.env.MCP_PROTOCOL_VERSION ?? '2025-06-18'

  const transports = new Map<string, StreamableHTTPServerTransport>()

  type TransportHandleArgs = Parameters<StreamableHTTPServerTransport['handleRequest']>
  type TransportRequest = TransportHandleArgs[0]
  type TransportResponse = TransportHandleArgs[1]
  type TransportBody = TransportHandleArgs[2]

  // Express extends the Node request/response prototypes, which remain compatible with the
  // transport's expectations. Casts are centralized here to document the intent and keep
  // handleRequest invocations type-safe.
  const toTransportRequest = (req: Request): TransportRequest => req as unknown as TransportRequest
  const toTransportResponse = (res: Response): TransportResponse => res as unknown as TransportResponse
  const toTransportBody = (body: unknown): TransportBody => body as TransportBody

  morgan.token('authFlag', req => (req.headers.authorization ? 'present' : 'absent'))
  app.use(morgan(':date[iso] :remote-addr :method :url :status :res[content-length] auth=:authFlag'))

  app.use(authKit.originCheck)
  app.use(authKit.cors)
  const jsonParser = express.json({ limit: '1mb' })
  app.use((req, res, next) => {
    if (req.path === '/mcp') return next()
    return jsonParser(req, res, next)
  })

  const manifestHandler = buildManifestHandler(authKit)

  app.get('/.well-known/mcp/manifest.json', manifestHandler)
  app.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (authKit.config.requireAuth) authKit.setChallengeHeaders(res)
    authKit.prmHandler(req, res)
  })

  app.all(/^\/\.well-known\/oauth-authorization-server(\/.*)?$/, (req: Request, res: Response) => {
    const issuer = authKit.config.issuer.replace(/\/$/, '')
    const suffix = req.path.replace(/^\/\.well-known\/oauth-authorization-server/, '')
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''
    res.redirect(308, `${issuer}/.well-known/oauth-authorization-server${suffix}${query}`)
  })

  app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store')
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

  app.get('/healthz', (_req, res) => res.json({ ok: true, service: 'github-mcp' }))

  const mcpServer = await buildMcpServer({ allowedOrigins: authKit.config.allowedOrigins })

  function ensureAcceptHeader(req: Request, res: Response) {
    const accept = `${req.headers['accept'] ?? ''}`.toLowerCase()
    const acceptsWildcard = accept.includes('*/*')
    if (!acceptsWildcard && !accept.includes('application/json') && !accept.includes('text/event-stream')) {
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
    res.vary('Accept')
    res.setHeader('MCP-Protocol-Version', MCP_PROTOCOL_VERSION)
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

  const getSessionId = (req: Request): string | undefined => {
    const header = req.headers['mcp-session-id']
    if (Array.isArray(header)) return header[0]
    return header as string | undefined
  }

  const withExistingTransport = (
    label: string,
    handler: (req: Request, res: Response, transport: StreamableHTTPServerTransport) => Promise<void> | void,
  ) => {
    return async (req: Request, res: Response) => {
      const sid = getSessionId(req)
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
        await handler(req, res, transport)
      } catch (err) {
        console.error(`Streamable ${label} error`, err)
        if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
      }
    }
  }

  app.post('/mcp', authGuard, mcpHeadersMiddleware, async (req: Request, res: Response) => {
    try {
      const sid = getSessionId(req)
      const existingTransport = sid ? transports.get(sid) : undefined
      const transport = existingTransport ?? (await createTransport())
      const body = (req as Request & { body?: unknown }).body
      if (body !== undefined) {
        await transport.handleRequest(
          toTransportRequest(req),
          toTransportResponse(res),
          toTransportBody(body),
        )
      } else {
        await transport.handleRequest(toTransportRequest(req), toTransportResponse(res))
      }
    } catch (err) {
      console.error('Streamable POST error', err)
      if (!res.headersSent) res.status(500).json({ error: 'internal_error' })
    }
  })

  app.get(
    '/mcp',
    authGuard,
    mcpHeadersMiddleware,
    withExistingTransport('GET', async (req, res, transport) => {
      await transport.handleRequest(toTransportRequest(req), toTransportResponse(res))
    }),
  )

  app.delete(
    '/mcp',
    authGuard,
    mcpHeadersMiddleware,
    withExistingTransport('DELETE', async (req, res, transport) => {
      await transport.handleRequest(toTransportRequest(req), toTransportResponse(res))
    }),
  )

  app.head('/mcp', authGuard, mcpHeadersMiddleware, async (_req, res) => {
    res.status(204).end()
  })

  return { app, envConfig, authKit }
}

/**
 * Creates an Express request handler that serves the MCP service manifest JSON.
 *
 * The returned handler responds with a manifest describing schema version, human/model
 * names and descriptions (with defaults), auth metadata when authentication is required,
 * available endpoints and capabilities, tools metadata, resource and allowed origins,
 * and optional redacted request headers when debugHeaders is enabled.
 *
 * If `authKit.config.requireAuth` is true the handler will set the authentication
 * challenge headers on the response before sending the manifest.
 *
 * @returns An Express request handler (req, res) => void that serializes the manifest to JSON.
 */
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
    res.setHeader('Cache-Control', 'no-store')
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

/**
 * Returns the list of public MCP HTTP endpoints exposed by this service.
 *
 * @returns An array of endpoint paths (currently only `'/mcp'`).
 */
function buildEndpointsList(authKit: AuthKitContext) {
  const endpoints = ['/mcp']
  return endpoints
}

/**
 * Redacts sensitive HTTP headers from a headers object.
 *
 * Replaces values of 'authorization', 'cookie', and 'proxy-authorization' (case-insensitive) with `'<redacted>'`.
 *
 * @param headers - Incoming request headers to redact.
 * @returns A shallow-cloned headers object with sensitive header values replaced by `'<redacted>'`.
 */
function redactHeaders(headers: Request['headers']) {
  const clone: Record<string, unknown> = { ...headers }
  const headersToRedact = [
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-forwarded-authorization',
  ]

  for (const header of Object.keys(clone)) {
    if (headersToRedact.includes(header.toLowerCase())) {
      clone[header] = '<redacted>'
    }
  }
  return clone
}
