const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bindParameters, dataXpertPayloadSchema, DataXpertAnalyticsClient } = require('../dist/lib/client.js')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')
const http = require('node:http')
test('group-sharing authority is checked by the data service with the current human token, without executing data', async () => {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'human' }
  let allowed = true, calls = 0
  const server = http.createServer(async (request, response) => {
    calls++
    assert.equal(request.url, '/api/agent-workbench/analytics/authorize-group-sharing')
    assert.equal(request.headers.authorization, 'Bearer current-human')
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    assert.equal(body.binding.resourceId, 'resource')
    assert.equal(body.actor, undefined)
    response.setHeader('content-type', 'application/json')
    response.statusCode = allowed ? 201 : 403
    response.end(JSON.stringify(allowed ? { authorized: true } : { message: 'denied' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const client = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi(input) {
      assert.deepEqual(input, actor); return { getToken: async () => ({ token: 'current-human' }) }
    } }) })
    const context = { actor, maxRows: 1, signal: new AbortController().signal, deadlineAt: Date.now() + 30000,
      options: { baseUrl: `http://127.0.0.1:${server.address().port}/api`, audience: 'data-xpert', assistantCode: 'assistant',
        assistantXpertId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' } }
    const binding = { id: 'stock', payload: { resourceId: 'resource', actionTypeCode: 'sql.query_cube_slice', target: { entityId: 'entity' }, params: {}, parameterPaths: {} } }
    await client.authorizeGroupSharing(binding, context)
    allowed = false
    await assert.rejects(client.authorizeGroupSharing(binding, context))
    assert.equal(calls, 2)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
test('structured parameters replace an entire declared value without interpreting query text', () => {
  const original = { filters: { region: 'all' }, mdx: 'SELECT [Measures].[Sales] ON COLUMNS FROM [Cube]' }
  const result = bindParameters(original, { region: ['filters', 'region'] }, { region: "west' OR 1=1" })
  assert.equal(result.filters.region, "west' OR 1=1"); assert.equal(result.mdx, original.mdx)
  assert.equal(original.filters.region, 'all')
  assert.deepEqual(bindParameters({ filters: [{ field: 'Region', op: 'eq', value: 'East' }] }, { region: ['filters', '0', 'value'] }, { region: 'West' }),
    { filters: [{ field: 'Region', op: 'eq', value: 'West' }] })
  assert.throws(() => bindParameters({ filters: [] }, { region: ['filters', '0'] }, { region: 'east' }))
  assert.throws(() => bindParameters({ filters: {} }, { region: ['filters'] }, { region: 'east' }))
  assert.throws(() => bindParameters({ slicers: [{ value: null }] }, { region: ['params', 'slicers', '0', 'value'] }, { region: 'east' }),
    /parameterPaths are relative to params/)
})
test('HTTP adapter uses current viewer token and maps an ontology effect to stable Dataset fields', async () => {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
  let body, authorization, cached = false, requestedAudience
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString()); authorization = request.headers.authorization
    assert.equal(request.url, '/api/agent-workbench/analytics/query')
    assert.equal(request.headers['organization-id'], 'org')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ effect: { version: 2, kind: 'rows', columns: [{ key: 'Region', semanticRef: 'sales.region' }, { key: 'Revenue' }],
      rows: [{ Region: 'west', Revenue: 80 }], summary: { rowCount: 1, returnedRowCount: 1, truncated: false } },
      fromCache: cached, executionId: 'action-run', auditRef: 'audit-run', fetchedAt: new Date().toISOString() }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const provider = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi(input) { assert.deepEqual(input, actor); return { getToken: async ({ audience }) => { requestedAudience = audience; return { token: 'test-viewer-token' } } } } }) })
    const binding = { id: 'sales', providerId: 'data-xpert.ontology', payload: { resourceId: 'resource', actionTypeCode: 'sql.query_cube_slice', target: { entityId: 'entity' }, params: { filter: 'all' }, parameterPaths: { region: ['filter'] } },
      output: { datasetId: 'sales', grain: ['region'], fields: [
        { id: 'region', sourceField: 'Region', semanticRef: 'sales.region', logicalType: 'string', nullable: false, role: 'dimension' },
        { id: 'amount', sourceField: 'Revenue', logicalType: 'float64', nullable: false, role: 'measure' }
      ] } }
    const context = { actor, maxRows: 100, signal: new AbortController().signal,
      options: { baseUrl: `http://127.0.0.1:${server.address().port}/api`, audience: 'data-xpert-test', assistantCode: 'assistant', assistantXpertId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' } }
    const dataset = normalizeAnalyticsResult(binding, await provider.execute(binding, { region: 'west' }, context), 'run', 100)
    assert.equal(authorization, 'Bearer test-viewer-token'); assert.equal(requestedAudience, 'data-xpert-test')
    assert.equal(body.binding.params.filter, 'west'); assert.equal(body.maxRows, 100)
    assert.equal(body.actor, undefined); assert.equal(body.token, undefined)
    assert.deepEqual(dataset.rows, [{ region: 'west', amount: 80 }])
    assert.equal(dataset.provenance.upstreamExecutionId, 'action-run')
    cached = true
    await assert.rejects(provider.execute(binding, { region: 'west' }, context))
  } finally { await new Promise((resolve) => server.close(resolve)) }
})
test('rejects unknown paths, prototype paths and URL/identity injection in binding payloads', () => {
  assert.throws(() => bindParameters({}, { region: ['missing'] }, { region: 'east' }))
  assert.throws(() => bindParameters({}, { region: ['__proto__', 'polluted'] }, { region: 'east' }))
  assert.equal({}.polluted, undefined)
  assert.equal(dataXpertPayloadSchema.safeParse({ resourceId: 'r', actionTypeCode: 'read', target: { entityId: 'entity' }, params: {}, baseUrl: 'http://evil' }).success, false)
})
test('discovery uses the same actor channel and exposes native contract without connection options', async () => {
  let body
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    body = JSON.parse(Buffer.concat(chunks).toString())
    assert.equal(request.url, '/api/agent-workbench/analytics/discover')
    assert.equal(request.headers.authorization, 'Bearer viewer')
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ items: [{ id: 'r', name: 'Business resource', kind: 'collection', metadata: {}, inspectRequest: { kind: 'entities', resourceId: 'r' } }] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const actor = { userId: 'viewer', tenantId: 'tenant', organizationId: 'org' }
    const provider = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi(input) { assert.deepEqual(input, actor); return { getToken: async () => ({ token: 'viewer' }) } } }) })
    const result = await provider.discover({}, { actor, signal: new AbortController().signal, options: {
      baseUrl: `http://127.0.0.1:${server.address().port}/api`, audience: 'test', assistantCode: 'assistant',
      assistantXpertId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222'
    } })
    assert.deepEqual(body.request, { kind: 'resources' })
    assert.equal(body.assistant.code, 'assistant'); assert.equal(body.actor, undefined)
    assert.equal(result.queryContract.operation, 'action')
    assert.deepEqual(result.items[0].inspectRequest, { kind: 'entities', resourceId: 'r' })
    assert.equal(JSON.stringify(result).includes('Bearer'), false)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

// Fixtures follow data-xpert analytics contract v1; native metadata stays adapter-owned.
async function fixture(t, respond, tokenHandler) {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
  const state = { requests: [], tokens: 0 }
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    state.requests.push({ url: request.url, headers: request.headers, body })
    respond(request, response, body)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const provider = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi(input) {
    assert.deepEqual(input, actor)
    return { getToken: async () => { state.tokens++; return tokenHandler ? tokenHandler() : { token: 'viewer' } } }
  } }) })
  const context = { actor, maxRows: 100, signal: new AbortController().signal, options: {
    baseUrl: `http://127.0.0.1:${server.address().port}/api`, audience: 'data-xpert-test',
    assistantCode: 'assistant', assistantXpertId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222'
  } }
  return { provider, context, state }
}
const simpleBinding = { id: 'dataset', payload: {
  resourceId: 'resource', actionTypeCode: 'native.read', target: { entityTypeCode: 'native_entity', entityRef: 'canonical-ref' }, params: {}, parameterPaths: {}
} }
const effectResponse = (kind = 'rows', truncated = false) => ({
  effect: { version: 2, kind, columns: [{ key: 'amount' }], rows: [{ amount: 80 }],
    summary: { rowCount: truncated ? 20 : 1, returnedRowCount: 1, truncated } },
  fetchedAt: '2026-10-16T00:00:00.000Z', fromCache: false, executionId: 'source-execution', auditRef: 'audit'
})
function schemaResponse() {
  return { ...effectResponse(), effect: { version: 2, kind: 'rows', columns: [
    { key: '/ACCOUNT', semanticRef: '[Account]', logicalType: 'string', role: 'dimension', nullable: false },
    { key: 'SignData', semanticRef: '[Measures].[Amount]', logicalType: 'decimal', role: 'measure', nullable: true }
  ], rows: [{ '/ACCOUNT': 'A', SignData: '9007199254740993.123456789' }, { '/ACCOUNT': 'B', SignData: null }],
  summary: { rowCount: 2, returnedRowCount: 2, truncated: false } } }
}
const schemaRequest = { kind: 'query-schema', datasetId: 'expenses', payload: simpleBinding.payload }
test('schema discovery supplies valid output IDs for omitted IDs and native cube references', async t => {
  const { provider, context, state } = await fixture(t, (_req, res) => res.end(JSON.stringify(schemaResponse())))
  const payload = { ...simpleBinding.payload, resourceId: 'datax-semantic-model-11111111-1111-4111-8111-111111111111',
    target: { entityTypeCode: 'semantic_cube', entityRef: '11111111-1111-4111-8111-111111111111::$/CPMB/KOITZYF' },
    params: { dimensions: ['ACCOUNT'], measures: ['[Measures].[/CPMB/SDATA]'], limit: 20 } }
  const request = { kind: 'query-schema', payload }
  const omitted = (await provider.discover(request, context)).items[0]
  const native = (await provider.discover({ ...request, datasetId: payload.resourceId + '::$/CPMB/KOITZYF' }, context)).items[0]
  assert.deepEqual(native, omitted)
  const output = native.metadata.output
  assert.match(output.datasetId, /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/)
  assert.equal(native.id, output.datasetId)
  assert.equal(native.name, output.datasetId)
  const binding = { ...simpleBinding, id: output.datasetId, providerId: 'data-xpert.ontology', payload, output }
  const result = normalizeAnalyticsResult(binding, await provider.execute(binding, {}, context), 'preview', 100)
  assert.equal(result.rows[0][output.fields[1].id], '9007199254740993.123456789')
  assert.equal(state.requests.length, 3)
  for (const { body } of state.requests) {
    assert.equal(body.binding.id, output.datasetId)
    assert.deepEqual(body.binding.target, payload.target)
    assert.deepEqual(body.binding.params, payload.params)
  }
  const repeated = (await provider.discover(request, context)).items[0]
  assert.equal(repeated.id, native.id)
  for (const changed of [
    { ...payload, params: { ...payload.params, dimensions: [] } },
    { ...payload, target: { ...payload.target, entityRef: 'different-cube' } }
  ]) assert.notEqual((await provider.discover({ ...request, payload: changed }, context)).items[0].id, native.id)
})
test('schema discovery returns a reusable normalized payload without trusted context or rows', async t => {
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(schemaResponse())))
  const { parameterPaths, ...payload } = simpleBinding.payload
  const result = await provider.discover({ kind: 'query-schema', payload }, context)
  assert.deepEqual(result.items[0].metadata.payload, { ...payload, parameterPaths: {} })
  const { analyticsBindingSchema } = require('@xpert-ai/plugin-sdk/analytics')
  const binding = analyticsBindingSchema.parse({ id: result.items[0].id, providerId: 'data-xpert.ontology',
    source: { kind: 'definition', definitionId: '11111111-1111-4111-8111-111111111111', versionId: '22222222-2222-4222-8222-222222222222' },
    operation: result.queryContract.operation, contractVersion: result.queryContract.contractVersion,
    parameters: [], ...result.items[0].metadata })
  const preview = normalizeAnalyticsResult(binding, await provider.execute(binding, {}, context), 'preview', 100)
  assert.equal(preview.rows[0][binding.output.fields[1].id], '9007199254740993.123456789')
  for (const privateValue of ['9007199254740993', 'Bearer viewer', 'baseUrl', 'assistantXpertId']) {
    assert.equal(JSON.stringify(result.items[0].metadata).includes(privateValue), false)
  }
})
test('schema ID aliases remain bounded strings and cannot introduce identity overrides', async t => {
  const { provider, context, state } = await fixture(t, (_req, res) => res.end('{}'))
  for (const datasetId of [null, 1, {}, '', 'x'.repeat(513)]) {
    await assert.rejects(provider.discover({ ...schemaRequest, datasetId }, context))
  }
  await assert.rejects(provider.discover({ kind: 'query-schema', payload: simpleBinding.payload, actor: { userId: 'owner' } }, context))
  assert.equal(state.tokens, 0)
  assert.equal(state.requests.length, 0)
})
test('declared result metadata survives HTTP parsing without converting exact decimals', async t => {
  const response = schemaResponse()
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  const result = await provider.execute(simpleBinding, {}, context)
  assert.deepEqual(result.columns, response.effect.columns)
  assert.deepEqual(result.rows, response.effect.rows)
})
test('query-schema discovery supplies the binding contract before a real normalized preview', async t => {
  const response = schemaResponse()
  const { provider, context, state } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  const discovery = await provider.discover(schemaRequest, context)
  const output = discovery.items[0].metadata.output
  assert.equal(output.datasetId, 'expenses'); assert.deepEqual(output.grain, [])
  assert.deepEqual(output.fields.map(({ sourceField, logicalType, role, nullable }) => ({ sourceField, logicalType, role, nullable })),
    response.effect.columns.map(({ key, logicalType, role, nullable }) => ({ sourceField: key, logicalType, role, nullable })))
  const { analyticsBindingSchema } = require('@xpert-ai/plugin-sdk/analytics')
  const binding = analyticsBindingSchema.parse({ id: 'expenses', providerId: 'data-xpert.ontology',
    source: { kind: 'definition', definitionId: '11111111-1111-4111-8111-111111111111', versionId: '22222222-2222-4222-8222-222222222222' },
    operation: discovery.queryContract.operation, contractVersion: discovery.queryContract.contractVersion,
    payload: simpleBinding.payload, parameters: [], output })
  const result = await provider.execute(binding, {}, context)
  const dataset = normalizeAnalyticsResult(binding, result, 'preview', context.maxRows)
  assert.equal(dataset.rows[0][output.fields[1].id], '9007199254740993.123456789')
  assert.equal(dataset.rows[1][output.fields[1].id], null)
  assert.equal(state.requests.length, 2)
  for (const request of state.requests) {
    assert.equal(request.url, '/api/agent-workbench/analytics/query')
    assert.equal(request.body.maxRows, context.maxRows)
    assert.equal(request.headers.authorization, 'Bearer viewer')
  }
  assert.equal(JSON.stringify(discovery).includes('9007199254740993'), false)
  const wrong = structuredClone(binding); wrong.output.fields[1].logicalType = 'float64'
  assert.throws(() => normalizeAnalyticsResult(wrong, result, 'bad-preview', 100), /TYPE_MISMATCH/)
})
test('empty results retain declared types and stable field IDs across column reordering', async t => {
  const response = schemaResponse(); response.effect.rows = []; response.effect.summary = { rowCount: 0, returnedRowCount: 0, truncated: false }
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  const first = (await provider.discover(schemaRequest, context)).items[0].metadata.output
  response.effect.columns.reverse()
  const second = (await provider.discover(schemaRequest, context)).items[0].metadata.output
  assert.deepEqual(first.fields, second.fields.reverse())
})
test('schema authoring refuses missing declarations and ambiguous keys while legacy execution stays compatible', async t => {
  let response = schemaResponse()
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  for (const property of ['logicalType', 'role', 'nullable']) {
    response = schemaResponse(); delete response.effect.columns[1][property]
    await assert.rejects(provider.discover(schemaRequest, context), /DATAX_RESULT_SCHEMA_UNAVAILABLE/)
  }
  response = schemaResponse(); response.effect.columns.push(response.effect.columns[0])
  await assert.rejects(provider.discover(schemaRequest, context), /DATAX_RESULT_SCHEMA_AMBIGUOUS/)
  response = effectResponse()
  assert.deepEqual((await provider.execute(simpleBinding, {}, context)).rows, response.effect.rows)
})
test('schema queries bind native parameters and reject identity overrides before requesting a token', async t => {
  const { provider, context, state } = await fixture(t, (_req, res) => res.end(JSON.stringify(schemaResponse())))
  const request = { ...schemaRequest, payload: { ...simpleBinding.payload, params: { category: 'actual' }, parameterPaths: { category: ['category'] } }, parameters: { category: 'budget' } }
  await provider.discover(request, context)
  assert.equal(state.requests[0].body.binding.params.category, 'budget')
  assert.equal(request.payload.params.category, 'actual')
  for (const invalid of [{ ...request, actor: { userId: 'owner' } }, { ...request, baseUrl: 'https://evil.test' }]) {
    await assert.rejects(provider.discover(invalid, context))
  }
  await assert.rejects(provider.discover({ ...request, parameters: {} }, context), /MAPPING_INVALID/)
  assert.equal(state.requests.length, 1); assert.equal(state.tokens, 1)
})
test('repeated semantic selectors use unique native keys and declared labels and units', async t => {
  const response = schemaResponse()
  response.effect.columns[0].semanticRef = response.effect.columns[1].semanticRef
  response.effect.columns[1].label = 'Amount'; response.effect.columns[1].unit = 'CNY'
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  const output = (await provider.discover(schemaRequest, context)).items[0].metadata.output
  assert.ok(output.fields.every(field => !Object.hasOwn(field, 'semanticRef')))
  assert.equal(output.fields[1].label, 'Amount'); assert.equal(output.fields[1].unit, 'CNY')
  const result = await provider.execute(simpleBinding, {}, context)
  assert.equal(normalizeAnalyticsResult({ ...simpleBinding, output, providerId: 'data-xpert.ontology' }, result, 'preview', 100).rows[0][output.fields[1].id], '9007199254740993.123456789')
})
test('schema probes retain authorization failures, response limits and cancellation', async t => {
  const { provider, context, state } = await fixture(t, (_req, res) => { res.writeHead(403); res.end('PRIVATE_DETAIL') })
  await assert.rejects(provider.discover(schemaRequest, context), error => error.message === 'DATAX_QUERY_HTTP_403')
  const controller = new AbortController(); controller.abort()
  await assert.rejects(provider.discover(schemaRequest, { ...context, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(state.requests.length, 1); assert.equal(state.tokens, 1)
  const wide = schemaResponse()
  wide.effect.columns = Array.from({ length: 81 }, (_, index) => ({ ...wide.effect.columns[0], key: `column_${index}` }))
  const f = await fixture(t, (_req, res) => res.end(JSON.stringify(wide)))
  await assert.rejects(f.provider.discover(schemaRequest, f.context), /80/)
})
test('semantic and OData definitions, canonical targets and snapshot metadata pass through unchanged', async t => {
  const definitions = [
    { adapterId: 'semantic_model', contractVersion: 1, metadata: { analysisContract: { measures: ['Amount'], timeDimensions: [] } }, instructions: ['Use authored semantic fields.'] },
    { adapterId: 'sap_odata_api', contractVersion: 1, metadata: { properties: [{ name: 'NetAmount', type: 'Edm.Decimal' }], keys: ['ID'], queryCapabilities: { apply: false } }, instructions: ['Use EDM types; a collection page is not a complete aggregate.'] }
  ]
  let nextResponse
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(nextResponse)))
  for (const definition of definitions) {
    const target = { entityTypeCode: 'published_type', entityRef: 'exact::external-ref' }
    const item = { id: target.entityRef, name: 'Published object', kind: 'dataset',
      inspectRequest: { kind: 'actions', resourceId: 'resource', target },
      metadata: { definition, target, snapshotId: 'snapshot', graphVersion: 'version', partitionKey: 'opaque-partition' } }
    nextResponse = { items: [item] }
    const result = await provider.discover({ kind: 'entities', resourceId: 'resource' }, context)
    assert.deepEqual(result.items[0], item)
    assert.match(result.queryContract.instructions, /metadata.definition/)
    assert.doesNotMatch(result.queryContract.instructions, /timeDimensions is empty|op=eq|slicers/)
  }
})
test('empty authorized pages retain their cursor and Action inputSchema is not reinterpreted', async t => {
  let response = { items: [], nextRequest: { kind: 'resources', after: 'opaque-cursor' } }
  const { provider, context, state } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  const first = await provider.discover({}, context)
  assert.deepEqual(first.nextRequest, response.nextRequest)
  const inputSchema = { type: 'object', properties: { nativeFilter: { type: 'string' } }, required: ['nativeFilter'] }
  response = { items: [{ id: 'native.read', name: 'Read', kind: 'dataset', metadata: { inputSchema, inputHint: 'Use the native schema', actionTypeCode: 'native.read' } }] }
  const next = await provider.discover(first.nextRequest, context)
  assert.deepEqual(state.requests[1].body.request, { kind: 'resources', after: 'opaque-cursor' })
  assert.deepEqual(next.items[0].metadata.inputSchema, inputSchema)
})
test('discovery and payload validation reject identity overrides and missing targets before token issuance', async t => {
  const { provider, context, state } = await fixture(t, (_req, res) => res.end('{}'))
  for (const request of [{ kind: 'resources', actor: 'owner' }, { kind: 'entities' }, { kind: 'actions', resourceId: 'r', target: {} }, { kind: 'unknown' }]) {
    await assert.rejects(provider.discover(request, context))
  }
  for (const target of [{}, { entityId: ' ' }, { entityRef: '' }, { entityId: 'id', userId: 'owner' }]) {
    await assert.rejects(provider.execute({ ...simpleBinding, payload: { ...simpleBinding.payload, target } }, {}, context))
  }
  assert.equal(state.tokens, 0); assert.equal(state.requests.length, 0)
  for (const target of [{ entityId: 'id' }, { entityRef: 'ref', entityTypeCode: 'type' }]) {
    assert.equal(dataXpertPayloadSchema.safeParse({ ...simpleBinding.payload, target }).success, true)
  }
})
test('parameter mappings reject missing, extra, duplicate and noncanonical array paths', () => {
  assert.throws(() => bindParameters({ value: null }, { x: ['value'] }, {}), /MAPPING_INVALID/)
  assert.throws(() => bindParameters({ value: null }, {}, { x: 1 }), /MAPPING_INVALID/)
  assert.throws(() => bindParameters({ value: null }, { x: ['value'], y: ['value'] }, { x: 1, y: 2 }), /MAPPING_INVALID/)
  assert.throws(() => bindParameters({ values: [null] }, { x: ['values', '01'] }, { x: 1 }), /PATH_INVALID/)
  assert.throws(() => bindParameters({ values: [null] }, { x: ['values', 'length'] }, { x: 1 }), /PATH_INVALID/)
  assert.deepEqual(bindParameters({ value: 'east' }, { x: ['value'] }, { x: null }), { value: null })
})
test('rows, series and entity effects use canonical rows, preserve audit and mark partial totals', async t => {
  let response
  const { provider, context } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  for (const kind of ['rows', 'series', 'entity']) {
    response = effectResponse(kind, true)
    const result = await provider.execute(simpleBinding, {}, context)
    assert.deepEqual(result.rows, [{ amount: 80 }]); assert.equal(result.sourceFetchedAt, response.fetchedAt)
    assert.deepEqual(result.completeness, { returnedRows: 1, totalRows: 20, totalAccuracy: 'unknown', scope: 'page', truncated: true })
    assert.equal(result.upstreamExecutionId, 'source-execution'); assert.equal(result.auditRef, 'audit')
  }
})
test('unsupported effects and cached replies fail; refresh performs another request', async t => {
  let response = effectResponse()
  const { provider, context, state } = await fixture(t, (_req, res) => res.end(JSON.stringify(response)))
  assert.deepEqual((await provider.execute(simpleBinding, {}, context)).rows, [{ amount: 80 }])
  response.effect.rows = [{ amount: 90 }]
  assert.deepEqual((await provider.execute(simpleBinding, {}, context)).rows, [{ amount: 90 }])
  assert.equal(state.requests.length, 2)
  response.fromCache = true
  await assert.rejects(provider.execute(simpleBinding, {}, context))
  response.fromCache = false; response.effect.kind = 'unknown'
  await assert.rejects(provider.execute(simpleBinding, {}, context))
})
test('invalid configured URLs fail before token issuance', async t => {
  const { provider, context, state } = await fixture(t, (_req, res) => res.end('{}'))
  for (const baseUrl of ['ftp://example.test', 'https://user:secret@example.test', 'https://example.test?token=hidden', 'https://example.test#fragment']) {
    await assert.rejects(provider.discover({}, { ...context, options: { ...context.options, baseUrl } }), /DATAX_URL_INVALID/)
  }
  assert.equal(state.tokens, 0); assert.equal(state.requests.length, 0)
})
test('redirects are refused and upstream HTTP error bodies are not exposed', async t => {
  const { provider, context, state } = await fixture(t, (req, res) => {
    if (req.url.endsWith('discover')) { res.writeHead(302, { location: '/redirected' }); res.end() }
    else { res.writeHead(403); res.end('PRIVATE_UPSTREAM_DETAIL') }
  })
  await assert.rejects(provider.discover({}, context))
  assert.equal(state.requests.length, 1)
  await assert.rejects(provider.execute(simpleBinding, {}, context), e => e.message === 'DATAX_QUERY_HTTP_403' && !e.message.includes('PRIVATE'))
})
test('oversized streaming responses fail instead of buffering without bounds', async t => {
  const { provider, context } = await fixture(t, (_req, res) => res.end('x'.repeat(2_500_001)))
  await assert.rejects(provider.execute(simpleBinding, {}, context), /DATAX_RESPONSE_TOO_LARGE/)
})
test('HTTP failures cancel an unfinished error body', { timeout: 2000 }, async t => {
  let closed
  const { provider, context } = await fixture(t, (_req, res) => {
    closed = new Promise(resolve => res.on('close', resolve))
    res.writeHead(403); res.write('PRIVATE_UPSTREAM_DETAIL')
  })
  await assert.rejects(provider.discover({}, context), /DATAX_QUERY_HTTP_403/)
  await closed
})
test('abort before or during token acquisition prevents the HTTP request', async t => {
  const controller = new AbortController()
  const { provider, context, state } = await fixture(t, (_req, res) => res.end('{}'), async () => {
    controller.abort(new Error('cancelled during token acquisition'))
    return { token: 'viewer' }
  })
  await assert.rejects(provider.discover({}, { ...context, signal: controller.signal }), /cancelled during/)
  assert.equal(state.requests.length, 0); assert.equal(state.tokens, 1)
  await assert.rejects(provider.discover({}, { ...context, signal: controller.signal }), /cancelled during/)
  assert.equal(state.tokens, 1)
})
test('abort cancels an in-flight response body', async t => {
  const controller = new AbortController()
  const { provider, context } = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }); res.write('{')
    setImmediate(() => controller.abort())
  })
  await assert.rejects(provider.discover({}, { ...context, signal: controller.signal }), e => e.name === 'AbortError')
})
