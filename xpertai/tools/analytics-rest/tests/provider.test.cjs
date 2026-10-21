const { test } = require('node:test')
const assert = require('node:assert/strict')
const { RestAnalyticsProvider } = require('../dist/lib/provider')
const { optionsSchema } = require('../dist/lib/schema')
const { normalizeAnalyticsResult, analyticsDiscoveryResultSchema } = require('@xpert-ai/plugin-sdk/analytics')
const hash = 'a'.repeat(64)
const columns = [
  { key: 'region', path: ['region'], label: 'Region', description: 'Sales region', logicalType: 'string', nullable: false, role: 'dimension' },
  { key: 'amount', path: ['net'], label: 'Net sales', description: 'Paid minus refunds', logicalType: 'decimal', nullable: false, role: 'measure', unit: 'CNY' }
]
const definition = { id: 'sales', revision: 'v1', name: 'Sales', description: 'Net paid sales in CNY', operationId: 'sales_query', readOnly: true,
  defaultArguments: { query: { region: '' } },
  pagination: { type: 'offset', pageSize: 1, maxPages: 5, offset: { in: 'query', name: 'offset' }, limit: { in: 'query', name: 'limit' }, hasMorePath: ['hasMore'] },
  result: { rowsPath: ['data', 'rows'], columns, scope: 'full_query_result', totalPath: ['total'] } }
const options = { workspaceId: '00000000-0000-4000-8000-000000000001', toolsetId: '00000000-0000-4000-8000-000000000002', datasets: [definition] }
const binding = { id: 'sales', source: { kind: 'definition', definitionId: '00000000-0000-4000-8000-000000000003', versionId: '00000000-0000-4000-8000-000000000004' }, providerId: 'rest.json', operation: 'query', contractVersion: 1,
  payload: { datasetId: 'sales', revision: 'v1', operationContractHash: hash, arguments: { query: { region: '', offset: 0, limit: 1 } }, parameterPaths: { region: ['query', 'region'] } },
  parameters: [{ name: 'region', controlId: 'region', type: 'string', required: false }],
  output: { datasetId: 'net_sales', grain: ['region'], fields: columns.map(({ path, key, description, ...field }) => ({ ...field, id: key, sourceField: key })) } }
const source = [{ region: 'East', net: '9007199254740993.12' }, { region: 'West', net: '900.00' }]
function fixture() {
  const calls = [], state = { available: true, changed: false }
  const api = { operations: {
    list: async () => state.available ? [{ operationId: 'sales_query', description: 'Sales metrics', method: 'GET', contractHash: hash, inputSchema: { type: 'object' } }] : [],
    call: async (scope, request) => {
      calls.push(structuredClone(request))
      if (!state.available) throw new Error('REST_CLIENT_OPERATION_CHANGED')
      const q = request.arguments.query
      const rows = source.filter(row => !q.region || row.region === q.region).map(row => ({ ...row, net: state.changed ? '2000.00' : row.net }))
      const offset = q.offset ?? Number(q.cursor ?? 0), limit = q.limit ?? rows.length
      return { body: { data: { rows: rows.slice(offset, offset + limit) }, total: rows.length, hasMore: offset + limit < rows.length,
        next: offset + limit < rows.length ? String(offset + limit) : null }, sourceFetchedAt: new Date().toISOString() }
    }
  } }
  const provider = new RestAnalyticsProvider({ has: () => true, require: c => { assert.equal(c.id, 'platform.rest.client'); return api } })
  const context = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }, source: binding.source,
    options: structuredClone(options), signal: new AbortController().signal, maxRows: 1000, timeoutMs: 10000, deadlineAt: Date.now() + 10000, executionId: 'test', ancestry: ['rest.json'] }
  return { provider, api, calls, state, context }
}
test('discovery exposes approved operation contracts, typed columns and pagination defaults without connection secrets', async () => {
  const f = fixture(), listing = await f.provider.discover({}, f.context)
  const result = await f.provider.discover(listing.items[0].inspectRequest, f.context)
  analyticsDiscoveryResultSchema.parse(result)
  assert.equal(result.items[0].metadata.operationContractHash, hash)
  assert.deepEqual(result.items[0].metadata.bindingPayload.arguments, binding.payload.arguments)
  assert.equal(result.items[0].metadata.columns[0].path, undefined)
  assert.equal(result.items[0].metadata.inputSchema.allOf[0].properties.query.properties.limit.const, 1)
  assert.equal(result.items[0].metadata.inputSchema.allOf[1].properties.query.properties.offset.const, 0)
  assert.equal(JSON.stringify(result).includes(options.toolsetId), false)
  f.state.available = false
  assert.deepEqual((await f.provider.discover({}, f.context)).items, [])
  await assert.rejects(f.provider.discover({ datasetId: 'sales' }, f.context))
})
test('offset pages preserve decimal precision; filter, refresh and serialized reopen use the same Binding', async () => {
  const f = fixture()
  const all = normalizeAnalyticsResult(binding, await f.provider.execute(binding, { region: '' }, f.context), 'all', 1000)
  assert.equal(all.rows.length, 2); assert.equal(all.rows[0].amount, source[0].net)
  assert.deepEqual(f.calls.map(c => c.arguments.query.offset), [0, 1])
  assert.equal(all.completeness.scope, 'full_query_result')
  const filtered = await f.provider.execute(binding, { region: 'West' }, f.context)
  assert.deepEqual(filtered.rows, [{ region: 'West', amount: '900.00' }])
  f.state.changed = true
  const reopened = JSON.parse(JSON.stringify(binding))
  const fresh = await f.provider.execute(reopened, { region: 'West' }, f.context)
  assert.equal(fresh.rows[0].amount, '2000.00')
  assert.equal(binding.payload.arguments.query.region, '')
})
test('cursor pages use explicit tokens, reject cycles and never follow next URLs', async () => {
  const f = fixture()
  f.context.options.datasets[0].pagination = { type: 'cursor', pageSize: 1, maxPages: 5, initialCursor: null,
    cursor: { in: 'query', name: 'cursor' }, limit: { in: 'query', name: 'limit' }, nextCursorPath: ['next'] }
  const b = structuredClone(binding); delete b.payload.arguments.query.offset; b.payload.arguments.query.cursor = null
  assert.equal((await f.provider.execute(b, { region: '' }, f.context)).rows.length, 2)
  assert.deepEqual(f.calls.map(c => c.arguments.query.cursor), [null, '1'])
  f.api.operations.call = async () => ({ body: { data: { rows: [source[0]] }, next: 'https://evil.invalid', total: 100 }, sourceFetchedAt: new Date().toISOString() })
  await assert.rejects(f.provider.execute(b, { region: '' }, f.context), /PAGINATION_LOOP/)
  // Tokens are data passed to the fixed operation, not fetched as URLs.
  assert.equal(f.calls.every(c => c.operationId === 'sales_query' && c.url === undefined), true)
})
test('no-pagination JSON arrays and empty rows retain columns', async () => {
  const f = fixture(); f.context.options.datasets[0].pagination = { type: 'none' }
  f.context.options.datasets[0].result = { rowsPath: [], columns, scope: 'full_query_result' }
  f.api.operations.call = async () => ({ body: [], sourceFetchedAt: new Date().toISOString() })
  const result = normalizeAnalyticsResult(binding, await f.provider.execute(binding, { region: '' }, f.context), 'empty', 1000)
  assert.equal(result.rows.length, 0); assert.equal(result.fields.length, 2); assert.equal(result.completeness.totalRows, 0)
})
test('page and row bounds are explicitly partial, not complete totals', async () => {
  const f = fixture()
  for (const context of [{ ...f.context, maxRows: 1 }, { ...f.context, options: { ...options, datasets: [{ ...definition, pagination: { ...definition.pagination, maxPages: 1 } }] } }]) {
    const result = await f.provider.execute(binding, { region: '' }, context)
    assert.deepEqual(result.completeness, { returnedRows: 1, scope: 'page', truncated: true, totalAccuracy: 'exact', totalRows: 2 })
  }
})
test('caller cannot override operation, endpoint, mapping, auth, policy or pagination', async () => {
  const f = fixture()
  for (const extra of [{ url: 'http://evil' }, { operationId: 'delete' }, { method: 'DELETE' }, { headers: {} }, { result: {} }, { policy: 'write' }, { toolsetId: options.toolsetId }, { datasetId: 'missing' }, { revision: 'v2' }])
    await assert.rejects(f.provider.execute({ ...binding, payload: { ...binding.payload, ...extra } }, { region: '' }, f.context))
  for (const name of ['offset', 'limit']) {
    const b = structuredClone(binding); b.payload.arguments.query[name] = 99
    await assert.rejects(f.provider.execute(b, { region: '' }, f.context), error => {
      assert.equal(error.getResponse().code, 'REST_DATASET_PAGINATION_OVERRIDE_DENIED')
      assert.match(error.message, /automatically fetches all pages/)
      return true
    })
    b.payload.arguments.query[name] = binding.payload.arguments.query[name]; b.payload.parameterPaths.region = ['query', name]
    await assert.rejects(f.provider.execute(b, { region: 99 }, f.context), /PAGINATION_CONTROL_DENIED/)
  }
  assert.equal(f.calls.length, 0)
  assert.equal(optionsSchema.safeParse({ ...options, token: 'secret' }).success, false)
})
test('invalid control paths fail actionably without values, and prototype traversal is rejected', async () => {
  const f = fixture()
  for (const path of [['arguments', 'query', 'region'], ['query', 'missing']])
    await assert.rejects(f.provider.execute({ ...binding, payload: { ...binding.payload, parameterPaths: { region: path } } }, { region: 'private' }, f.context), error => {
      assert.equal(error.getResponse().code, 'REST_DATASET_PARAMETER_PATH_INVALID')
      assert.match(error.message, /relative to arguments/); assert.equal(error.message.includes('private'), false); return true
    })
  for (const path of [['__proto__', 'polluted'], ['query'], ['query', 'offset']])
    await assert.rejects(f.provider.execute({ ...binding, payload: { ...binding.payload, parameterPaths: { region: path } } }, { region: '' }, f.context))
  assert.equal(f.calls.length, 0); assert.equal({}.polluted, undefined)
})
test('malformed JSON mappings, inconsistent totals, unstable snapshots and non-progressing pages fail', async () => {
  for (const body of [
    { data: { rows: [{ region: 'East', net: 0.1 }] }, total: 1, hasMore: false },
    { data: { rows: {} }, total: 0, hasMore: false },
    { data: { rows: source }, total: 100, hasMore: false },
    { data: { rows: [] }, total: 100, hasMore: true },
    { data: { rows: source }, total: 2, hasMore: 'false' }
  ]) { const f = fixture(); f.api.operations.call = async () => ({ body, sourceFetchedAt: new Date().toISOString() }); await assert.rejects(f.provider.execute(binding, { region: '' }, f.context)) }
  const f = fixture(); let page = 0
  f.context.options.datasets[0].result.dataAsOfPath = ['asOf']
  f.api.operations.call = async () => ({ body: { data: { rows: [source[page]] }, total: 2, hasMore: page++ === 0, asOf: `2026-01-0${page}T00:00:00Z` }, sourceFetchedAt: new Date().toISOString() })
  await assert.rejects(f.provider.execute(binding, { region: '' }, f.context), /FRESHNESS_INVALID/)
})
test('requires a compatible host, current access and live parent budget', async () => {
  const f = fixture(), missing = new RestAnalyticsProvider({ has: () => false })
  await assert.rejects(missing.discover({}, f.context), /HOST_UPDATE_REQUIRED/)
  f.state.available = false
  await assert.rejects(f.provider.execute(binding, { region: '' }, f.context), /OPERATION_CHANGED/)
  const c = new AbortController(); c.abort()
  for (const context of [{ ...f.context, signal: c.signal }, { ...f.context, deadlineAt: Date.now() - 1 }])
    await assert.rejects(f.provider.execute(binding, { region: '' }, context))
})

test('JSON-body filters and pagination stay provider-owned for approved read-only POST operations', async () => {
  const f = fixture(), dataset = f.context.options.datasets[0]
  dataset.pagination.offset.in = 'body'; dataset.pagination.limit.in = 'body'
  dataset.defaultArguments = { body: { filter: { region: '' } } }
  const b = structuredClone(binding)
  b.payload.arguments = { body: { filter: { region: '' }, offset: 0, limit: 1 } }
  b.payload.parameterPaths = { region: ['body', 'filter', 'region'] }
  const seen = []
  f.api.operations.call = async (scope, request) => {
    seen.push(structuredClone(request))
    const { filter, offset, limit } = request.arguments.body
    const rows = source.filter(row => !filter.region || row.region === filter.region)
    return { body: { data: { rows: rows.slice(offset, offset + limit) }, total: rows.length, hasMore: offset + limit < rows.length }, sourceFetchedAt: new Date().toISOString() }
  }
  const result = await f.provider.execute(b, { region: 'East' }, f.context)
  assert.deepEqual(result.rows, [{ region: 'East', amount: source[0].net }])
  assert.deepEqual(seen[0].arguments, { body: { filter: { region: 'East' }, offset: 0, limit: 1 } })
  assert.equal(b.payload.arguments.body.filter.region, '')
})

test('configuration entry publishes exactly one governed dataset with the same runtime defaults', () => {
  const f = fixture(), options = f.context.options
  assert.deepEqual(f.provider.descriptor.sourceKinds, ['definition'])
  assert.equal(f.provider.descriptor.dataSourceTypes, undefined)
  assert.equal(f.provider.configuration.kind, 'definition')
  assert.deepEqual(f.provider.validateConfiguration(options), optionsSchema.parse(options))
  assert.throws(() => f.provider.validateConfiguration({ ...options, datasets: [] }))
  assert.throws(() => f.provider.validateConfiguration({ ...options, datasets: [...options.datasets, { ...options.datasets[0], id: 'other' }] }))
})
test('Agent authoring supplies scope, validates live result mapping and rejects injected or removed operations', async () => {
  const f = fixture(), authoring = f.provider.authoring
  const context = { actor: f.context.actor, workspaceId: options.workspaceId, connection: { kind: 'rest-toolset', toolsetId: options.toolsetId }, signal: f.context.signal, deadlineAt: Date.now() + 10000 }
  const { id, revision, readOnly, ...input } = definition
  assert.equal((await authoring.inspect({}, context)).operations[0].operationId, definition.operationId)
  const generated = await authoring.prepare(input, context)
  assert.equal(generated.workspaceId, context.workspaceId)
  assert.equal(generated.datasets[0].id, 'dataset')
  assert(f.calls.length > 0)
  await assert.rejects(authoring.prepare({ ...input, workspaceId: options.workspaceId }, context))
  await assert.rejects(authoring.prepare({ ...input, result: { ...input.result, rowsPath: ['missing'] } }, context))
  f.state.available = false
  await assert.rejects(authoring.prepare(input, context), /UNAVAILABLE/)
})
