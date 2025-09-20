import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
const BASE = process.env.OPENMEMORY_BASE_URL || ''
const API_TOKEN = process.env.OPENMEMORY_API_TOKEN || ''
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || process.env.USER || 'demo-user'
async function omFetch(path: string, init: any = {}) {
  const url = BASE ? `${BASE}${path}` : path
  const headers = { 'content-type': 'application/json', ...(init.headers||{}) } as any
  if (API_TOKEN) headers['x-api-key'] = API_TOKEN
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) throw new Error(`OpenMemory ${res.status} ${await res.text()}`)
  return res.json()
}

export function buildMcpServer() {
  const server = new McpServer({
    name: process.env.MCP_SERVER_NAME || 'openmemory',
    version: process.env.MCP_SERVER_VERSION || '0.1.0',
  })

  // NOTE: ChatGPT developer mode does NOT require specific tool names.
  // Add any abilities you need. Below are minimal examples.

  server.registerTool('ping', { description: 'Health check tool', inputSchema: { message: z.string().default('pong') } }, async ({ message }: any) => ({ content: [{ type: 'text', text: message }] }))

  server.registerTool('write', { description: 'Echo writer (placeholder for future write ops)', inputSchema: { text: z.string() } }, async ({ text }: any) => ({ content: [{ type: 'text', text }] }))

  // Search memories via OpenMemory API
  server.registerTool('om.search', { description: 'Search OpenMemory memories for a user', inputSchema: { user_id: z.string(), query: z.string().default(''), page: z.number().default(1), size: z.number().default(10) } }, async ({ user_id, query, page, size }: any) => {
      if (!BASE) throw new Error('OPENMEMORY_BASE_URL not set')
      const params = new URLSearchParams({ user_id, search_query: query || '', page: String(page), size: String(size) })
      const data = await omFetch(`/api/v1/memories/?${params.toString()}`, { method: 'GET' })
      const items = (data?.items || data?.results || []).map((m: any) => `- ${m.content || m.memory}`)
      return { content: [{ type: 'text', text: items.join('\n') || '(no results)' }] }
    }
  )

  // Add a memory via OpenMemory API
  server.registerTool('om.add', { description: 'Add memory text for a user to OpenMemory', inputSchema: { user_id: z.string(), text: z.string(), app: z.string().default('openmemory') } }, async ({ user_id, text, app }: any) => {
      if (!BASE) throw new Error('OPENMEMORY_BASE_URL not set')
      const body = { user_id, text, app }
      const data = await omFetch('/api/v1/memories/', { method: 'POST', body: JSON.stringify(body) })
      const id = data?.id || data?.memory_id || 'unknown'
      return { content: [{ type: 'text', text: `created memory ${id}` }] }
    }
  )

  // ChatGPT Developer-mode required tools
  // 1) search: minimal web-search-like results (maps to OpenMemory list)
  server.registerTool('search', { description: 'Search for relevant items by keyword.', inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).default(10) } }, async ({ query, limit }: any) => {
    if (!BASE) throw new Error('OPENMEMORY_BASE_URL not set')
    const params = new URLSearchParams({ user_id: DEFAULT_USER_ID, search_query: query, size: String(limit), page: '1' })
    const data = await omFetch(`/api/v1/memories/?${params.toString()}`, { method: 'GET' })
    const items = (data?.items || []).map((m: any) => ({ id: m.id, title: (m.app_name || 'memory'), url: `openmemory://memory/${m.id}`, snippet: (m.content||'').slice(0, 240) }))
    const lines = items.map((r: any, i: number) => `${i+1}. [${r.id}] ${r.title} — ${r.snippet}`)
    return { content: [{ type: 'text', text: lines.join('\n') || '(no results)' }] }
  })

  // 2) fetch: retrieve content by id
  server.registerTool('fetch', { description: 'Fetch item content by id.', inputSchema: { id: z.string() } }, async ({ id }: any) => {
    if (!BASE) throw new Error('OPENMEMORY_BASE_URL not set')
    const detail = await omFetch(`/api/v1/memories/${encodeURIComponent(id)}`, { method: 'GET' })
    const txt = typeof detail?.content === 'string' ? detail.content : JSON.stringify(detail)
    return { content: [{ type: 'text', text: txt } ] }
  })

  // TODO: Port your existing MCP abilities here (e.g., vector search, memory fetch, etc.)

  return server
}
