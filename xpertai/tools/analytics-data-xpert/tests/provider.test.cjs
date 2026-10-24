const { test } = require('node:test')
const assert = require('node:assert/strict')
const { bindParameters, dataXpertPayloadSchema, DataXpertAnalyticsClient } = require('../dist/lib/client.js')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')
const http = require('node:http')
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
