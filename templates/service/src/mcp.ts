import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export async function buildMcpServer() {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || '__SERVICE_NAME__',
    version: process.env.MCP_SERVER_VERSION || '0.1.0',
  })

  server.registerTool('health.check', {
    description: 'Returns a simple ok response. Replace with real tools.',
    inputSchema: z.object({}).passthrough().optional(),
  }, async () => ({ content: [{ type: 'text', text: 'ok' }] }))

  return server
}
