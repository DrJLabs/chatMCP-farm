const base = process.env.MCP_BASE_URL || 'http://127.0.0.1:8770/mcp'
const token = process.env.MCP_ACCESS_TOKEN || ''
const protocol = process.env.MCP_PROTOCOL_VERSION || '2025-06-18'

/**
 * Sends a JSON-RPC `initialize` request to the configured MCP endpoint as a smoke test.
 *
 * Performs a POST with a JSON-RPC 2.0 payload (id `smoke`) including protocolVersion,
 * empty capabilities, and clientInfo. Uses SMOKE_TIMEOUT_MS (default 10000) to abort
 * the request if it takes too long and, if set, includes the MCP_ACCESS_TOKEN as a
 * Bearer Authorization header. On success logs the parsed response and relevant MCP
 * response headers (`mcp-session-id`, `mcp-protocol-version`).
 *
 * @returns A promise that resolves when the request completes and logs are produced.
 * @throws {Error} If the HTTP response has a non-OK status (error message includes status and body) or if the fetch fails.
 */
async function main() {
  const payload = {
    jsonrpc: '2.0',
    id: 'smoke',
    method: 'initialize',
    params: {
      protocolVersion: protocol,
      capabilities: {},
      clientInfo: { name: 'smoke', version: '0.0.1' },
    },
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: process.env.SMOKE_ACCEPT || 'application/json',
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

    const contentType = res.headers.get('content-type') || ''
    const sessionId = res.headers.get('mcp-session-id') ?? 'missing'
    if (contentType.includes('text/event-stream')) {
      const bodyStream = res.body as ReadableStream<Uint8Array> | null
      if (!bodyStream) {
        console.log('initialize stream: no body')
      } else {
        const reader = bodyStream.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let chunks = 0
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            chunks += 1
            if (buffer.includes('\n\n') || chunks >= 5) {
              break
            }
          }
          buffer += decoder.decode()
        } finally {
          await reader.cancel().catch(() => {})
          reader.releaseLock()
        }
        console.log('initialize stream (first chunks):')
        console.log(buffer)
      }
    } else {
      const data = await res.json()
      console.log('initialize response:', JSON.stringify(data, null, 2))
    }
    console.log('accept header sent:', headers.accept)
    console.log('mcp-session-id header:', sessionId)
    const protocolHeader =
      res.headers.get('mcp-protocol-version') ?? res.headers.get('MCP-Protocol-Version')
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
