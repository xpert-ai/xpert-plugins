import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DecoratedAgentMiddlewareStrategy, DecoratedToolsetStrategy, describeXpertToolProvider } from '@xpert-ai/plugin-sdk'
import { SaicDorisTools } from '../dist/lib/provider.js'
import { SaicConnections } from '../dist/lib/connections.js'

const manual = { mode: 'manual', host: 'localhost', username: 'fixture', password: '', database: 'fixture' }
function context(userId = 'user') {
  return {
    tenantId: 'tenant', organizationId: 'org', userId, workspaceId: 'workspace',
    xpertId: 'expert', agentKey: 'agent', node: { key: 'middleware', type: 'middleware' }, tools: new Map(),
    runtime: { capabilities: { get: () => undefined } }
  }
}
function fixture() {
  const state = { opens: [], calls: [], closed: 0, manual: [] }
  const result = (data) => {
    const names = Object.keys(data[0] ?? {})
    return {
      rows: data.map(row => names.map(name => row[name])),
      columns: names.map((name, index) => ({ id: String(index), name, dataType: '253' })),
      outcome: 'succeeded', durationMs: 0, hasMore: false, truncated: false, diagnostics: []
    }
  }
  const adapter = (database) => ({
    engine: 'doris',
    close: async () => { state.closed++ },
    query: async (input) => {
      state.calls.push(input)
      if (input.mode === 'write') return { ...result([]), affectedRows: 1 }
      if (input.sql.includes('AS saic_count')) return result([{ row_count: input.sql.includes('sc_owner') ? 0 : 1 }])
      return result([{ db: database, usr: 'fixture' }])
    }
  })
  const connections = new SaicConnections({ require: () => ({
    list: async (actor) => {
      if (actor.userId === 'denied') throw new Error('permission_denied')
      return [{ id: 'source', name: 'Source', engine: 'doris' }]
    },
    open: async (input) => { state.opens.push(input); return adapter('platform') }
  }) }, (options) => { state.manual.push(options); return adapter(options.catalog) })
  const provider = new SaicDorisTools(connections)
  const descriptor = describeXpertToolProvider(provider)
  const strategy = () => new DecoratedAgentMiddlewareStrategy(provider, descriptor, 'saic_doris')
  return { state, provider, descriptor, strategy }
}

test('SAIC middleware exposes the same 24 named tools and connection form without changing MCP', async () => {
  const f = fixture()
  const middleware = await f.strategy().createMiddleware(manual, context())
  assert.equal(middleware.name, 'saic_doris')
  assert.equal(middleware.tools.length, 24)
  assert.deepEqual(middleware.tools.map(tool => tool.name), f.descriptor.tools.map(tool => tool.options.name))
  assert.equal(f.strategy().meta.configSchema.properties.dataSourceId['x-ui'].component, 'remoteSelect')
  assert.equal(f.strategy().meta.configSchema.properties.password['x-ui'].component, 'secretInput')
  const mcp = await new DecoratedToolsetStrategy(f.provider).create({ id: 'mcp', credentials: manual })
  assert.equal(mcp.getMcpCapabilityDefinitions().tools.length, 24)
  for (const tool of middleware.tools) {
    assert.ok(!Object.keys(tool.schema.shape).some(key => ['host', 'password', 'mode', 'dataSourceId'].includes(key)))
  }
})

test('middleware invokes real shared read/write services using its own manual config and closes connections', async () => {
  const f = fixture()
  const middleware = await f.strategy().createMiddleware(manual, context())
  const invoke = async (name, args) => JSON.parse(await middleware.tools.find(tool => tool.name === name).invoke(args))
  assert.equal((await invoke('ping', {})).data[0].db, 'fixture')
  const write = await invoke('upsert_owners', { rows: [{ owner_name: 'test', email: 'test@example.invalid' }] })
  assert.equal(write.rows, 1)
  assert.ok(f.state.calls.some(call => call.mode === 'write' && call.sql.startsWith('INSERT')))
  assert.equal(f.state.manual[0].password, '')
  assert.equal(f.state.closed, 2)
})

test('concurrent middleware instances keep connections and authenticated actors isolated', async () => {
  const f = fixture()
  const a = await f.strategy().createMiddleware({ ...manual, database: 'manual-a' }, context('a'))
  const b = await f.strategy().createMiddleware({ mode: 'platform', dataSourceId: 'source' }, context('b'))
  const ping = middleware => middleware.tools.find(tool => tool.name === 'ping').invoke({})
  const results = await Promise.all([ping(a), ping(b)])
  assert.deepEqual(results.map(value => JSON.parse(value).data[0].db), ['manual-a', 'platform'])
  assert.deepEqual(f.state.opens[0].actor, { tenantId: 'tenant', organizationId: 'org', userId: 'b' })
  assert.equal(f.state.closed, 2)
})

test('middleware denies missing config, missing identity, revoked access and cancellation without falling back', async () => {
  const f = fixture()
  const invoke = async (options, actor = context(), config = {}) => {
    const middleware = await f.strategy().createMiddleware(options, actor)
    return middleware.tools.find(tool => tool.name === 'ping').invoke({}, config)
  }
  await assert.rejects(invoke({ password: 'must-not-appear' }), error =>
    /invalid_middleware_connection_config/.test(error.message) && !error.message.includes('must-not-appear'))
  await assert.rejects(invoke(manual, context('')), /platform_scope_required/)
  await assert.rejects(invoke({ mode: 'platform', dataSourceId: 'source' }, context('denied')), /permission_denied/)
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(invoke(manual, context(), { signal: abort.signal }))
  assert.equal(f.state.manual.length, 0)
  assert.equal(f.state.opens.length, 0)
})
