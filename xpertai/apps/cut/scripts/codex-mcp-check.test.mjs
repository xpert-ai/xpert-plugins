import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { verifyCutConnection } from './codex-mcp-check.mjs'

async function withServer(handler, action) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try { await action(`http://127.0.0.1:${server.address().port}/mcp`) }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) }
}

test('authenticates, initializes session and follows paginated SSE discovery without edits', async () => {
  const methods = []
  await withServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer fixture-key')
    let body = ''
    for await (const chunk of req) body += chunk
    const message = JSON.parse(body)
    methods.push(message.method)
    if (message.method === 'initialize') {
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'fixture-session' })
      res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-03-26' } }))
    } else {
      assert.equal(req.headers['mcp-session-id'], 'fixture-session')
      assert.equal(req.headers['mcp-protocol-version'], '2025-03-26')
      if (message.method === 'notifications/initialized') { res.writeHead(202); res.end(); return }
      assert.equal(message.method, 'tools/list')
      const result = message.params.cursor === 'page2'
        ? { tools: [{ name: 'cut_list_clips' }] } : { tools: [], nextCursor: 'page2' }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`)
      // Keep SSE open: discovery must return after the matching response.
    }
  }, (mcpUrl) => verifyCutConnection({ mcpUrl, apiKey: 'fixture-key', allowLocalHttp: true }))
  assert.deepEqual(methods, ['initialize', 'notifications/initialized', 'tools/list', 'tools/list'])
})

test('401 is actionable and does not echo the response body', async () => {
  await withServer((_req, res) => { res.writeHead(401); res.end('secret-upstream-body') }, async (mcpUrl) => {
    await assert.rejects(verifyCutConnection({ mcpUrl, apiKey: 'fixture-key', allowLocalHttp: true }),
      (error) => error.message.includes('401') && !error.message.includes('secret'))
  })
})

test('refuses redirects instead of forwarding a credential to another endpoint', async () => {
  await withServer((_req, res) => { res.writeHead(302, { location: 'https://example.test/mcp' }); res.end() }, async (mcpUrl) => {
    await assert.rejects(verifyCutConnection({ mcpUrl, apiKey: 'fixture-key', allowLocalHttp: true }))
  })
})
