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
}

export const diagnosticsToolMetadata = {
  name: 'diagnostics.ping',
  description:
    'Returns a deterministic response containing service metadata. Use to confirm OAuth + Streamable HTTP wiring.',
}

/**
 * Builds and returns a configured McpServer instance with a registered diagnostics tool.
 *
 * The server is initialized with name and version from environment variables (with fallbacks)
 * and exposes a diagnostics.ping tool that returns a deterministic JSON payload describing
 * service metadata, request headers, and any parsed authentication information.
 *
 * @param options - Configuration for server construction; currently used to populate allowed origins in diagnostics payload.
 * @returns The constructed and configured McpServer instance.
 */
export async function buildMcpServer(options: BuildMcpServerOptions) {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || 'github-mcp',
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
 * Retrieve a header value by name from either a Headers instance or a HeaderBag.
 *
 * Accepts either a Fetch `Headers`-compatible object or a plain header bag (Record<string, string | string[]>).
 * For array values, the first element is returned. Name lookups try the exact key then the lowercased key.
 *
 * @param headers - A Headers instance or a header bag (may be undefined)
 * @param name - Header name to look up
 * @returns The header value string if present, otherwise `null`
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
  const candidate = bag[name] ?? bag[name.toLowerCase()]
  if (Array.isArray(candidate)) {
    return candidate[0] ?? null
  }
  return candidate ?? null
}

/**
 * Build a deterministic diagnostics payload describing service metadata and request/auth context.
 *
 * The payload includes allowed origins, an optional note, a timestamp, optional token details
 * (scopes, clientId, resource, subject, audiences, expiresAt), a derived userId, and the request origin.
 *
 * @param args - Optional ping arguments; `note` from `args` will be included in the payload when present.
 * @param extra - Parsed diagnostics extra data containing optional `authInfo` and `requestInfo`.
 * @param options - Server build options; `allowedOrigins` from `options` is copied into the payload.
 * @returns A DiagnosticsMetadata object suitable for JSON serialization and returning to callers.
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

  return metadata
}
