const { test } = require('node:test')
const assert = require('node:assert/strict')
const { listModels, previewModel } = require('../dist/lib/application-models.js')
const { DataXpertAnalyticsClient } = require('../dist/lib/client.js')
const resourceId = 'authorized-model'
const context = {
  actor: { tenantId: 'tenant', organizationId: 'org', userId: 'reader' },
  options: { resourceId },
  signal: new AbortController().signal
}
const recipe = {
  kind: 'sql-cube-slice',
  cube: 'C',
  dimensions: ['Month'],
  measures: ['Amount'],
  filters: [{ field: 'Month', op: 'eq', value: 'November' }],
  aliases: { actual: 'Amount' },
  limit: 10,
  singleRow: true
}
const target = { entityTypeCode: 'semantic_cube', entityRef: 'ref-c' }
function fixture() {
  const calls = []
  const client = {
    async discover(input) {
      if (input.kind === 'resources')
        return input.after
          ? {
              items: [
                {
                  id: resourceId,
                  name: 'Readable model',
                  kind: 'collection',
                  metadata: { adapterId: 'semantic_model', entityTypes: ['semantic_cube'] }
                }
              ]
            }
          : { items: [], nextRequest: { kind: 'resources', after: 'next' } }
      assert.equal(input.resourceId, resourceId)
      if (input.kind === 'entities')
        return {
          items: [
            {
              metadata: {
                target,
                definition: {
                  adapterId: 'semantic_model',
                  contractVersion: 1,
                  metadata: { analysisContract: { cubeName: 'C' } }
                }
              }
            }
          ]
        }
      assert.deepEqual(input.target, target)
      return { items: [{ metadata: { actionTypeCode: 'sql.query_cube_slice', target } }] }
    },
    async previewApplicationQuery(key, payload) {
      calls.push({ key, payload })
      return {
        effect: {
          summary: { rowCount: 1, returnedRowCount: 1, truncated: false },
          columns: [
            { key: 'Month', role: 'dimension', logicalType: 'string', nullable: false },
            { key: 'amount_key', semanticRef: 'Amount', role: 'measure', logicalType: 'decimal', nullable: false }
          ],
          rows: [{ Month: 'November', amount_key: '123.45' }]
        }
      }
    }
  }
  return { client, calls }
}
test('uses only authorized models, canonical action targets and declared recipes, preserves exact decimals', async () => {
  const { client, calls } = fixture()
  assert.deepEqual(await listModels(client, context), [{ id: resourceId, label: 'Readable model' }])
  const preview = await previewModel(client, context, resourceId, { one: recipe, two: recipe, three: recipe })
  assert.deepEqual(
    calls.map((c) => c.key),
    ['one', 'two', 'three']
  )
  assert.deepEqual(calls[0].payload.params.filters, recipe.filters)
  for (const q of preview.queries) {
    assert.equal(q.sample[0].actual, '123.45')
    assert.equal(q.binding.payload.target.entityRef, target.entityRef)
  }
  await assert.rejects(previewModel(client, context, 'unauthorized', { one: recipe }), /MODEL_UNAVAILABLE/)
})
test('missing measures, conflicting cube names and truncated results cannot be confirmed', async () => {
  const { client } = fixture()
  await assert.rejects(
    previewModel(client, context, resourceId, { a: { ...recipe, cube: 'Wrong' } }),
    /RECIPE_UNAVAILABLE/
  )
  await assert.rejects(
    previewModel(client, context, resourceId, { a: { ...recipe, aliases: { actual: 'Unknown' } } }),
    /REQUIRED_MEASURE/
  )
  const query = client.previewApplicationQuery
  client.previewApplicationQuery = async (...args) => {
    const r = await query(...args)
    r.effect.summary.truncated = true
    return r
  }
  await assert.rejects(previewModel(client, context, resourceId, { a: recipe }), /RESULT_INCOMPLETE/)
})

test('an explicit SQL projection validates legacy column-only results and preserves exact decimals', async () => {
  const { client } = fixture()
  const rows = [{ Month: 'November', Amount: '9007199254740993.01' }]
  const columns = [{ key: 'Month', type: 'string' }, { key: 'Amount' }]
  client.previewApplicationQuery = async () => ({
    effect: { rows, columns, summary: { rowCount: rows.length, returnedRowCount: rows.length, truncated: false } }
  })
  const setup = { ...recipe, singleRow: false, legacyOutputTypes: { Month: 'string', Amount: 'decimal' } }
  const read = (r = setup) => previewModel(client, context, resourceId, { analysisBinding: r })
  const [q] = (await read()).queries
  assert.equal(q.sample[0].actual, '9007199254740993.01')
  assert.deepEqual(q.binding.output.fields.map((f) => [f.sourceField, f.role, f.logicalType]),
    [['Month', 'dimension', 'string'], ['Amount', 'measure', 'decimal']])
  await assert.rejects(read(recipe), /RESULT_SCHEMA_UNAVAILABLE/)
  await assert.rejects(read({ ...setup, legacyOutputTypes: { Amount: 'decimal', Other: 'string' } }), /RESULT_INCOMPLETE/)
  columns[1].logicalType = 'string'
  await assert.rejects(read(), /TYPE_MISMATCH/)
  delete columns[1].logicalType
  rows.push({ Month: 'December', Amount: 'unavailable' })
  await assert.rejects(read(), /TYPE_MISMATCH/)
})
test('a model-scoped definition rejects queries, sharing and discovery on a different resource before network I/O', async () => {
  const client = new DataXpertAnalyticsClient({
    require() {
      assert.fail('unexpected token request')
    }
  })
  const payload = {
    resourceId: 'other',
    actionTypeCode: 'sql.query_cube_slice',
    target,
    params: {},
    parameterPaths: {}
  }
  await assert.rejects(client.execute({ id: 'test', payload }, {}, context), /MODEL_UNAVAILABLE/)
  await assert.rejects(client.authorizeGroupSharing({ id: 'test', payload }, context), /MODEL_UNAVAILABLE/)
  await assert.rejects(client.discover({ kind: 'entities', resourceId: 'other' }, context), /MODEL_UNAVAILABLE/)
  await assert.rejects(client.discover({ kind: 'query-schema', payload }, context), /MODEL_UNAVAILABLE/)
})

test('model discovery uses the selected organization connection and rejects an identity from a different organization', async () => {
  const http = require('node:http')
  const { DataXpertAnalyticsProvider } = require('../dist/lib/provider.js')
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'admin' }
  const xpertId = '11111111-1111-4111-8111-111111111111',
    workspaceId = '22222222-2222-4222-8222-222222222222'
  let identityOrg = actor.organizationId,
    discoveries = 0
  const server = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer scoped-token')
    assert.equal(req.headers['organization-id'], actor.organizationId)
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/assistant-management/ontology/effective') {
      res.end(
        JSON.stringify({
          sourceScope: 'organization',
          configured: true,
          tenantId: actor.tenantId,
          organizationId: identityOrg,
          xpertId,
          workspaceId
        })
      )
      return
    }
    assert.equal(req.url, '/api/agent-workbench/analytics/discover')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    assert.deepEqual(JSON.parse(Buffer.concat(chunks)).assistant, { code: xpertId, xpertId, workspaceId })
    discoveries++
    res.end(
      JSON.stringify({
        items: [
          {
            id: 'model',
            kind: 'collection',
            name: 'Business model',
            metadata: { adapterId: 'semantic_model', entityTypes: ['semantic_cube'] }
          }
        ]
      })
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const engine = new DataXpertAnalyticsClient({
      require: () => ({
        createScopedApi(current) {
          assert.deepEqual(current, actor)
          return {
            getToken: async ({ audience }) => {
              assert.equal(audience, 'data-xpert')
              return { token: 'scoped-token' }
            }
          }
        }
      })
    })
    const provider = new DataXpertAnalyticsProvider(engine, {
      execute() {
        assert.fail('model setup must use its bound connection')
      }
    })
    const ctx = {
      actor,
      integrationId: xpertId,
      deadlineAt: Date.now() + 5000,
      signal: AbortSignal.timeout(5000),
      readConnectionOptions: async () => ({
        baseUrl: 'http://127.0.0.1:' + server.address().port + '/api',
        audience: 'data-xpert'
      })
    }
    assert.deepEqual(await provider.modelSetup.models(ctx), [{ id: 'model', label: 'Business model' }])
    identityOrg = 'foreign-org'
    await assert.rejects(provider.modelSetup.models(ctx), /DATAX_ORGANIZATION_IDENTITY_UNAVAILABLE/)
    assert.equal(discoveries, 1)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('an organization with no built-in identity can use only its explicitly granted business reader', async (t) => {
  const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'admin' }
  const xpertId = '11111111-1111-4111-8111-111111111111'
  const workspaceId = '22222222-2222-4222-8222-222222222222'
  const reader = { code: 'analytics-reader-org', scopeType: 'organization', configured: true, allowed: true,
    enabled: true, tenantId: 'tenant', organizationId: 'org', resourceIds: ['model'], xpertId, workspaceId }
  const connection = { baseUrl: 'https://data.example/api', audience: 'data-xpert' }
  const client = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi: () => ({
    getToken: async () => ({ token: 'org-token' })
  }) }) })
  t.mock.method(global, 'fetch', async (url, init) => {
    assert.equal(init.headers['organization-id'], 'org')
    assert.equal(init.headers.Authorization, 'Bearer org-token')
    if (url.endsWith('/ontology/effective')) return Response.json({ configured: false, sourceScope: 'none' })
    assert.equal(url, 'https://data.example/api/assistant-management/effective/analytics-reader-org')
    return Response.json(reader)
  })
  const read = () => client.effectiveSetupIdentity(connection, actor, AbortSignal.timeout(2000))
  assert.deepEqual(await read(), { assistantCode: reader.code, assistantXpertId: xpertId, workspaceId })
  reader.allowed = false
  await assert.rejects(read, /IDENTITY_UNAVAILABLE/)
  reader.allowed = true
  reader.organizationId = 'another'
  await assert.rejects(read, /IDENTITY_UNAVAILABLE/)
})
