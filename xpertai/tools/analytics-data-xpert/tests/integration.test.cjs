require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DataXpertAnalyticsProvider } = require('../dist/lib/provider')
const { connectionSchema, DATA_XPERT_INTEGRATION } = require('../dist/lib/integration')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const actor = { tenantId: uuid(1), organizationId: uuid(2), userId: uuid(3) }
const options = { integrationId: uuid(4), assistantCode: 'sales', assistantXpertId: uuid(5), workspaceId: uuid(6) }
function fixture() {
  const state = { connection: { tenantId: actor.tenantId, organizationId: actor.organizationId, options: { baseUrl: 'https://analytics.example.test/api', audience: 'data-xpert' } }, calls: [], query: null }
  const provider = new DataXpertAnalyticsProvider({ discover: async (_, context) => { state.calls.push(context); return { items: [] } }, execute: async (_, parameters, context) => { state.calls.push({ context, parameters }); return { rows: [] } } }, { execute: async query => { state.query = query; return state.connection } })
  return { state, provider, context: { actor, source: { kind: 'definition', definitionId: uuid(7), versionId: uuid(8) }, options, signal: new AbortController().signal } }
}
test('configuration stores only Integration identity and target while connections resolve in actor scope', async () => {
  const f = fixture()
  assert.deepEqual(await f.provider.validateConfiguration(options, actor), options)
  assert.deepEqual(f.provider.descriptor.sourceKinds, ['definition']); assert.equal(f.provider.descriptor.dataSourceTypes, undefined)
  await f.provider.discover({}, f.context)
  assert.deepEqual(f.state.calls[0].actor, actor); assert.deepEqual(f.state.calls[0].source, f.context.source)
  assert.equal(f.state.calls[0].options.baseUrl, f.state.connection.options.baseUrl)
  assert.equal(f.state.calls[0].options.integrationId, undefined)
  assert.ok(JSON.stringify(f.state.query).includes(DATA_XPERT_INTEGRATION))
  await assert.rejects(f.provider.validateConfiguration({ ...options, baseUrl: 'https://override.example.test' }, actor))
})
test('denies missing/cross-scope connections and rechecks after executing as the current viewer', async () => {
  const f = fixture()
  f.state.connection.tenantId = 'other'; await assert.rejects(f.provider.discover({}, f.context), /UNAVAILABLE/)
  f.state.connection.tenantId = actor.tenantId; f.state.connection.organizationId = 'other'; await assert.rejects(f.provider.discover({}, f.context), /UNAVAILABLE/)
  f.state.connection.organizationId = actor.organizationId
  const revoked = new DataXpertAnalyticsProvider({ discover: async () => { f.state.connection = null; return { items: [] } } }, { execute: async () => f.state.connection })
  await assert.rejects(revoked.discover({}, f.context), /UNAVAILABLE/)
})
test('rejects embedded credentials and URL parameters in the governed Integration', () => {
  for (const baseUrl of ['file:///etc/passwd', 'https://user:secret@example.test', 'https://example.test?token=secret', 'https://example.test#fragment']) assert.equal(connectionSchema.safeParse({ baseUrl, audience: 'data-xpert' }).success, false)
})
test('Agent creates ontology definitions from integration and current Assistant without internal configuration input', async () => {
  const f = fixture(), context = { actor, xpertId: uuid(5), workspaceId: uuid(6), connection: { kind: 'integration', integrationId: uuid(4) }, signal: f.context.signal, deadlineAt: Date.now() + 10000 }
  const result = await f.provider.authoring.prepare({}, context)
  assert.deepEqual(result, { integrationId: uuid(4), assistantCode: uuid(5), assistantXpertId: uuid(5), workspaceId: uuid(6) })
  assert.deepEqual(f.state.calls[0].actor, actor)
  assert(!JSON.stringify(result).includes('baseUrl'))
  await assert.rejects(f.provider.authoring.prepare({ assistantCode: 'other' }, context))
  f.state.connection = null
  await assert.rejects(f.provider.authoring.prepare({}, context), /UNAVAILABLE/)
})
