// Exercise built plugins and published SDK packages; only the HTTP source and host service are fixtures.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const datax = createRequire(new URL('../xpertai/tools/analytics-data-xpert/package.json', import.meta.url))
const dashboard = createRequire(new URL('../xpertai/apps/live-dashboard/package.json', import.meta.url))
const { DataXpertAnalyticsClient } = datax('./dist/lib/client.js')
const { DataXpertAnalyticsProvider } = datax('./dist/lib/provider.js')
const { DashboardMiddleware } = dashboard('./dist/lib/middleware.js')
const { normalizeAnalyticsResult, resolveAnalyticsParameters } = dashboard('@xpert-ai/plugin-sdk/analytics')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('DataXpert schema discovery feeds real dashboard tool validation and preview receipts', async t => {
  const actor = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3) }
  const source = { kind: 'definition', definitionId: uuid(4), versionId: uuid(5) }
  const requests = []
  let denied = false
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    requests.push(JSON.parse(Buffer.concat(chunks).toString()))
    assert.equal(request.url, '/api/agent-workbench/analytics/query')
    assert.equal(request.headers.authorization, 'Bearer fixture-viewer')
    assert.equal(request.headers['organization-id'], actor.organizationId)
    if (denied) { response.writeHead(403); response.end('denied'); return }
    response.end(JSON.stringify({ effect: { version: 2, kind: 'rows', columns: [
      { key: '/ACCOUNT', logicalType: 'string', role: 'dimension', nullable: false },
      { key: 'SignData', logicalType: 'decimal', role: 'measure', nullable: true }
    ], rows: [{ '/ACCOUNT': 'expense', SignData: '9007199254740993.123456789' }],
    summary: { returnedRowCount: 1, rowCount: 1, truncated: false } },
    fromCache: false, executionId: 'fixture-query', auditRef: 'fixture-audit', fetchedAt: '2026-11-03T00:00:00Z' }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  const client = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi(input) {
    assert.deepEqual(input, actor)
    return { getToken: async () => ({ token: 'fixture-viewer' }) }
  } }) })
  const provider = new DataXpertAnalyticsProvider(client, { execute: async () => ({ ...actor,
    options: { baseUrl: `http://127.0.0.1:${server.address().port}/api`, audience: 'fixture-datax' } }) })
  const context = { actor, source, options: { integrationId: uuid(6), assistantCode: 'fixture', assistantXpertId: uuid(7), workspaceId: uuid(8) },
    signal: new AbortController().signal, deadlineAt: Date.now() + 30000, maxRows: 100 }
  const service = {
    async discover(scope, input) {
      assert.equal(scope.userId, actor.userId); assert.deepEqual(input.source, source)
      return provider.discover(input.request, context)
    },
    async preview(scope, input) {
      assert.equal(scope.userId, actor.userId)
      const parameters = resolveAnalyticsParameters(input.binding, input.controls)
      return normalizeAnalyticsResult(input.binding, await provider.execute(input.binding, parameters, context), 'fixture-preview', 100)
    }
  }
  const middleware = new DashboardMiddleware(service).createMiddleware({}, { ...actor, xpertId: uuid(7) })
  const invoke = (name, input) => middleware.tools.find(tool => tool.name === name).invoke(input)
  const payload = { resourceId: 'fixture-resource', actionTypeCode: 'mdx.query_cube_slice',
    target: { entityTypeCode: 'semantic_cube', entityRef: 'fixture::cube' },
    params: { dimensions: ['ACCOUNT'], measures: ['SignData'], limit: 20 }, parameterPaths: {} }
  const discovered = JSON.parse(await invoke('dashboard_discover', { source, providerId: 'data-xpert.ontology',
    requestJson: JSON.stringify({ kind: 'query-schema', datasetId: 'expenses', payload }) }))
  const binding = { source, providerId: 'data-xpert.ontology', parameters: [], payloadJson: JSON.stringify(payload),
    output: discovered.items[0].metadata.output }
  assert.equal(discovered.previewId, undefined)
  const preview = JSON.parse(await invoke('dashboard_preview', { binding }))
  assert.ok(preview.previewId)
  assert.equal(preview.rows[0][binding.output.fields[1].id], '9007199254740993.123456789')
  assert.deepEqual(JSON.parse(preview.bindingJson).output, binding.output)
  assert.equal(JSON.parse(preview.bindingJson).operation, 'action')
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0], requests[1])
  denied = true
  await assert.rejects(invoke('dashboard_preview', { binding }), /DATAX_QUERY_HTTP_403/)
  console.log(`Verified SDK versions: DataXpert ${datax('@xpert-ai/plugin-sdk/package.json').version}; Live Dashboard ${dashboard('@xpert-ai/plugin-sdk/package.json').version}`)
})
