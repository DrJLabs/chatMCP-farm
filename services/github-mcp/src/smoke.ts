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

  const controller = new AbortController()
  const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS || '10000', 10)
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text}`)
    }

    const data = await res.json()
    const sessionId = res.headers.get('mcp-session-id') ?? 'missing'
    console.log('initialize response:', JSON.stringify(data, null, 2))
    console.log('accept header sent:', headers.accept)
    console.log('mcp-session-id header:', sessionId)
    const protocolHeader = res.headers.get('mcp-protocol-version')
    if (protocolHeader) {
      console.log('mcp-protocol-version header:', protocolHeader)
    }
  } finally {
    clearTimeout(timeout)
  }
}

main().catch(err => {
  if (err.name === 'AbortError') {
    console.error(`smoke failed: request timed out after ${process.env.SMOKE_TIMEOUT_MS || '10000'}ms`)
  } else {
    console.error('smoke failed', err)
  }
  process.exit(1)
})
