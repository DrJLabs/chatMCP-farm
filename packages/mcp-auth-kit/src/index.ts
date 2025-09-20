import type { Request, Response, NextFunction, RequestHandler } from 'express'
import cors, { type CorsOptions } from 'cors'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export type { AuthEnvVariable, AuthEnvSummary } from './env.js'
export { AUTH_ENV_VARS, summarizeAuthEnv } from './env.js'

export interface AuthKitOptions {
  resourceUrl: string
  issuer: string
  audiences: string[]
  allowedOrigins: string[]
  manifestNameHuman?: string
  manifestNameModel?: string
  manifestDescriptionHuman?: string
  manifestDescriptionModel?: string
  enableStreamable?: boolean
  enableLegacySse?: boolean
  requireAuth?: boolean
  debugHeaders?: boolean
}

export interface AuthKitContext {
  config: ResolvedAuthKitOptions
  originCheck: RequestHandler
  cors: RequestHandler
  authGuard: RequestHandler
  setChallengeHeaders(res: Response): void
  manifestHandler(req: Request, res: Response): void
  prmHandler(req: Request, res: Response): void
}

interface ResolvedAuthKitOptions extends AuthKitOptions {
  resourceUrl: string
  issuer: string
  audiences: string[]
  allowedOrigins: string[]
  enableStreamable: boolean
  enableLegacySse: boolean
  requireAuth: boolean
}

const DEFAULT_ALLOWED_ORIGINS = ['https://chatgpt.com', 'https://chat.openai.com']
const DEFAULT_MODEL_NAME = 'openmemory_mcp'
const DEFAULT_HUMAN_NAME = 'OpenMemory MCP'
const DEFAULT_DESCRIPTION_HUMAN = 'OAuth-protected Model Context Protocol server.'
const DEFAULT_DESCRIPTION_MODEL = 'Provides MCP tools protected by OAuth 2.1.'

export function loadAuthKitOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AuthKitOptions {
  const resource = firstValue(env.MCP_RESOURCE_URL, env.MCP_PUBLIC_BASE_URL, env.PRM_RESOURCE_URL)
  const issuer = env.OIDC_ISSUER
  const audienceList = env.OIDC_AUDIENCE ?? env.MCP_AUDIENCE ?? ''
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : []
  return {
    resourceUrl: resource ?? 'https://<your-mcp-host>/mcp',
    issuer: issuer ?? 'https://oauth.example.com/auth/realms/REALM',
    audiences: parseCsv(audienceList),
    allowedOrigins,
    manifestNameHuman: env.MCP_NAME_HUMAN,
    manifestNameModel: env.MCP_NAME_MODEL,
    manifestDescriptionHuman: env.MCP_DESCRIPTION_HUMAN,
    manifestDescriptionModel: env.MCP_DESCRIPTION_MODEL,
    enableStreamable: env.ENABLE_STREAMABLE ? env.ENABLE_STREAMABLE.toLowerCase() !== 'false' : true,
    enableLegacySse: env.ENABLE_SSE ? env.ENABLE_SSE.toLowerCase() !== 'false' : true,
    requireAuth: env.REQUIRE_AUTH ? env.REQUIRE_AUTH.toLowerCase() !== 'false' : true,
    debugHeaders: env.DEBUG_HEADERS ? env.DEBUG_HEADERS.toLowerCase() === 'true' : false,
  }
}

export function createAuthKit(options: AuthKitOptions): AuthKitContext {
  const config: ResolvedAuthKitOptions = {
    ...options,
    resourceUrl: stripTrailingSlash(options.resourceUrl),
    issuer: stripTrailingSlash(options.issuer),
    audiences: options.audiences.length > 0 ? options.audiences : [options.resourceUrl],
    allowedOrigins: Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...options.allowedOrigins])).filter(Boolean),
    enableStreamable: options.enableStreamable ?? true,
    enableLegacySse: options.enableLegacySse ?? true,
    requireAuth: options.requireAuth ?? true,
  }

  const jwks = createRemoteJWKSet(new URL(`${config.issuer}/protocol/openid-connect/certs`))

  const originCheck: RequestHandler = (req, res, next) => {
    const origin = req.headers.origin as string | undefined
    if (!origin || config.allowedOrigins.includes(origin)) {
      return next()
    }
    res.status(403).json({ error: 'origin not allowed' })
  }

  const corsMiddleware = cors(buildCorsOptions(config))

  const authGuard: RequestHandler = async (req, res, next) => {
    if (!config.requireAuth) return next()
    try {
      const hdr = String(req.headers.authorization || '')
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : ''
      if (!token) throw new Error('missing bearer')
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audiences,
      })
      const userId = String(payload.email ?? payload.sub ?? 'unknown')
      attachUser(res, userId)
      res.setHeader('X-User-ID', userId)
      return next()
    } catch (err) {
      setChallengeHeaders(res, config)
      if (req.method === 'HEAD' || req.method === 'OPTIONS') {
        return res.status(401).end()
      }
      return res.status(401).json({ error: 'unauthorized' })
    }
  }

  const manifestHandler = (req: Request, res: Response) => {
    const accept = req.headers['accept']
    if (config.debugHeaders) {
      console.debug('[manifest] headers', redactAuthorization(req.headers))
    }
    res.json({
      schemaVersion: '2025-06-18',
      nameForHuman: config.manifestNameHuman ?? DEFAULT_HUMAN_NAME,
      nameForModel: (config.manifestNameModel ?? DEFAULT_MODEL_NAME).replace(/\W+/g, '_'),
      descriptionForHuman: config.manifestDescriptionHuman ?? DEFAULT_DESCRIPTION_HUMAN,
      descriptionForModel: config.manifestDescriptionModel ?? DEFAULT_DESCRIPTION_MODEL,
      auth: config.requireAuth
        ? {
            type: 'oauth',
            authorization_server: `${config.issuer}/.well-known/oauth-authorization-server`,
          }
        : undefined,
      endpoints: buildEndpointList(config),
      debug: config.debugHeaders ? { accept } : undefined,
    })
  }

  const prmHandler = (_req: Request, res: Response) => {
    const authorizationServer = `${config.issuer}/.well-known/oauth-authorization-server`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.json({
      resource: config.resourceUrl,
      authorization_servers: [authorizationServer],
      scopes_supported: ['mcp:read', 'mcp:tools'],
      bearer_methods_supported: ['header'],
      mcp_protocol_version: '2025-06-18',
    })
  }

  return {
    config,
    originCheck,
    cors: corsMiddleware,
    authGuard,
    setChallengeHeaders: res => setChallengeHeaders(res, config),
    manifestHandler,
    prmHandler,
  }
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.find(v => typeof v === 'string' && v.trim().length > 0)
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function buildCorsOptions(config: ResolvedAuthKitOptions): CorsOptions {
  return {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, origin ?? true)
      }
      return callback(new Error('origin not allowed'))
    },
    credentials: true,
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Authorization', 'Content-Type', 'MCP-Protocol-Version', 'Mcp-Session-Id', 'Mcp-Client-Request-Id'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
  }
}

function setChallengeHeaders(res: Response, config: ResolvedAuthKitOptions) {
  const metadataUrl = `${new URL(config.resourceUrl).origin}/.well-known/oauth-protected-resource`
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${metadataUrl}"`)
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
}

function attachUser(res: Response, userId: string) {
  res.locals.userId = userId
}

function buildEndpointList(config: ResolvedAuthKitOptions): string[] {
  const endpoints = ['/mcp']
  if (config.enableLegacySse) {
    endpoints.push('/mcp/sse', '/sse')
  }
  return endpoints
}

function redactAuthorization(headers: Request['headers']) {
  const clone = { ...headers }
  if (clone.authorization) clone.authorization = 'Bearer ***'
  return clone
}

export type { ResolvedAuthKitOptions }
