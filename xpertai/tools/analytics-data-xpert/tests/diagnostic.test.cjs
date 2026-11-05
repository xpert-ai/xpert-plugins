const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DataXpertAnalyticsClient } = require('../dist/lib/client.js')
const { AnalyticsProviderError } = require('@xpert-ai/plugin-sdk')
const { readAnalyticsHttpError } = require('../dist/lib/diagnostic.js')

const diagnostic = { schema: 'xpert.analytics.diagnostic', version: 1, code: 'FILTER_OPERATOR_INVALID', stage: 'validation', retryable: false,
  message: 'Filter operator is invalid at filters.0.op. Inspect the action schema.', upstreamExecutionId: 'source-run', auditRef: 'audit-run' }
const context = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }, signal: new AbortController().signal, maxRows: 10,
  options: { baseUrl: 'https://analytics.example/api', audience: 'analytics', assistantCode: 'assistant',
    assistantXpertId: '11111111-1111-4111-8111-111111111111', workspaceId: '22222222-2222-4222-8222-222222222222' } }
test('discovery and execution carry the validated SDK provider diagnostic', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(diagnostic), { status: 400, headers: { 'content-type': 'application/json' } }))
  const client = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi: () => ({ getToken: async () => ({ token: 'private-viewer-token' }) }) }) })
  for (const call of [() => client.discover({}, context), () => client.execute({ id: 'b', payload: {
    resourceId: 'r', actionTypeCode: 'mdx.query_cube_slice', target: { entityId: 'e' }, params: {} } }, {}, context)]) {
    await assert.rejects(call(), error => {
      assert.ok(error instanceof AnalyticsProviderError)
      assert.deepEqual(error.diagnostic, diagnostic)
      assert.doesNotMatch(error.message, /private/)
      return true
    })
  }
})
test('malformed, sensitive, oversized and non-JSON responses retain status-only fallback', async t => {
  const client = new DataXpertAnalyticsClient({ require: () => ({ createScopedApi: () => ({ getToken: async () => ({ token: 'private' }) }) }) })
  const cases = ['{', 'x'.repeat(16385), JSON.stringify({ ...diagnostic, message: 'password=private' }),
    JSON.stringify({ ...diagnostic, rawBody: 'private' }), JSON.stringify({ ...diagnostic, version: 99 })]
  let body
  t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 400, headers: { 'content-type': 'application/json' } }))
  for (body of cases) await assert.rejects(client.discover({}, context), error => error.message === 'DATAX_QUERY_HTTP_400')
})
test('unfinished JSON error streams are cancelled within the remaining deadline', async () => {
  let cancelled = false
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) }, cancel() { cancelled = true } }),
    { status: 400, headers: { 'content-type': 'application/json' } })
  assert.equal(await readAnalyticsHttpError(response, context.signal, Date.now() + 20), undefined)
  assert.equal(cancelled, true)
})
