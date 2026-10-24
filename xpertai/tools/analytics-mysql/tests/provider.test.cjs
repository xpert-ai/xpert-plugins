const { test } = require('node:test')
const assert = require('node:assert/strict')
const { MysqlAnalyticsProvider, DorisAnalyticsProvider } = require('../dist/lib/provider')
const { bindMysqlParameters, normalizeMysqlCell } = require('../dist/lib/query')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')

const context = () => ({ actor: { userId: 'viewer', tenantId: 'tenant', organizationId: 'org' }, source: { kind: 'data-source', dataSourceId: 'source' }, maxRows: 10,
  timeoutMs: 1000, deadlineAt: Date.now() + 1000, signal: new AbortController().signal })
const binding = { id: 'sales', providerId: 'mysql.sql', payload: { sql: 'SELECT region,amount FROM sales WHERE (? IS NULL OR region = ?)', parameterOrder: ['region', 'region'], location: { database: 'sales' } },
  output: { datasetId: 'sales', grain: ['region'], fields: [
    { id: 'region', sourceField: 'region', logicalType: 'string', nullable: false, role: 'dimension' },
    { id: 'net', sourceField: 'amount', logicalType: 'decimal', nullable: false, role: 'measure' }
  ] } }
const result = { outcome: 'succeeded', columns: [{ name: 'region', dataType: '253' }, { name: 'amount', dataType: '246' }], rows: [['east', '9007199254740993.12']], truncated: false, hasMore: false }
function fixture(engine, overrides = {}) {
  const state = { open: [], query: [], closed: 0 }
  const adapter = { engine, close: async () => { state.closed++ }, query: async (input, signal) => { state.query.push({ input, signal }); return result }, ...overrides }
  const Provider = engine === 'doris' ? DorisAnalyticsProvider : MysqlAnalyticsProvider
  const provider = new Provider({ require: () => ({ open: async (scope) => { state.open.push(scope); return adapter } }) })
  return { provider, state, adapter }
}

for (const engine of ['mysql', 'doris']) {
  test(`${engine}: typed Binding delegates viewer identity, repeated positional filters and bounded read query`, async () => {
    const { provider, state } = fixture(engine), scope = context()
    const value = "east' OR 1=1 --"
    const native = await provider.execute(binding, { region: value }, scope)
    assert.deepEqual(state.open[0], { actor: scope.actor, dataSourceId: 'source', location: { database: 'sales' } })
    assert.equal(state.query[0].input.sql, binding.payload.sql)
    assert.deepEqual(state.query[0].input.parameters, [value, value])
    assert.equal(state.query[0].input.mode, 'read'); assert.equal(state.query[0].input.limit, 10)
    assert.equal(state.query[0].signal, scope.signal); assert.ok(state.query[0].input.timeoutMs <= 1000)
    assert.equal(state.closed, 1)
    assert.deepEqual(normalizeAnalyticsResult(binding, native, 'execution', 10).rows, [{ region: 'east', net: '9007199254740993.12' }])
    assert.deepEqual(provider.descriptor.dataSourceTypes, [engine])
    assert.equal(provider.descriptor.id, `${engine}.sql`)
  })
  test(`${engine}: catalogs are navigable, bounded and carry declared comments and table model`, async () => {
    const object = { database: 'warehouse', name: 'sales', kind: 'table' }
    const { provider, state } = fixture(engine, {
      locations: async () => Array.from({ length: 22 }, (_, n) => ({ database: `db${n}` })),
      objects: async (input) => { assert.equal(input.pageSize, 20); return { items: [object], hasMore: true } },
      describe: async () => ({ object, columns: [{ name: 'amount', dataType: 'decimal(20,2)', comment: 'Net paid minus refunds, CNY', nullable: false }],
        keys: [], model: engine === 'doris' ? 'aggregate' : undefined, definition: 'CREATE TABLE ...', diagnostics: [] })
    })
    const first = await provider.discover({}, context())
    assert.equal(first.items.length, 20); assert.equal(first.items[0].kind, 'collection')
    const next = await provider.discover(first.nextRequest, context())
    assert.equal(next.items.length, 2); assert.equal(next.nextRequest, undefined)
    const tables = await provider.discover(first.items[0].inspectRequest, context())
    assert.equal(tables.nextRequest.page, 2)
    const detail = await provider.discover(tables.items[0].inspectRequest, context())
    assert.equal(detail.items[0].metadata.columns[0].description, 'Net paid minus refunds, CNY')
    assert.equal(detail.items[0].metadata.tableModel, engine === 'doris' ? 'aggregate' : undefined)
    assert.deepEqual(state.open.at(-1).location, { database: 'warehouse' })
    assert.equal(state.closed, 4)
  })
  test(`${engine}: wrong-engine, incomplete/ambiguous/partial/empty results and errors close the connection`, async () => {
    const wrong = fixture(engine, { engine: engine === 'mysql' ? 'doris' : 'mysql' })
    await assert.rejects(wrong.provider.execute(binding, { region: null }, context()), /ENGINE_MISMATCH/)
    assert.equal(wrong.state.closed, 1)
    for (const native of [{ outcome: 'pending' }, { outcome: 'unknown' }, { ...result, columns: [result.columns[0], result.columns[0]] }, { ...result, rows: [[]] }]) {
      const { provider, state } = fixture(engine, { query: async () => native })
      await assert.rejects(provider.execute(binding, { region: null }, context()))
      assert.equal(state.closed, 1)
    }
    for (const flags of [{ hasMore: true, truncated: false }, { hasMore: false, truncated: true }]) {
      const { provider } = fixture(engine, { query: async () => ({ ...result, ...flags }) })
      const native = await provider.execute(binding, { region: null }, context())
      assert.deepEqual(native.completeness, { returnedRows: 1, totalAccuracy: 'unknown', scope: 'page', truncated: true })
    }
    const empty = fixture(engine, { query: async () => ({ ...result, rows: [] }) })
    assert.deepEqual(normalizeAnalyticsResult(binding, await empty.provider.execute(binding, { region: null }, context()), 'empty', 10).rows, [])
    const failure = fixture(engine, { query: async () => { throw new Error('query_failed') } })
    await assert.rejects(failure.provider.execute(binding, { region: null }, context()), /query_failed/)
    assert.equal(failure.state.closed, 1)
  })
}

test('invalid payload, identity overrides, external catalogs, missing/extra parameters fail before connecting', async () => {
  const { provider, state } = fixture('mysql')
  for (const payload of [{ ...binding.payload, userId: 'other' }, { ...binding.payload, location: { engineCatalog: 'external' } }, { ...binding.payload, sql: ' ' }])
    await assert.rejects(provider.execute({ ...binding, payload }, { region: null }, context()))
  for (const values of [{}, { region: null, extra: true }]) await assert.rejects(provider.execute(binding, values, context()), /PARAMETER_ORDER/)
  for (const input of [{ kind: 'catalog' }, { kind: 'catalog', location: { database: 'db' }, actor: {} }, { kind: 'databases', page: 0 }])
    await assert.rejects(provider.discover(input, context()))
  assert.equal(state.open.length, 0)
})
test('positional templates reject driver substitution inside strings, identifiers, comments and ??', () => {
  assert.deepEqual(bindMysqlParameters('SELECT ? WHERE ? IS NULL', ['r', 'r'], { r: null }), [null, null])
  assert.deepEqual(bindMysqlParameters("SELECT '?' AS text", [], {}), [])
  for (const sql of ["SELECT '?' AS text, ?", 'SELECT `?`, ?', 'SELECT "?", ?', 'SELECT ? /* ? */', 'SELECT ? -- ?\n', 'SELECT ? # ?\n', 'SELECT ??', "SELECT 'a''?', ?", "SELECT 'bad\\', ?", 'SELECT ? /*! UNION SELECT 1 */', 'SELECT ? /* open'])
    assert.throws(() => bindMysqlParameters(sql, ['r'], { r: 'east' }))
  assert.throws(() => bindMysqlParameters('SELECT ?', [], {}), /COUNT/)
  assert.throws(() => bindMysqlParameters('SELECT 1', ['r'], { r: null }), /COUNT/)
})
test('wire conversions preserve precision and never infer types or timezone from value shape', () => {
  for (const code of ['0', '246', '8']) assert.equal(normalizeMysqlCell('9007199254740993', code, 'float64'), '9007199254740993')
  assert.equal(normalizeMysqlCell('9007199254740993.12', '246', 'decimal'), '9007199254740993.12')
  assert.equal(normalizeMysqlCell('12.5', '5', 'float64'), 12.5)
  assert.equal(normalizeMysqlCell('12.5', '253', 'float64'), '12.5')
  assert.throws(() => normalizeMysqlCell('NaN', '5', 'float64'))
  assert.equal(normalizeMysqlCell('1', '1', 'boolean'), true)
  assert.equal(normalizeMysqlCell('0', '1', 'boolean'), false)
  assert.equal(normalizeMysqlCell('2', '1', 'boolean'), '2')
  assert.equal(normalizeMysqlCell('AQ==', '16', 'boolean'), 'AQ==')
  assert.equal(normalizeMysqlCell('2026-01-01 12:00:00', '7', 'timestamp'), '2026-01-01 12:00:00')
  assert.equal(normalizeMysqlCell(12, '3', 'int64'), '12')
  assert.equal(normalizeMysqlCell(null, '1', 'boolean'), null)
})
test('cancellation before open, during metadata and during query closes resources and returns no success', async () => {
  const control = new AbortController(), scope = { ...context(), signal: control.signal }
  const before = fixture('mysql'); control.abort()
  await assert.rejects(before.provider.discover({}, scope)); assert.equal(before.state.open.length, 0)
  for (const operation of ['query', 'locations']) {
    const controller = new AbortController()
    const { provider, state } = fixture('mysql', { [operation]: async () => { controller.abort(); return operation === 'query' ? result : [] } })
    const current = { ...context(), signal: controller.signal }
    await assert.rejects(operation === 'query' ? provider.execute(binding, { region: null }, current) : provider.discover({}, current))
    assert.ok(state.closed >= 1)
  }
  const deadline = fixture('mysql')
  await assert.rejects(deadline.provider.execute(binding, { region: null }, { ...context(), deadlineAt: Date.now() - 1 }), /DEADLINE/)
  assert.equal(deadline.state.query.length, 0); assert.equal(deadline.state.closed, 1)
})
