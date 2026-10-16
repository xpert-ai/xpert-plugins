const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')
const example = require('../examples/postgres-sales.json')
const context = { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
function draft() {
  const { id, schema, bindings, ...input } = structuredClone(example)
  const { id: bindingId, schemaVersion, operation, contractVersion, payload, parameters, ...binding } = bindings[0]
  return { input: { ...input, previewIds: ['missing'] }, binding: { ...binding, payloadJson: JSON.stringify(payload), parameters: parameters.map(({ controlId, ...p }) => p) } }
}
function setup(options = {}) {
  const calls = []; let denied = false
  const service = {
    async sources() { return [] },
    async discover(scope, input) { calls.push(['discover', scope, input]); return { items: [], queryContract: { operation: 'query', contractVersion: 1 } } },
    async preview(scope, input) { if (denied) throw new Error('REVOKED'); calls.push(['preview', scope, input]); return { rows: Array.from({ length: 25 }, (_, i) => ({ n: i })), completeness: { returnedRows: 25, truncated: false } } },
    async save(scope, manifest) { if (denied) throw new Error('REVOKED'); calls.push(['save', scope, manifest]); return { artifactId: 'saved', versionId: 'version' } }
  }
  const files = new Map()
  const runtimeContext = { ...context, runtime: { capabilities: { require: () => ({
    async writeRuntimeBuffer(input) { files.set(input.path, input.buffer) },
    async readRuntimeBuffer(path) { if (!files.has(path)) throw new Error('WORKSPACE_FILE_NOT_FOUND'); return { buffer: files.get(path) } }
  }) } } }
  const strategy = new DashboardMiddleware(service), middleware = strategy.createMiddleware(options, runtimeContext)
  const invoke = (name, input) => middleware.tools.find(t => t.name === name).invoke(input)
  return { middleware, calls, files, invoke, revoke: () => { denied = true }, another: () => strategy.createMiddleware({}, context) }
}
test('Agent saves only run-local preview receipts, canonical defaults and discovered operations', async () => {
  const s = setup(), { input, binding } = draft()
  await assert.rejects(s.invoke('dashboard_create', input), /PREVIEW_REQUIRED/)
  await assert.rejects(s.invoke('dashboard_preview', { binding }), /DISCOVER_REQUIRED/)
  await s.invoke('dashboard_discover', { dataSourceId: binding.dataSourceId, providerId: binding.providerId, requestJson: '{}' })
  const preview = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  assert.equal(preview.rows.length, 20); assert.equal(preview.preview.omittedRows, 5); assert.equal(preview.completeness.returnedRows, 25)
  input.previewIds = [preview.previewId]
  const executed = s.calls.find(c => c[0] === 'preview')[2]
  assert.equal(executed.binding.operation, 'query'); assert.equal(executed.binding.schemaVersion, 1)
  assert.deepEqual(JSON.parse(preview.bindingJson), executed.binding)
  assert.equal(executed.binding.parameters[0].controlId, binding.parameters[0].name)
  assert.deepEqual(executed.controls, { region: 'all' })
  const changed = structuredClone(input); changed.controls[0].defaultValue = 'west'
  await assert.rejects(s.invoke('dashboard_create', changed), /defaults disagree/)
  const result = await s.invoke('dashboard_create', input)
  assert.equal(JSON.parse(result).dashboard.artifactId, 'saved')
  assert.equal(JSON.parse(result).artifactId, undefined)
  assert.equal(await s.invoke('dashboard_create', input), result)
  const saves = s.calls.filter(c => c[0] === 'save')
  assert.equal(saves.length, 2); assert.equal(saves[0][2].id, saves[1][2].id)
  assert.equal(s.calls[0][1].userId, 'viewer')
  s.revoke(); await assert.rejects(s.invoke('dashboard_create', input), /REVOKED/)
  await assert.rejects(s.another().tools.find(t => t.name === 'dashboard_create').invoke(input), /PREVIEW_REQUIRED/)
})

test('Agent HTML workflow requires a real Workspace file and exact preview evidence', async () => {
  const s = setup(), { input, binding } = draft()
  const { charts, tables, ...definition } = input
  const args = { ...definition, path: 'dashboards/custom.html' }
  await assert.rejects(s.invoke('dashboard_create_html', args), /FILE_NOT_FOUND/)
  const html = '<html><body><main>Custom</main><script>window.xpertLiveArtifact.ready()</script></body></html>'
  await s.invoke('dashboard_write_html', { path: args.path, html })
  await assert.rejects(s.invoke('dashboard_create_html', args), /PREVIEW_REQUIRED/)
  await s.invoke('dashboard_discover', { dataSourceId: binding.dataSourceId, providerId: binding.providerId })
  args.previewIds = [JSON.parse(await s.invoke('dashboard_preview', { binding })).previewId]
  assert.equal(JSON.parse(await s.invoke('dashboard_create_html', args)).dashboard.artifactId, 'saved')
  const manifest = s.calls.filter(c => c[0] === 'save').at(-1)[2]
  assert.deepEqual(manifest.presentation, { type: 'html', html })
  assert.deepEqual(manifest.charts, []); assert.equal(manifest.bindings.length, 1)
  s.files.set(args.path, Buffer.from(html.replace('Custom', 'Another')))
  await s.invoke('dashboard_create_html', args)
  assert.notEqual(s.calls.filter(c => c[0] === 'save').at(-1)[2].id, manifest.id)
})
test('model JSON text boundary rejects non-objects and uses a bounded tool budget', async () => {
  const { parseObjectJson, agentBindingSchema, createToolSchema } = require('../dist/lib/agent.schema.js')
  for (const value of ['[]', 'null', 'invalid', '"text"']) assert.throws(() => parseObjectJson(value), /INVALID_JSON/)
  assert.deepEqual(parseObjectJson('{"kind":"inspect"}'), { kind: 'inspect' })
  assert.equal(agentBindingSchema.safeParse({ ...draft().binding, operation: 'invented' }).success, false)
  assert.equal(createToolSchema.safeParse({ ...draft().input, bindings: [] }).success, false)
  const s = setup()
  for (let i = 0; i < 24; i++) await s.middleware.wrapModelCall({ tools: ['available'] }, async r => assert.deepEqual(r.tools, ['available']))
  await s.middleware.wrapModelCall({ tools: ['available'] }, async r => {
    assert.deepEqual(r.tools, []); assert.match(JSON.stringify(r.systemMessage.content), /budget is exhausted/)
  })
})
test('registered canonical bindings use the same discovery and preview receipt gates', async () => {
  const s = setup(), { input } = draft(), binding = structuredClone(example.bindings[0])
  const args = { bindingJson: JSON.stringify(binding) }
  await assert.rejects(s.invoke('dashboard_preview_binding', args), /DISCOVER_REQUIRED/)
  await s.invoke('dashboard_discover', { dataSourceId: binding.dataSourceId, providerId: binding.providerId })
  const result = JSON.parse(await s.invoke('dashboard_preview_binding', args))
  assert.deepEqual(s.calls.find(c => c[0] === 'preview')[2].binding, binding)
  input.previewIds = [result.previewId]
  assert.equal(JSON.parse(await s.invoke('dashboard_create', { ...input, controls: JSON.stringify(input.controls),
    charts: JSON.stringify(input.charts), tables: JSON.stringify(input.tables), previewIds: JSON.stringify(input.previewIds) })).dashboard.artifactId, 'saved')
  s.revoke()
  await assert.rejects(s.invoke('dashboard_preview_binding', args), /REVOKED/)
})
test('Assistant final-provider policy allows upstream preview but rejects saving a substitute', async () => {
  const s = setup({ allowedFinalProviders: ['workspace_script.query'] }), { input } = draft()
  const upstream = structuredClone(example.bindings[0])
  await s.invoke('dashboard_discover', { dataSourceId: upstream.dataSourceId, providerId: upstream.providerId })
  const upstreamPreview = JSON.parse(await s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(upstream) }))
  await assert.rejects(s.invoke('dashboard_create', { ...input, previewIds: [upstreamPreview.previewId] }), /PROVIDER_REQUIRED/)
  assert.equal(s.calls.filter(c => c[0] === 'save').length, 0)
  const script = { ...upstream, providerId: 'workspace_script.query' }
  await s.invoke('dashboard_discover', { dataSourceId: script.dataSourceId, providerId: script.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(script) }))
  assert.equal(JSON.parse(await s.invoke('dashboard_create', { ...input, previewIds: [preview.previewId] })).dashboard.artifactId, 'saved')
})
test('failed preview gives no save evidence; guidance preserves existing system content', async () => {
  const s = setup(), { input, binding } = draft()
  await s.invoke('dashboard_discover', { dataSourceId: binding.dataSourceId, providerId: binding.providerId })
  s.revoke(); await assert.rejects(s.invoke('dashboard_preview', { binding }), /REVOKED/)
  await assert.rejects(s.invoke('dashboard_create', input), /PREVIEW_REQUIRED/)
  let content
  await s.middleware.wrapModelCall({ systemMessage: { content: 'Existing system instructions' } }, async r => { content = r.systemMessage.content })
  assert.match(JSON.stringify(content), /Existing system instructions/); assert.match(JSON.stringify(content), /Never invent fields/)
})
