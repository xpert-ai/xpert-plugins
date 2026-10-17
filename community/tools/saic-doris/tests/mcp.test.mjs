import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once, EventEmitter } from 'node:events'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { DecoratedToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { createDorisConnection } from '@xpert-ai/plugin-mysql/doris'
import { SaicConnections } from '../dist/lib/connections.js'
import { SaicDorisTools } from '../dist/lib/provider.js'
const config = {
  mode: 'manual',
  host: 'localhost',
  username: 'fixture',
  password: 'fixture-only',
  database: 'saic_fixture',
  streamLoadEnabled: false
}
const context = {
  source: 'mcp',
  tenantId: 'fixture-tenant',
  organizationId: 'fixture-org',
  principal: { type: 'user', id: 'fixture-user' },
  executionId: 'fixture-exec',
  requestId: 'fixture-request',
  host: { credentials: { get: async (key) => config[key] ?? null } }
}
function wire() {
  const state = { calls: [], closed: 0 }
  const driver = {
    destroy: () => state.closed++,
    query(query) {
      state.calls.push(query)
      const events = new EventEmitter()
      queueMicrotask(() => {
        let fields = [],
          rows = []
        if (query.sql.includes('@@session.sql_mode')) {
          fields = [{ name: 'sql_mode', type: 253 }]
          rows = [['STRICT_TRANS_TABLES']]
        } else if (query.sql.includes('AS saic_count')) {
          fields = [{ name: 'row_count', type: 8 }]
          rows = [[query.sql.includes('WHERE `owner_name`') ? '0' : '1']]
        } else if (query.sql.includes('CURRENT_USER()')) {
          fields = [
            { name: 'db', type: 253 },
            { name: 'usr', type: 253 }
          ]
          rows = [['saic_fixture', 'fixture@localhost']]
        } else if (query.sql.includes('GROUP_CONCAT')) {
          fields = [
            { name: 'TABLE_NAME', type: 253 },
            { name: 'TABLE_COMMENT', type: 253 },
            { name: 'columns', type: 253 }
          ]
          rows = [['sc_owner', 'fixture', 'owner_name(varchar),email(varchar)']]
        }
        if (fields.length) {
          events.emit('fields', fields)
          for (const row of rows) {
            row.forEach((value) => query.typeCast({ type: 'VAR_STRING', string: () => value, buffer: () => null }))
            events.emit('result', {})
          }
        } else if (query.sql.startsWith('INSERT')) events.emit('result', { affectedRows: 1 })
        events.emit('end')
      })
      return events
    }
  }
  return { driver, state }
}
test('native definitions over local Streamable HTTP: initialize, 24 tools, resource, reads and writes', async (t) => {
  const fixtures = []
  const connections = new SaicConnections(
    {
      require: () => {
        throw Error('platform not selected')
      }
    },
    (options) => {
      const f = wire()
      fixtures.push(f)
      return createDorisConnection(options, f.driver)
    }
  )
  const tools = new SaicDorisTools(connections),
    strategy = new DecoratedToolsetStrategy(tools)
  const toolset = await strategy.create({
    id: 'configured-fixture',
    name: 'SAIC fixture',
    type: 'builtin',
    credentials: config
  })
  const definitions = toolset.getMcpCapabilityDefinitions(),
    sessions = []
  // A local protocol fixture uses the SDK's real native definitions and adapters.
  // It does not substitute for Xpert Publication authentication/administrator policy tests.
  const http = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer fixture-token') {
      res.writeHead(401)
      res.end()
      return
    }
    const server = new McpServer({ name: 'saic-doris-fixture', version: '0.1.0' })
    // Publication serializes schemas to JSON before MCP registration, dropping Zod
    // refinements. Keep refinements in native execution and register their object shape.
    for (const tool of definitions.tools)
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema._def.schema ?? tool.outputSchema,
          annotations: {
            readOnlyHint: tool.behavior.risk === 'read',
            destructiveHint: tool.behavior.risk === 'write',
            idempotentHint: tool.behavior.idempotency !== 'non_idempotent'
          }
        },
        async (input) => tool.execute(input, context)
      )
    for (const resource of definitions.resources)
      server.registerResource(
        resource.key,
        resource.uri,
        { description: resource.description, mimeType: resource.mimeType },
        () => resource.read({ ...context, resourceUri: resource.uri })
      )
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    sessions.push({ server, transport })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  })
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  t.after(async () => {
    await Promise.all(sessions.map((s) => s.server.close()))
    await new Promise((resolve) => {
      http.close(resolve)
      http.closeAllConnections()
    })
  })
  const url = new URL(`http://127.0.0.1:${http.address().port}/mcp`)
  assert.equal((await fetch(url, { method: 'POST' })).status, 401)
  const client = new Client({ name: 'WorkBuddy-compatible-fixture', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: 'Bearer fixture-token' } }
  })
  await client.connect(transport)
  t.after(() => client.close())
  const listed = await client.listTools()
  assert.equal(listed.tools.length, 24)
  assert.ok(listed.tools.every((tool) => !JSON.stringify(tool.inputSchema).includes('password')))
  assert.deepEqual(
    (await client.listResources()).resources.map((r) => r.uri),
    ['schema://saic/config-tables']
  )
  const schema = await client.readResource({ uri: 'schema://saic/config-tables' })
  assert.equal(JSON.parse(schema.contents[0].text)[0].TABLE_NAME, 'sc_owner')
  const ping = await client.callTool({ name: 'ping', arguments: {} })
  assert.equal(ping.isError, undefined)
  assert.equal(ping.structuredContent.data[0].mcp_build, 'v5.3-bool-default')
  assert.deepEqual(JSON.parse(ping.content[0].text), ping.structuredContent)
  const write = await client.callTool({
    name: 'upsert_owners',
    arguments: { rows: [{ owner_name: 'Fixture', email: 'fixture@example.invalid', active: false }] }
  })
  assert.equal(write.isError, undefined, JSON.stringify(write))
  assert.equal(write.structuredContent.affected, 1)
  const mutation = fixtures.flatMap((f) => f.state.calls).find((c) => c.sql.startsWith('INSERT'))
  assert.ok(mutation)
  assert.equal(mutation.values.at(-1), false)
  const denied = await client.callTool({ name: 'query_config', arguments: { sql: 'SELECT * FROM sc_credential' } })
  assert.match(denied.structuredContent.error, /不可见/)
  assert.ok(fixtures.every((f) => f.state.closed === 1))
})
