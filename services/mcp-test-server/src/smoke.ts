const base = process.env.MCP_BASE_URL || 'http://127.0.0.1:8770/mcp'
const token = process.env.MCP_ACCESS_TOKEN || ''

async function main() {
  const payload = {
    jsonrpc: '2.0',
    id: 'smoke',
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'smoke', version: '0.0.1' },
    },
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  }
  if (token) headers['authorization'] = `Bearer ${token}`

  const res = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }

  const data = await res.json()
  console.log('initialize response:', JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error('smoke failed', err)
  process.exit(1)
})
