import crypto from 'crypto'
import * as fs from 'node:fs/promises'
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express'
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

interface ProxyStats {
  enabled: boolean
  totalRequests: number
  totalErrors: number
  lastStatus?: number
  lastDurationMs?: number
  lastSuccessAt?: number
  lastFailureAt?: number
  lastErrorMessage?: string
}

const DEFAULT_PROTOCOL_VERSION = '2025-06-18'
const DEFAULT_BRIDGE_LOG_FILE = '/var/log/bridge/bridge.log'
const DEFAULT_BRIDGE_LOG_TAIL_BYTES = 64 * 1024
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000
const MCP_HEADER_PREFIX = /^mcp-/i
const FORWARDED_HEADER_WHITELIST = new Set(['accept', 'authorization', 'content-type'])

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value.join(',') : String(value)
}

function buildUpstreamHeaders(req: Request, protocolVersion: string, body?: Buffer): Record<string, string> {
  const headers: Record<string, string> = {}

  for (const [key, rawValue] of Object.entries(req.headers)) {
    const normalizedKey = key.toLowerCase()
    if (!MCP_HEADER_PREFIX.test(normalizedKey) && !FORWARDED_HEADER_WHITELIST.has(normalizedKey)) continue
    const value = normalizeHeaderValue(rawValue)
    if (value !== undefined) headers[normalizedKey] = value
  }

  headers['mcp-protocol-version'] = protocolVersion
  if (!headers.accept) headers.accept = 'application/json'
  if (body && !headers['content-type']) headers['content-type'] = 'application/json'

  return headers
}

function buildUpstreamUrl(baseUrl: string, req: Request) {
  const target = new URL(baseUrl)
  const searchIndex = req.originalUrl.indexOf('?')
  if (searchIndex !== -1) {
    target.search = req.originalUrl.slice(searchIndex)
  }
  return target
}

async function readRequestBody(req: Request): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'DELETE' || req.method === 'HEAD') return undefined
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) return undefined
  return Buffer.concat(chunks)
}

async function tailLogFile(filePath: string, maxBytes: number): Promise<string | undefined> {
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const stats = await handle.stat()
      if (stats.size === 0) return ''
      const start = Math.max(0, stats.size - maxBytes)
      const length = stats.size - start
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, start)
      return buffer.toString('utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function fetchWithTimeout(input: URL | string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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

  const protocolVersion = envSource.MCP_PROTOCOL_VERSION ?? DEFAULT_PROTOCOL_VERSION
  const upstreamUrl = envSource.MCP_UPSTREAM_URL
  const upstreamHealthUrl = envSource.MCP_UPSTREAM_HEALTH_URL
  const upstreamMetricsUrl = envSource.MCP_UPSTREAM_METRICS_URL
  const bridgeLogFile = envSource.MCP_BRIDGE_LOG_FILE ?? DEFAULT_BRIDGE_LOG_FILE
  const bridgeLogTailBytes = parsePositiveInt(envSource.MCP_BRIDGE_LOG_TAIL_BYTES, DEFAULT_BRIDGE_LOG_TAIL_BYTES)
  const upstreamTimeoutMs = parsePositiveInt(envSource.MCP_UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS)

  const proxyStats: ProxyStats = {
    enabled: Boolean(upstreamUrl),
    totalRequests: 0,
    totalErrors: 0,
  }

  const useProxy = proxyStats.enabled && typeof upstreamUrl === 'string'

  const transports = new Map<string, StreamableHTTPServerTransport>()

  type TransportHandleArgs = Parameters<StreamableHTTPServerTransport['handleRequest']>
  type TransportRequest = TransportHandleArgs[0]
  type TransportResponse = TransportHandleArgs[1]
  type TransportBody = TransportHandleArgs[2]

  // Express extends the Node request/response prototypes, which remain compatible with the
  // transport's expectations. Casts are centralized here to document the intent and keep
  // handleRequest invocations type-safe.
  const toTransportRequest = (req: Request): TransportRequest => req as unknown as TransportRequest
  const toTransportResponse = (res: ExpressResponse): TransportResponse => res as unknown as TransportResponse
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

  app.all(/^\/\.well-known\/oauth-authorization-server(\/.*)?$/, (req: Request, res: ExpressResponse) => {
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

  function ensureAcceptHeader(req: Request, res: ExpressResponse) {
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

  function mcpHeadersMiddleware(req: Request, res: ExpressResponse, next: NextFunction) {
    if (!ensureAcceptHeader(req, res)) return
    res.vary('Accept')
    res.setHeader('MCP-Protocol-Version', protocolVersion)
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

  async function proxyMcpRequest(req: Request, res: ExpressResponse, body?: Buffer) {
    if (!upstreamUrl) {
      res.status(503).json({ error: 'bridge_disabled' })
      return
    }

    const target = buildUpstreamUrl(upstreamUrl, req)
    const headers = buildUpstreamHeaders(req, protocolVersion, body)
    const serializedBody = body ? body.toString('utf8') : undefined

    const init: RequestInit = {
      method: req.method,
      headers,
      body: serializedBody,
      redirect: 'manual',
    }

    proxyStats.totalRequests += 1
    const start = Date.now()

    try {
      const response = await fetchWithTimeout(target, init, upstreamTimeoutMs)
      proxyStats.lastStatus = response.status
      proxyStats.lastDurationMs = Date.now() - start

      if (response.ok) {
        proxyStats.lastSuccessAt = Date.now()
      } else {
        proxyStats.totalErrors += 1
        proxyStats.lastFailureAt = Date.now()
      }

      response.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase()
        if (lowerKey.startsWith('mcp-') || lowerKey === 'content-type' || lowerKey === 'content-length') {
          res.setHeader(key, value)
        }
      })

      const buffer = Buffer.from(await response.arrayBuffer())
      res.status(response.status)
      if (buffer.length > 0) {
        res.send(buffer)
      } else {
        res.end()
      }
    } catch (error) {
      proxyStats.totalErrors += 1
      proxyStats.lastFailureAt = Date.now()
      proxyStats.lastErrorMessage = error instanceof Error ? error.message : String(error)
      console.error('MCP upstream proxy error', error)
      if (!res.headersSent) {
        const status = error instanceof Error && error.name === 'AbortError' ? 504 : 502
        res.status(status).json({ error: 'upstream_failure', message: proxyStats.lastErrorMessage })
      }
    }
  }

  async function checkUpstreamHealth(url: string) {
    const start = Date.now()
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
        },
        upstreamTimeoutMs,
      )
      const durationMs = Date.now() - start
      const contentType = response.headers.get('content-type') ?? ''
      let body: unknown
      if (contentType.includes('application/json')) {
        body = await response.json().catch(() => undefined)
      } else {
        const text = await response.text().catch(() => undefined)
        body = text?.slice(0, 512)
      }
      return {
        ok: response.ok,
        status: response.status,
        durationMs,
        body,
      }
    } catch (error) {
      return {
        ok: false,
        status: undefined,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async function fetchMetricsSnippet(url: string) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: { accept: 'text/plain' },
        },
        upstreamTimeoutMs,
      )
      const text = await response.text().catch(() => '')
      return {
        status: response.status,
        sample: text.slice(0, 1024),
      }
    } catch (error) {
      return {
        status: undefined,
        error: error instanceof Error ? error.message : String(error),
      }
    }
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
    handler: (req: Request, res: ExpressResponse, transport: StreamableHTTPServerTransport) => Promise<void> | void,
  ) => {
    return async (req: Request, res: ExpressResponse) => {
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

  app.post('/mcp', authGuard, mcpHeadersMiddleware, async (req: Request, res: ExpressResponse) => {
    if (useProxy) {
      const body = await readRequestBody(req)
      await proxyMcpRequest(req, res, body)
      return
    }
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

  const handleExistingGet = withExistingTransport('GET', async (req, res, transport) => {
    await transport.handleRequest(toTransportRequest(req), toTransportResponse(res))
  })

  const handleExistingDelete = withExistingTransport('DELETE', async (req, res, transport) => {
    await transport.handleRequest(toTransportRequest(req), toTransportResponse(res))
  })

  app.get('/mcp', authGuard, mcpHeadersMiddleware, async (req, res) => {
    if (useProxy) {
      await proxyMcpRequest(req, res)
      return
    }
    await handleExistingGet(req, res)
  })

  app.delete('/mcp', authGuard, mcpHeadersMiddleware, async (req, res) => {
    if (useProxy) {
      await proxyMcpRequest(req, res)
      return
    }
    await handleExistingDelete(req, res)
  })

  app.head('/mcp', authGuard, mcpHeadersMiddleware, async (req, res) => {
    if (useProxy) {
      await proxyMcpRequest(req, res)
      return
    }
    res.status(204).end()
  })

  app.get('/observability/bridge/logs', authGuard, async (req, res) => {
    if (!useProxy) {
      res.status(404).json({ error: 'bridge_disabled' })
      return
    }

    const bytesParamRaw = req.query['bytes']
    const bytesParam = Array.isArray(bytesParamRaw) ? bytesParamRaw[0] : bytesParamRaw
    const tailBytes = parsePositiveInt(typeof bytesParam === 'string' ? bytesParam : undefined, bridgeLogTailBytes)

    try {
      const contents = await tailLogFile(bridgeLogFile, tailBytes)
      if (contents === undefined) {
        res.status(204).end()
        return
      }
      res.type('text/plain').send(contents)
    } catch (error) {
      console.error('Bridge log read error', error)
      res.status(500).json({ error: 'log_unavailable' })
    }
  })

  app.get('/observability/bridge/status', authGuard, async (req, res) => {
    if (!useProxy) {
      res.json({ enabled: false })
      return
    }

    const includeSamplesRaw = req.query['sample']
    const includeSamplesValue = Array.isArray(includeSamplesRaw) ? includeSamplesRaw[0] : includeSamplesRaw
    const includeSamples = includeSamplesValue === 'true'

    const payload: Record<string, unknown> = {
      enabled: true,
      upstreamUrl,
      proxy: proxyStats,
      logFile: bridgeLogFile,
    }

    if (upstreamHealthUrl) {
      payload.health = await checkUpstreamHealth(upstreamHealthUrl)
    }

    if (upstreamMetricsUrl) {
      payload.metrics = includeSamples
        ? { url: upstreamMetricsUrl, sample: await fetchMetricsSnippet(upstreamMetricsUrl) }
        : { url: upstreamMetricsUrl }
    }

    res.json(payload)
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

  return (req: Request, res: ExpressResponse) => {
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
