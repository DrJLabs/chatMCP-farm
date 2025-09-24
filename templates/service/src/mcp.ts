import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeJwt } from 'jose'
import { z } from 'zod'

const pingInputSchema = z
  .object({
    note: z.string().max(240).optional(),
  })
  .strict()

type PingArgs = z.infer<typeof pingInputSchema>

const headerBagSchema = z.record(z.union([z.string(), z.array(z.string())]))

const diagnosticsAuthInfoSchema = z
  .object({
    token: z.string().optional(),
    clientId: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    resource: z.union([z.string(), z.instanceof(URL)]).optional(),
    expiresAt: z.number().optional(),
    extra: z.record(z.unknown()).optional(),
  })
  .passthrough()

const diagnosticsRequestInfoSchema = z
  .object({
    headers: z.union([z.instanceof(Headers), headerBagSchema]).optional(),
  })
  .passthrough()

const diagnosticsExtraSchema = z
  .object({
    authInfo: diagnosticsAuthInfoSchema.optional(),
    requestInfo: diagnosticsRequestInfoSchema.optional(),
  })
  .passthrough()

type DiagnosticsAuthInfo = z.infer<typeof diagnosticsAuthInfoSchema>
type DiagnosticsRequestInfo = z.infer<typeof diagnosticsRequestInfoSchema>
type DiagnosticsExtra = z.infer<typeof diagnosticsExtraSchema>

type HeaderBag = Record<string, string | string[]>

export interface BuildMcpServerOptions {
  allowedOrigins: string[]
}

export interface DiagnosticsMetadata {
  allowedOrigins: string[]
  note?: string | null
  timestamp: string
  token?: {
    subject?: string
    audiences?: string[]
    expiresAt?: string
    scopes?: string[]
    clientId?: string
    resource?: string
  }
  origin?: string | null
  userId?: string | null
  rateLimit?: {
    limit?: number
    remaining?: number
    resetAt?: string
    retryAfter?: string
  }
}

export const diagnosticsToolMetadata = {
  name: 'diagnostics.ping',
  description:
    'Returns a deterministic response containing service metadata. Use to confirm OAuth + Streamable HTTP wiring.',
}

/**
 * Create and configure an MCP server with a diagnostics "ping" tool.
 *
 * The server is named from MCP_SERVER_NAME/MCP_SERVER_VERSION environment variables
 * (falling back to defaults) and registers a tool that returns a JSON-formatted
 * diagnostics payload constructed from the provided ping args and extra metadata.
 *
 * @param options - Configuration for the server. Only `allowedOrigins` is used by the diagnostics payload to indicate which origins are permitted.
 * @returns A configured McpServer instance with the diagnostics ping tool registered.
 */
export async function buildMcpServer(options: BuildMcpServerOptions) {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || '__SERVICE_NAME__',
    version: process.env.MCP_SERVER_VERSION || '0.1.0',
  })

  server.registerTool(
    diagnosticsToolMetadata.name,
    {
      description: diagnosticsToolMetadata.description,
      inputSchema: pingInputSchema.shape,
    },
    async (args: PingArgs | undefined, extra: unknown) => {
      const parsedExtra = diagnosticsExtraSchema.safeParse(extra)
      const diagnosticsExtra: DiagnosticsExtra = parsedExtra.success ? parsedExtra.data : {}
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(buildDiagnosticsPayload(args, diagnosticsExtra, options), null, 2),
          },
        ],
      }
    },
  )

  return server
}

/**
 * Retrieve a single header value from either a Headers instance or a header bag.
 *
 * Looks up `name` on the provided `headers`. If `headers` is a `Headers` object, its `get`
 * method is used. If `headers` is a header bag (Record<string, string | string[]>), the
 * function checks the exact key and then the lowercased key. If the stored value is an
 * array, the first element is returned. Returns `null` when the header is missing.
 *
 * @param headers - A `Headers` instance or a header bag (string -> string | string[]); may be undefined.
 * @param name - The header name to retrieve.
 * @returns The header value (first element if an array) or `null` if not present.
 */
function getHeader(
  headers: DiagnosticsRequestInfo['headers'] | undefined,
  name: string,
): string | null {
  if (!headers) return null
  if (typeof (headers as Headers).get === 'function') {
    return ((headers as Headers).get(name) ?? null) as string | null
  }
  const bag = headers as HeaderBag
  const target = name.toLowerCase()
  for (const key of Object.keys(bag)) {
    if (key === name || key.toLowerCase() === target) {
      const candidate = bag[key]
      if (Array.isArray(candidate)) {
        return candidate[0] ?? null
      }
      return candidate ?? null
    }
  }
  return null
}

/**
 * Build a DiagnosticsMetadata object from ping arguments, request/execution extras, and server options.
 *
 * Produces metadata used by the diagnostics.ping tool: includes the current timestamp, configured allowed origins,
 * an optional note from `args`, an extracted `origin` header from `extra.requestInfo.headers`, user identification,
 * and token details when `extra.authInfo` is present. If `authInfo.token` is provided the function attempts to
 * decode it as a JWT to populate `subject`, `audiences`, and `expiresAt`; if decoding fails those JWT-derived
 * fields are cleared and a warning is logged.
 *
 * @param args - Optional ping input; `args.note`, if present, is copied into `note` in the metadata.
 * @param extra - Structured extra diagnostics data; may contain `authInfo` (scopes, clientId, resource, expiresAt, token)
 *                and `requestInfo.headers` (a Headers instance or header bag) used to populate token and origin fields.
 * @param options - Server build options; `options.allowedOrigins` is copied into the metadata's `allowedOrigins`.
 * @returns The constructed DiagnosticsMetadata with timestamp, allowedOrigins, note, origin, userId, and optional token info.
 */
export function buildDiagnosticsPayload(
  args: PingArgs | undefined,
  extra: DiagnosticsExtra,
  options: BuildMcpServerOptions,
): DiagnosticsMetadata {
  const timestamp = new Date().toISOString()
  const metadata: DiagnosticsMetadata = {
    allowedOrigins: options.allowedOrigins,
    note: args?.note ?? null,
    timestamp,
  }

  const authInfo = extra.authInfo
  if (authInfo) {
    metadata.token = {
      scopes: authInfo.scopes,
      clientId: authInfo.clientId,
      resource: authInfo.resource?.toString(),
    }
    if (authInfo.expiresAt) {
      metadata.token.expiresAt = new Date(authInfo.expiresAt * 1000).toISOString()
    }

    if (authInfo.token) {
      try {
        const decoded = decodeJwt(authInfo.token)
        if (decoded.sub) metadata.token.subject = String(decoded.sub)
        if (decoded.aud) metadata.token.audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud]
        if (typeof decoded.exp === 'number') {
          metadata.token.expiresAt = new Date(decoded.exp * 1000).toISOString()
        }
      } catch (err) {
        metadata.token = {
          ...metadata.token,
          subject: undefined,
          audiences: undefined,
        }
        console.warn('Failed to decode JWT payload for diagnostics.ping', err)
      }
    }
  }

  metadata.userId = extra.authInfo
    ? String(extra.authInfo.extra?.userId ?? extra.authInfo.clientId ?? '') || null
    : null

  const originHeader =
    getHeader(extra.requestInfo?.headers, 'origin') ?? getHeader(extra.requestInfo?.headers, 'referer')
  metadata.origin = originHeader

  const rateLimit = extractRateLimit(extra.requestInfo?.headers)
  if (rateLimit) {
    metadata.rateLimit = rateLimit
  }

  return metadata
}

function extractRateLimit(headers: DiagnosticsRequestInfo['headers'] | undefined) {
  const limit = getHeader(headers, 'x-ratelimit-limit')
  const remaining = getHeader(headers, 'x-ratelimit-remaining')
  const reset = getHeader(headers, 'x-ratelimit-reset')
  const retryAfter = getHeader(headers, 'retry-after')

  if (!limit && !remaining && !reset && !retryAfter) return undefined

  const toNumber = (value: string | null) => {
    if (!value) return undefined
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const parsedLimit = toNumber(limit)
  const parsedRemaining = toNumber(remaining)
  const resetNumber = toNumber(reset)

  const resetAt = resetNumber !== undefined ? new Date(resetNumber * 1000).toISOString() : undefined

  return {
    limit: parsedLimit,
    remaining: parsedRemaining,
    resetAt,
    retryAfter: retryAfter ?? undefined,
  }
}
