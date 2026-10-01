import { validateMcpUrl } from './build-agent-plugin.mjs'

/** Only discovery requests; never invoke editing tools during installation. */
export async function verifyCutConnection({ mcpUrl, apiKey, allowLocalHttp = false }) {
  const url = validateMcpUrl(mcpUrl, allowLocalHttp)
  let session
  let protocol = '2025-03-26'
  let nextId = 0
  async function request(method, params, notification = false) {
    const id = notification ? undefined : ++nextId
    const response = await fetch(url, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(session ? { 'Mcp-Session-Id': session } : {}),
        ...(method !== 'initialize' ? { 'MCP-Protocol-Version': protocol } : {})
      },
      body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params })
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`MCP HTTP ${response.status}. Check the endpoint, API key and publication access.`)
    }
    session = response.headers.get('mcp-session-id') ?? session
    if (notification) { await response.body?.cancel(); return }
    let message
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (!message) {
          const { value, done } = await reader.read()
          if (done) break
          buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
          if (buffer.length > 2_000_000) throw new Error('MCP discovery response is too large.')
          let boundary
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = event.split('\n').filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trimStart()).join('\n')
            if (data) {
              const candidate = parseMessage(data)
              if (candidate.id === id) message = candidate
            }
          }
        }
      } finally { await reader.cancel() }
    } else message = parseMessage(await response.text())
    if (!message || message.id !== id || message.error || !message.result) {
      throw new Error(`MCP ${method} did not return a successful result.`)
    }
    return message.result
  }
  const initialized = await request('initialize', {
    protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'xpert-cut-installer', version: '1.0.0' }
  })
  if (typeof initialized.protocolVersion !== 'string') throw new Error('MCP initialization has no protocol version.')
  protocol = initialized.protocolVersion
  await request('notifications/initialized', {}, true)
  let cursor
  const cursors = new Set()
  for (let page = 0; page < 100; page++) {
    const result = await request('tools/list', cursor ? { cursor } : {})
    if (!Array.isArray(result.tools)) throw new Error('MCP tools/list returned no tool list.')
    if (result.tools.some((tool) => tool?.name === 'cut_list_clips')) return
    cursor = result.nextCursor
    if (!cursor) break
    if (typeof cursor !== 'string' || cursors.has(cursor)) throw new Error('MCP returned an invalid tool cursor.')
    cursors.add(cursor)
  }
  throw new Error('This publication does not expose cut_list_clips. Select a Cut MCP publication.')
}

function parseMessage(text) {
  try { return JSON.parse(text) }
  catch { throw new Error('MCP returned invalid JSON.') }
}
