const { test } = require('node:test')
const assert = require('node:assert/strict')
const { McpAnalyticsProvider } = require('../dist/lib/provider')
const { optionsSchema, bindArguments, payloadSchema } = require('../dist/lib/schema')
const { normalizeAnalyticsResult, analyticsDiscoveryResultSchema } = require('@xpert-ai/plugin-sdk/analytics')

const ids = { workspaceId: '00000000-0000-4000-8000-000000000001', toolsetId: '00000000-0000-4000-8000-000000000002' }
const hash = 'a'.repeat(64)
const columns = [
  { key: 'region', path: ['dimension', 'region'], label: 'Region', description: 'Sales region', logicalType: 'string', nullable: false, role: 'dimension' },
  { key: 'amount', path: ['net'], label: 'Net sales', description: 'Paid minus refunds', logicalType: 'decimal', nullable: false, role: 'measure', unit: 'CNY' }
]
const definition = { id: 'sales', revision: 'v1', name: 'Sales', description: 'Net paid sales in CNY', toolName: 'sales_query', readOnly: true,
  result: { format: 'structured', rowsPath: ['data', 'rows'], columns, scope: 'full_query_result', totalPath: ['total'], truncatedPath: ['truncated'] } }
const options = { ...ids, serverName: 'business', datasets: [definition] }
const binding = { schemaVersion: 1, id: 'sales', dataSourceId: '00000000-0000-4000-8000-000000000003', providerId: 'mcp.tool', operation: 'query', contractVersion: 1,
  payload: { datasetId: 'sales', revision: 'v1', toolContractHash: hash, arguments: { filter: { region: null } }, parameterPaths: { region: ['filter', 'region'] } },
  parameters: [{ name: 'region', controlId: 'region', type: 'string', required: false }],
  output: { datasetId: 'net_sales', grain: ['region'], fields: columns.map(({ path, key, description, ...field }) => ({ ...field, id: key, sourceField: key })) } }
const sourceRows = [{ dimension: { region: 'East' }, net: '9007199254740993.12' }, { dimension: { region: 'West' }, net: '900.00' }]

function fixture() {
  const calls = [], discoveries = [], state = { multiplier: 0, fail: false, available: true }
  const api = { tools: {
    list: async (scope) => { discoveries.push(scope); return state.available ? [{ name: 'sales_query', description: 'Sales metrics', contractHash: hash,
      inputSchema: { type: 'object', properties: { filter: { type: 'object' } }, required: ['filter'] } }] : [] },
    call: async (scope, request) => {
      calls.push({ scope, request })
      if (state.fail) throw new Error('MCP_CLIENT_UNAVAILABLE')
      const rows = sourceRows.filter((row) => request.arguments.filter.region === null || row.dimension.region === request.arguments.filter.region)
        .map((row) => ({ ...row, net: state.multiplier ? '2000.00' : row.net }))
      return { structuredContent: { data: { rows }, total: rows.length, truncated: false }, text: [] }
    }
  } }
  const provider = new McpAnalyticsProvider({ has: () => true, require: (capability) => { assert.equal(capability.id, 'platform.mcp.client'); return api } })
  const context = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }, dataSourceId: binding.dataSourceId,
    options: structuredClone(options), signal: new AbortController().signal, maxRows: 1000, timeoutMs: 1000, deadlineAt: Date.now() + 1000, executionId: 'execution', ancestry: ['mcp.tool'] }
  return { provider, api, calls, discoveries, state, context }
}

test('discovery uses the platform connection and only configured, currently enabled tools; contract is Agent-readable', async () => {
  const f = fixture(), listing = await f.provider.discover({}, f.context)
  const result = await f.provider.discover(listing.items[0].inspectRequest, f.context)
  analyticsDiscoveryResultSchema.parse(result)
  assert.deepEqual(result.items.map((item) => item.id), ['sales'])
  assert.equal(result.items[0].metadata.toolContractHash, hash)
  assert.equal(result.items[0].metadata.columns[1].unit, 'CNY')
  assert.equal(result.items[0].metadata.columns[0].path, undefined)
  assert.equal(result.items[0].metadata.inputSchema.type, 'object')
  assert.equal(result.queryContract.operation, 'query')
  assert.equal(JSON.stringify(result).includes(ids.toolsetId), false)
  assert.deepEqual(f.discoveries[0].actor, f.context.actor)
  f.state.available = false
  assert.deepEqual((await f.provider.discover({}, f.context)).items, [])
  await assert.rejects(f.provider.discover({ datasetId: 'sales' }, f.context), /UNAVAILABLE/)
})

test('saved Binding supports filtering, fresh refresh and reopen with the same typed output', async () => {
  const f = fixture()
  const all = normalizeAnalyticsResult(binding, await f.provider.execute(binding, { region: null }, f.context), 'all', 1000)
  assert.equal(all.rows.length, 2); assert.equal(all.rows[0].amount, '9007199254740993.12')
  const filtered = normalizeAnalyticsResult(binding, await f.provider.execute(binding, { region: 'West' }, f.context), 'filtered', 1000)
  assert.deepEqual(filtered.rows, [{ region: 'West', amount: '900.00' }])
  f.state.multiplier = 1
  const reopened = JSON.parse(JSON.stringify(binding))
  const refreshed = normalizeAnalyticsResult(reopened, await f.provider.execute(reopened, { region: 'West' }, f.context), 'fresh', 1000)
  assert.deepEqual(refreshed.rows, [{ region: 'West', amount: '2000.00' }])
  assert.deepEqual(f.calls[2].request, { toolName: 'sales_query', contractHash: hash, arguments: { filter: { region: 'West' } } })
  assert.deepEqual(binding.payload.arguments, { filter: { region: null } })
  assert.equal(refreshed.provenance.sourceVersion, `v1:${hash}`)
})

test('empty rows retain fields; row limits and upstream truncation never become full totals', async () => {
  const f = fixture()
  const empty = normalizeAnalyticsResult(binding, await f.provider.execute(binding, { region: 'Unknown' }, f.context), 'empty', 1000)
  assert.equal(empty.rows.length, 0); assert.equal(empty.fields.length, 2)
  const limited = await f.provider.execute(binding, { region: null }, { ...f.context, maxRows: 1 })
  assert.deepEqual(limited.completeness, { returnedRows: 1, totalRows: 2, totalAccuracy: 'exact', truncated: true, scope: 'page' })
  f.api.tools.call = async () => ({ structuredContent: { data: { rows: [sourceRows[0]] }, total: 100, truncated: true }, text: [] })
  const page = await f.provider.execute(binding, { region: null }, f.context)
  assert.equal(page.completeness.scope, 'page'); assert.equal(page.completeness.truncated, true)
})

test('tool/connection/url/result-selector overrides, unapproved datasets and old revisions fail before invoking', async () => {
  const f = fixture()
  for (const payload of [ { ...binding.payload, toolName: 'delete' }, { ...binding.payload, url: 'http://evil.invalid' },
    { ...binding.payload, actor: { userId: 'owner' } }, { ...binding.payload, result: {} },
    { ...binding.payload, readOnly: false }, { ...binding.payload, policy: 'unrestricted' },
    { ...binding.payload, datasetId: 'unknown' }, { ...binding.payload, revision: 'v2' } ])
    await assert.rejects(f.provider.execute({ ...binding, payload }, { region: null }, f.context))
  assert.equal(f.calls.length, 0)
  for (const extra of [{ baseUrl: 'https://invalid' }, { token: 'private' }, { connection: {} }])
    assert.equal(optionsSchema.safeParse({ ...options, ...extra }).success, false)
})

test('requires the generic MCP client capability and fails closed on an older host', async () => {
  const f = fixture()
  const provider = new McpAnalyticsProvider({
    has: (capability) => { assert.equal(capability.id, 'platform.mcp.client'); return false },
    require: () => { throw new Error('Unavailable capability must not be resolved') }
  })
  await assert.rejects(provider.discover({}, f.context), /HOST_UPDATE_REQUIRED/)
  await assert.rejects(provider.execute(binding, { region: null }, f.context), /HOST_UPDATE_REQUIRED/)
})

test('parameter paths reject missing, duplicate, overlapping, object and prototype replacements', async () => {
  const f = fixture()
  for (const [parameterPaths, values] of [
    [{ region: ['missing'] }, { region: 'East' }], [{ region: ['filter'] }, { region: 'East' }],
    [{ region: ['filter', 'region'], other: ['filter', 'region'] }, { region: 'East', other: 'West' }],
    [{ region: ['__proto__', 'polluted'] }, { region: 'East' }],
    [{}, { region: 'East' }], [{ region: ['filter', 'region'] }, {}]
  ]) await assert.rejects(f.provider.execute({ ...binding, payload: { ...binding.payload, parameterPaths } }, values, f.context))
  const arrayPayload = payloadSchema.parse({ ...binding.payload, arguments: { filters: [{ region: null }] }, parameterPaths: { region: ['filters', '0', 'region'] } })
  assert.equal(bindArguments(arrayPayload, { region: 'East' }).filters[0].region, 'East')
  assert.equal({}.polluted, undefined); assert.equal(f.calls.length, 0)
})

test('structured JSON and text JSON are explicit alternatives, never extracted from prose or resource links', async () => {
  const f = fixture(), content = { data: { rows: sourceRows }, total: 2, truncated: false }
  f.api.tools.call = async () => ({ text: [JSON.stringify(content)] })
  await assert.rejects(f.provider.execute(binding, { region: null }, f.context), /STRUCTURED_CONTENT_REQUIRED/)
  f.context.options.datasets[0].result.format = 'text_json'
  assert.equal((await f.provider.execute(binding, { region: null }, f.context)).rows.length, 2)
  for (const text of [[JSON.stringify(content), 'extra'], ['```json\n{}\n```'], ['See https://example.invalid/data']]) {
    f.api.tools.call = async () => ({ text })
    await assert.rejects(f.provider.execute(binding, { region: null }, f.context))
  }
})

test('missing fields, lossy decimal numbers, invalid totals and malformed rows fail instead of fabricating values', async () => {
  const f = fixture()
  for (const document of [
    { data: { rows: [{ dimension: { region: 'East' }, net: 0.1 }] }, total: 1, truncated: false },
    { data: { rows: [{ dimension: {} , net: '1.00' }] }, total: 1, truncated: false },
    { data: { rows: sourceRows }, total: 100, truncated: false },
    { data: { rows: {} }, total: 0, truncated: false },
    { data: { rows: [] }, total: 0, truncated: 'false' }
  ]) { f.api.tools.call = async () => ({ structuredContent: document, text: [] }); await assert.rejects(f.provider.execute(binding, { region: null }, f.context)) }
})

test('revoked tool access, cancellation and expired parent budget never return a dataset', async () => {
  const f = fixture(); f.state.fail = true
  await assert.rejects(f.provider.execute(binding, { region: null }, f.context), /UNAVAILABLE/)
  const controller = new AbortController(); controller.abort()
  for (const context of [{ ...f.context, signal: controller.signal }, { ...f.context, deadlineAt: Date.now() - 1 }]) {
    await assert.rejects(f.provider.discover({}, context)); await assert.rejects(f.provider.execute(binding, { region: null }, context))
  }
  const during = new AbortController()
  f.api.tools.call = async () => { during.abort(); return { structuredContent: { data: { rows: [] }, total: 0, truncated: false }, text: [] } }
  await assert.rejects(f.provider.execute(binding, { region: null }, { ...f.context, signal: during.signal }))
})
