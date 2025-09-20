import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

async function main() {
  const base = process.env.MCP_BASE_URL || 'http://127.0.0.1:8766'
const userId = process.env.SMOKE_USER_ID || 'demo-user'
  const appName = process.env.SMOKE_APP || 'openmemory-mcp-smoke'
  const addText = `smoke-test ${new Date().toISOString()}`

  const client = new Client({ name: 'smoke-client', version: '0.0.1' }) as any
  const transport = new StreamableHTTPClientTransport(new URL(base))
  await client.connect(transport)

  // Call om.add
  const add = await client.callTool({
    name: 'om.add',
    arguments: { user_id: userId, text: addText, app: appName },
  })
  const addOut = add?.content?.[0]?.text || JSON.stringify(add)
  console.log('[om.add]', addOut)

  // Call om.search
  const search = await client.callTool({
    name: 'om.search',
    arguments: { user_id: userId, query: 'smoke-test', page: 1, size: 5 },
  })
  const searchOut = search?.content?.[0]?.text || JSON.stringify(search)
  console.log('[om.search]\n' + searchOut)
}

main().catch((e) => {
  console.error('smoke failed', e)
  process.exit(1)
})
