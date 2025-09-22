import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeJwt } from 'jose'
import { z } from 'zod'

const pingInputSchema = z
  .object({
    note: z.string().max(240).optional(),
  })
  .strict()

type PingArgs = z.infer<typeof pingInputSchema>

interface DiagnosticsAuthInfo {
  token: string
  clientId?: string
  scopes?: string[]
  resource?: URL | string
  expiresAt?: number
  extra?: Record<string, unknown>
}

interface DiagnosticsRequestInfo {
  headers?: Headers
}

interface DiagnosticsExtra {
  authInfo?: DiagnosticsAuthInfo
  requestInfo?: DiagnosticsRequestInfo
}

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
    name: process.env.MCP_SERVER_NAME || 'mcp-test-server',
    version: process.env.MCP_SERVER_VERSION || '0.1.0',
  })

  server.registerTool(
    diagnosticsToolMetadata.name,
    {
      description: diagnosticsToolMetadata.description,
      inputSchema: pingInputSchema.shape,
    },
    async (args: PingArgs | undefined, extra: unknown) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(buildDiagnosticsPayload(args, extra as DiagnosticsExtra, options), null, 2),
        },
      ],
    }),
  )

  return server
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

  metadata.userId = extra.authInfo ? String(extra.authInfo.extra?.userId ?? extra.authInfo.clientId ?? '') || null : null

  const originHeader = extra.requestInfo?.headers?.get('origin') ?? null
  metadata.origin = originHeader

  return metadata
}
