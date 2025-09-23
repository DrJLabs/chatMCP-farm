import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeJwt } from 'jose'
import { z } from 'zod'

const pingInputSchema = z
  .object({
    note: z.string().max(240).optional(),
  })
  .strict()

export const pingInputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    note: { type: 'string', maxLength: 240 },
  },
} as const

type PingArgs = z.infer<typeof pingInputSchema>

type HeaderLike = { get: (name: string) => unknown }
type HeaderBag = Record<string, string | string[]>

function isHeaderLike(value: unknown): value is HeaderLike {
  return !!value && typeof value === 'object' && typeof (value as any).get === 'function'
}

const headerBagSchema = z.record(z.union([z.string(), z.array(z.string())]))

const headerLikeSchema = z
  .any()
  .refine(isHeaderLike, { message: 'Headers-like object' })

const diagnosticsAuthInfoSchema = z
  .object({
    token: z.string().optional(),
    clientId: z.string().optional(),
    scopes: z.array(z.string()).optional(),
    resource: z.union([z.string(), z.instanceof(URL)]).optional(),
    expiresAt: z.number().optional(),
    extra: z.record(z.unknown()).optional(),
  })
  .strict()

const diagnosticsRequestInfoSchema = z
  .object({
    headers: z.union([headerLikeSchema, headerBagSchema]).optional(),
  })
  .strict()

const diagnosticsExtraSchema = z
  .object({
    authInfo: diagnosticsAuthInfoSchema.optional(),
    requestInfo: diagnosticsRequestInfoSchema.optional(),
  })
  .strict()

type DiagnosticsAuthInfo = z.infer<typeof diagnosticsAuthInfoSchema>
type DiagnosticsRequestInfo = z.infer<typeof diagnosticsRequestInfoSchema>
type DiagnosticsExtra = z.infer<typeof diagnosticsExtraSchema>

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

export async function buildMcpServer(options: BuildMcpServerOptions) {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || '__SERVICE_NAME__',
    version: process.env.MCP_SERVER_VERSION || '0.1.0',
  })

  server.registerTool(
    diagnosticsToolMetadata.name,
    {
      description: diagnosticsToolMetadata.description,
      inputSchema: pingInputJsonSchema,
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

function getHeader(
  headers: DiagnosticsRequestInfo['headers'] | undefined,
  name: string,
): string | null {
  if (!headers) return null
  if (isHeaderLike(headers)) {
    const raw = headers.get(name)
    if (raw == null) {
      return null
    }
    if (Array.isArray(raw)) {
      return raw[0] ?? null
    }
    return typeof raw === 'string' ? raw : String(raw)
  }
  const bag = headers as HeaderBag
  const candidate = bag[name] ?? bag[name.toLowerCase()]
  if (Array.isArray(candidate)) {
    return candidate[0] ?? null
  }
  return candidate ?? null
}

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
        const reason = err instanceof Error ? err.message : String(err)
        console.warn(`Failed to decode JWT payload for ${diagnosticsToolMetadata.name}: ${reason}`)
      }
    }
  }

  metadata.userId = extra.authInfo
    ? String(extra.authInfo.extra?.userId ?? extra.authInfo.clientId ?? '') || null
    : null

  const originHeader = getHeader(extra.requestInfo?.headers, 'origin')
  metadata.origin = originHeader

  return metadata
}
