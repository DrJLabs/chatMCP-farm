import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

const pingInputSchema = {
  note: z.string().max(240).optional(),
} as const

type PingArgs = {
  note?: string
}

export async function buildMcpServer() {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || 'mcp-test-server',
    version: process.env.MCP_SERVER_VERSION || '0.1.0',
  })

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  server.registerTool(
    'diagnostics.ping',
    {
      description:
        'Returns a deterministic response containing service metadata. Use to confirm OAuth + Streamable HTTP wiring.',
      inputSchema: pingInputSchema,
    },
    async ({ note }: PingArgs = {}) => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'mcp-test-server online',
              note: note ?? null,
              timestamp: new Date().toISOString(),
              allowedOrigins,
            },
            null,
            2,
          ),
        },
      ],
    }),
  )

  return server
}
