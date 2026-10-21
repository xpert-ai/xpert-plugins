const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { HtmlDashboardValidation } = require('../dist/lib/html-validation.js')
const sdk = require('@xpert-ai/plugin-sdk')
const example = require('../examples/postgres-sales.json')
const context = { tenantId: 'tenant', organizationId: 'org', userId: 'owner' }
const manifest = { ...example, charts: [], tables: [], presentation: { type: 'html', html: '<html><body>Test</body></html>' } }
function setup(report) {
  const calls = [], removed = [], data = Buffer.from(JSON.stringify(report)); let content
  const files = { uploadBuffer: async input => { content = JSON.parse(input.buffer); return { filePath: 'private-input', workspacePath: '/workspace/private-input' } },
    readBuffer: async () => ({ buffer: data }), deleteFile: async ref => { if (removed.includes(ref.filePath)) throw Object.assign(new Error('File not found'), { code: 'ENOENT' }); removed.push(ref.filePath) } }
  const jobs = { getActionHealth: async () => ({ available: true }), cancel: async () => {}, run: async input => { calls.push(input); return { outputs: [{ path: 'report.json', reference: { filePath: 'private-report' }, sha256: createHash('sha256').update(data).digest('hex') }] } } }
  const records = new Map(), redis = { set: async (key, value) => records.set(key, value), get: async key => records.get(key), del: async (...keys) => keys.forEach(key => records.delete(key)) }
  const queue = { getRedis: async () => redis, getExecutionPoolHealth: async () => ({ available: true }), cancel: async () => {},
    enqueue: async input => { assert.deepEqual(Object.keys(input.payload), ['validationId']); assert.equal(input.executionPool, 'sandbox-browser'); await validation.handle({ data: input.payload }, input); return { jobId: input.jobId } },
    getJob: async () => ({ state: 'completed' }) }
  const validation = new HtmlDashboardValidation({ require: key => key === sdk.WorkspaceFilesRuntimeCapability ? files : jobs }, queue)
  return { validation, calls, removed, content: () => content }
}
test('HTML validation uses isolated job with real datasets and removes temporary data', async () => {
  const s = setup({ ok: true, errors: [], requestedBindings: ['sales'], renderedTextLength: 100 })
  const dataset = { datasetId: manifest.bindings[0].output.datasetId, rows: [{ amount: 120 }] }
  const result = await s.validation.validate(context, manifest, [dataset])
  assert.equal(result.status, 'passed'); assert.equal(s.calls[0].action, 'live_dashboard.validate-html')
  assert.equal(s.calls[0].scope.userId, 'owner'); assert.equal(s.calls[0].files[0].reference.catalog, 'users')
  assert.deepEqual(s.content().datasets[manifest.bindings[0].id], dataset)
  assert.deepEqual(s.content().parameters[manifest.bindings[0].id], manifest.bindings[0].parameters)
  assert.deepEqual([...new Set(s.removed)], ['private-report', 'private-input'])
})
test('HTML runtime errors return actionable failure and clean up without saving', async () => {
  const s = setup({ ok: false, errors: ['DOCUMENT_BINDING_DENIED'], requestedBindings: [], renderedTextLength: 20 })
  await assert.rejects(s.validation.validate(context, manifest, []), /PREFLIGHT_FAILED.*BINDING_DENIED/)
  assert.deepEqual([...new Set(s.removed)], ['private-report', 'private-input'])
})
test('standard Data Analytics dashboards do not require Browser Runtime', async () => {
  const s = setup({}); assert.equal(await s.validation.validate(context, example, []), null); assert.equal(s.calls.length, 0)
})
