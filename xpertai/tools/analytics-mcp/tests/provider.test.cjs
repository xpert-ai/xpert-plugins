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
const binding = { id: 'sales', source: { kind: 'definition', definitionId: '00000000-0000-4000-8000-000000000003', versionId: '00000000-0000-4000-8000-000000000004' }, providerId: 'mcp.tool', operation: 'query', contractVersion: 1,
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
  const context = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }, source: binding.source,
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

test('invalid argument paths return an actionable safe error without invoking MCP or widening selectors', async () => {
  const f = fixture()
  for (const payload of [
    { ...binding.payload, parameterPaths: { region: ['arguments', 'filter', 'region'] } },
    { ...binding.payload, arguments: { filter: {} } }
  ]) await assert.rejects(f.provider.execute({ ...binding, payload }, { region: 'private-value' }, f.context), error => {
    assert.equal(error.getStatus(), 400)
    const response = error.getResponse()
    assert.equal(response.code, 'MCP_DATASET_PARAMETER_PATH_INVALID')
    assert.match(response.message, /relative to arguments/)
    assert.match(response.message, /literal default/)
    assert.equal(response.message.includes('private-value'), false)
    return true
  })
  assert.equal(f.calls.length, 0)
  // An actual MCP field named "arguments" is legitimate; do not infer paths from names.
  const nested = payloadSchema.parse({ ...binding.payload, arguments: { arguments: { region: null } },
    parameterPaths: { region: ['arguments', 'region'] } })
  assert.equal(bindArguments(nested, { region: 'East' }).arguments.region, 'East')
  assert.equal(nested.arguments.arguments.region, null)
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

test('configuration entry publishes exactly one governed dataset with the same runtime defaults', () => {
  const f = fixture(), options = f.context.options
  assert.deepEqual(f.provider.descriptor.sourceKinds, ['definition'])
  assert.equal(f.provider.descriptor.dataSourceTypes, undefined)
  assert.equal(f.provider.configuration.kind, 'definition')
  assert.deepEqual(f.provider.validateConfiguration(options), optionsSchema.parse(options))
  assert.throws(() => f.provider.validateConfiguration({ ...options, datasets: [] }))
  assert.throws(() => f.provider.validateConfiguration({ ...options, datasets: [...options.datasets, { ...options.datasets[0], id: 'other' }] }))
})
test('Agent authoring keeps approved tool defaults and refuses removed tools, invalid mappings and scope injection', async () => {
  const f = fixture(), context = { actor: f.context.actor, workspaceId: ids.workspaceId, connection: { kind: 'mcp-toolset', toolsetId: ids.toolsetId, serverName: 'business' }, signal: f.context.signal, deadlineAt: Date.now() + 10000 }
  const { id, revision, readOnly, ...mapping } = definition
  const input = { ...mapping, defaultArguments: binding.payload.arguments }
  assert.equal((await f.provider.authoring.inspect({}, context)).operations[0].name, definition.toolName)
  const generated = await f.provider.authoring.prepare(input, context)
  const detail = await f.provider.discover({ datasetId: 'dataset' }, { ...f.context, options: generated })
  assert.deepEqual(detail.items[0].metadata.bindingPayload.arguments, input.defaultArguments)
  assert.equal(f.calls[0].scope.serverName, 'business')
  await assert.rejects(f.provider.authoring.prepare({ ...input, serverName: 'other' }, context))
  await assert.rejects(f.provider.authoring.prepare({ ...input, result: { ...input.result, rowsPath: ['missing'] } }, context))
  f.state.available = false
  await assert.rejects(f.provider.authoring.prepare(input, context), /UNAVAILABLE/)
})
