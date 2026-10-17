const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PostgresAnalyticsProvider, normalizePostgresCell } = require('../dist/lib/provider.js')
test('PostgreSQL delegates positional parameters to the host read-only adapter and closes it', async () => {
  let query, signal, opened, closed = false
  const provider = new PostgresAnalyticsProvider({ require: () => ({ open: async scope => { opened = scope; return { engine: 'postgres',
    query: async (input, abortSignal) => { query = input; signal = abortSignal; return { outcome: 'succeeded', columns: [{ name: 'amount', dataType: '701' }], rows: [['12.5']], truncated: false, hasMore: false } },
    close: async () => { closed = true }
  } } }) })
  const context = { actor: { userId: 'viewer', tenantId: 'tenant', organizationId: 'org' }, dataSourceId: 'source', maxRows: 100, timeoutMs: 1000, signal: new AbortController().signal }
  const result = await provider.execute({ payload: { sql: 'SELECT amount FROM sales WHERE region = $1', parameterOrder: ['region'] }, output: { fields: [{ sourceField: 'amount', logicalType: 'float64' }] } },
    { region: "x'; DROP TABLE sales;--" }, context)
  assert.deepEqual(opened.actor, context.actor); assert.equal(opened.dataSourceId, 'source')
  assert.equal(signal, context.signal); assert.equal(query.limit, 100); assert.equal(query.timeoutMs, 1000)
  assert.equal(query.mode, 'read'); assert.deepEqual(query.parameters, ["x'; DROP TABLE sales;--"])
  assert.equal(query.sql, 'SELECT amount FROM sales WHERE region = $1'); assert.equal(closed, true)
  assert.deepEqual(result.rows, [{ amount: 12.5 }])
})
test('explicit Postgres OIDs preserve exact values and handle typed floats, booleans and instants', () => {
  assert.equal(normalizePostgresCell('9007199254740993', '20', 'int64'), '9007199254740993')
  assert.equal(normalizePostgresCell('9007199254740993.12', '1700', 'decimal'), '9007199254740993.12')
  assert.equal(normalizePostgresCell('12.5', '25', 'float64'), '12.5')
  assert.equal(normalizePostgresCell('f', '16', 'boolean'), false)
  assert.throws(() => normalizePostgresCell('NaN', '701', 'float64'))
})
test('discovery is paged at the adapter and returns comments/keys without guessing semantics', async () => {
  let input, closed = 0
  const object = { name: 'orders', schema: 'public', kind: 'table' }
  const provider = new PostgresAnalyticsProvider({ require: () => ({ open: async () => ({ engine: 'postgres',
    objects: async value => { input = value; return { items: [object], hasMore: true } },
    describe: async () => ({ object, columns: [{ name: 'net_amount', dataType: 'numeric', nullable: false, comment: 'Paid amount minus refund, CNY' }], keys: [], definition: '', diagnostics: [] }),
    close: async () => { closed++ }
  }) }) })
  const context = { actor: {}, dataSourceId: 'source' }
  const page = await provider.discover({}, context)
  assert.equal(input.pageSize, 20); assert.equal(page.nextRequest.page, 2)
  const detail = await provider.discover(page.items[0].inspectRequest, context)
  assert.equal(detail.items[0].metadata.columns[0].description, 'Paid amount minus refund, CNY')
  assert.equal(detail.items[0].metadata.columns[0].dataType, 'numeric'); assert.equal(closed, 2)
  await assert.rejects(provider.discover({ kind: 'catalog', userId: 'other' }, context))
})

// Resource/error paths are part of the adapter contract, not renderer behavior.
const binding = { payload: { sql: 'SELECT amount', parameterOrder: [] }, output: { fields: [] } }
const context = { actor: {}, dataSourceId: 'source', maxRows: 10, timeoutMs: 1000, signal: new AbortController().signal }
function fixture(overrides = {}) {
  const state = { opened: [], closed: 0 }
  const provider = new PostgresAnalyticsProvider({ require: () => ({ open: async scope => {
    state.opened.push(scope)
    return { engine: 'postgres', close: async () => { state.closed++ }, ...overrides }
  } }) })
  return { provider, state }
}
test('missing/extra parameters and unknown payload fields fail before opening a connection', async () => {
  const { provider, state } = fixture()
  await assert.rejects(provider.execute({ ...binding, payload: { sql: 'SELECT $1', parameterOrder: ['region'] } }, {}, context), /POSTGRES_PARAMETER_ORDER_INVALID/)
  await assert.rejects(provider.execute(binding, { region: 'east' }, context), /POSTGRES_PARAMETER_ORDER_INVALID/)
  await assert.rejects(provider.execute({ ...binding, payload: { ...binding.payload, userId: 'owner' } }, {}, context))
  assert.equal(state.opened.length, 0)
})
test('discovery opens the requested database/schema with the current actor', async () => {
  const { provider, state } = fixture({ objects: async () => ({ items: [], hasMore: false }) })
  await provider.discover({ kind: 'catalog', location: { database: 'warehouse', schema: 'reporting' } }, context)
  assert.deepEqual(state.opened[0], { actor: context.actor, dataSourceId: 'source', location: { database: 'warehouse', schema: 'reporting' } })
  await assert.rejects(provider.discover({ kind: 'catalog', userId: 'owner' }, context))
  assert.equal(state.opened.length, 1)
  assert.equal(state.closed, 1)
})
test('inspection connects to the inspected object database and closes on metadata failure', async () => {
  const { provider, state } = fixture({ describe: async () => { throw new Error('metadata unavailable') } })
  await assert.rejects(provider.discover({ kind: 'inspect', object: { name: 'orders', kind: 'table', database: 'warehouse', schema: 'sales' } }, context), /metadata unavailable/)
  assert.deepEqual(state.opened[0].location, { database: 'warehouse', schema: 'sales' })
  assert.equal(state.closed, 1)
})
test('both discovery and execution reject another engine and close the adapter', async () => {
  const { provider, state } = fixture({ engine: 'mysql' })
  await assert.rejects(provider.discover({}, context), /POSTGRES_ENGINE_REQUIRED/)
  await assert.rejects(provider.execute(binding, {}, context), /POSTGRES_ENGINE_REQUIRED/)
  assert.equal(state.closed, 2)
})
test('incomplete outcomes and duplicate output aliases are rejected with cleanup', async () => {
  for (const outcome of ['pending', 'unknown']) {
    const { provider, state } = fixture({ query: async () => ({ outcome }) })
    await assert.rejects(provider.execute(binding, {}, context), /POSTGRES_QUERY_INCOMPLETE/)
    assert.equal(state.closed, 1)
  }
  const { provider, state } = fixture({ query: async () => ({ outcome: 'succeeded', columns: [{ name: 'x' }, { name: 'x' }] }) })
  await assert.rejects(provider.execute(binding, {}, context), /POSTGRES_DUPLICATE_COLUMNS/)
  assert.equal(state.closed, 1)
})
test('either hasMore or transport truncation prevents a false exact total', async () => {
  for (const flags of [{ hasMore: true, truncated: false }, { hasMore: false, truncated: true }, { hasMore: false, truncated: false }]) {
    const { provider, state } = fixture({ query: async () => ({ outcome: 'succeeded', columns: [], rows: [], ...flags }) })
    const result = await provider.execute(binding, {}, context)
    const partial = flags.hasMore || flags.truncated
    assert.deepEqual(result.completeness, { returnedRows: 0, totalAccuracy: partial ? 'unknown' : 'exact',
      ...(!partial ? { totalRows: 0 } : {}), scope: partial ? 'page' : 'full_query_result', truncated: partial })
    assert.equal(state.closed, 1)
  }
})
test('SQLSTATE type errors explain explicit casts; cancellation and other failures propagate', async () => {
  for (const code of ['42P08', '42P18', 'cancelled', 'connection failed']) {
    const error = new Error(code)
    const { provider, state } = fixture({ query: async () => { throw error } })
    await assert.rejects(provider.execute(binding, {}, context), e => code.startsWith('42P') ? e.message.startsWith('POSTGRES_PARAMETER_TYPE_REQUIRED:') : e === error)
    assert.equal(state.closed, 1)
  }
})
