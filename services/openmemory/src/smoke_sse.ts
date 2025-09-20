import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const rawEnable = (process.env.ENABLE_SSE ?? process.env.MCP_ENABLE_SSE ?? '').toLowerCase()
const runSseSmoke = rawEnable === 'true' || (process.env.RUN_SSE_SMOKE ?? '').toLowerCase() === 'true'
if (!runSseSmoke) {
  console.log('[smoke:sse] skipped – set ENABLE_SSE=true or RUN_SSE_SMOKE=true to execute this smoke test')
  process.exit(0)
}

async function main() {
  const base = process.env.MCP_SSE_URL || 'http://127.0.0.1:8766/sse'
  const userId = process.env.SMOKE_USER_ID || 'demo-user'
  const appName = process.env.SMOKE_APP || 'openmemory-mcp-smoke'
  const addText = `sse-smoke ${new Date().toISOString()}`

  const client = new Client({ name: 'sse-smoke-client', version: '0.0.1' }) as any
  const transport = new SSEClientTransport(new URL(base))
  await client.connect(transport)

  const add = await client.callTool({
    name: 'om.add',
    arguments: { user_id: userId, text: addText, app: appName },
  })
  console.log('[om.add]', add?.content?.[0]?.text || JSON.stringify(add))

  const search = await client.callTool({
    name: 'om.search',
    arguments: { user_id: userId, query: 'sse-smoke', page: 1, size: 5 },
  })
  console.log('[om.search]', search?.content?.[0]?.text || JSON.stringify(search))
}

main().catch((e) => {
  console.error('smoke:sse failed', e)
  process.exit(1)
})
