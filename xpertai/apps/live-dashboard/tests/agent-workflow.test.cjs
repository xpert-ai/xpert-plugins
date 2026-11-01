const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')
const example = require('../examples/postgres-sales.json')
const context = { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'viewer' }
function draft() {
  const { id, schema, bindings, ...input } = structuredClone(example)
  const { id: bindingId, operation, contractVersion, payload, parameters, ...binding } = bindings[0]
  return { input: { ...input, previewIds: ['missing'] }, binding: { ...binding, payloadJson: JSON.stringify(payload), parameters: parameters.map(({ controlId, ...p }) => p) } }
}
function setup(options) {
  const calls = []; let denied = false
  const saved = { artifactId: randomUUID(), versionId: randomUUID(), versionNumber: 1, manifest: structuredClone(example) }
  const service = {
    async list() { return [{ artifactId: saved.artifactId, versionId: saved.versionId, title: saved.manifest.title }] },
    async open(scope, artifactId, versionId) { if (denied) throw new Error('REVOKED'); if (artifactId !== saved.artifactId || versionId && versionId !== saved.versionId) throw new Error('ACCESS_DENIED'); calls.push(['open', scope, artifactId, versionId]); return structuredClone(saved) },
    async history(scope, artifactId) { await this.open(scope, artifactId); return [{ artifactId, versionId: saved.versionId, versionNumber: 1 }] },
    async update(scope, artifactId, versionId, changes) { await this.open(scope, artifactId); calls.push(['update', scope, artifactId, versionId, changes]); return { artifactId, draftRevision: 1, status: "draft", title: changes.title ?? saved.manifest.title } },
    async sources() { return [] },
    async discover(scope, input) { if (denied) throw new Error('REVOKED'); calls.push(['discover', scope, input]); return { items: [], queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {} } } },
    async preview(scope, input) { if (denied) throw new Error('REVOKED'); calls.push(['preview', scope, input]); return { rows: Array.from({ length: 25 }, (_, i) => ({ n: i })), completeness: { returnedRows: 25, truncated: false } } },
    async save(scope, manifest) { if (denied) throw new Error('REVOKED'); calls.push(['save', scope, manifest]); return { artifactId: 'saved', draftRevision: 1, status: 'draft', title: manifest.title } }
  }
  const files = new Map()
  const runtimeContext = { ...context, runtime: { capabilities: { require: () => ({
    async writeRuntimeBuffer(input) { files.set(input.path, input.buffer) },
    async readRuntimeBuffer(path) { if (!files.has(path)) throw new Error('WORKSPACE_FILE_NOT_FOUND'); return { buffer: files.get(path) } }
  }) } } }
  const strategy = new DashboardMiddleware(service), middleware = strategy.createMiddleware(options, runtimeContext)
  const invoke = (name, input, config) => middleware.tools.find(t => t.name === name).invoke(input, config)
  return { middleware, service, calls, files, saved, invoke, revoke: () => { denied = true }, another: () => strategy.createMiddleware({}, context) }
}
for (const [label, options] of [
  ['omitted options from a legacy host', undefined],
  ['explicit empty options', {}],
  ['valid provider policy', { allowedFinalProviders: ['workspace_script.query'] }]
]) {
  test(`middleware initializes and discovers sources with ${label}`, async () => {
    const s = setup(options)
    let calls = 0
    s.service.sources = async () => { calls++; return [] }
    await s.invoke('dashboard_list_sources', {})
    assert.equal(calls, 1)
  })
}

for (const [label, options, code, path] of [
  ['null', null, 'invalid_type', []],
  ['string', '', 'invalid_type', []],
  ['boolean', false, 'invalid_type', []],
  ['number', 0, 'invalid_type', []],
  ['array', [], 'invalid_type', []],
  ['null provider list', { allowedFinalProviders: null }, 'invalid_type', ['allowedFinalProviders']],
  ['non-array provider list', { allowedFinalProviders: 'workspace_script.query' }, 'invalid_type', ['allowedFinalProviders']],
  ['empty provider list', { allowedFinalProviders: [] }, 'too_small', ['allowedFinalProviders']],
  ['empty provider ID', { allowedFinalProviders: [''] }, 'too_small', ['allowedFinalProviders', 0]],
  ['non-string provider ID', { allowedFinalProviders: [42] }, 'invalid_type', ['allowedFinalProviders', 0]],
  ['oversized provider list', { allowedFinalProviders: Array(21).fill('workspace_script.query') }, 'too_big', ['allowedFinalProviders']],
  ['unknown option', { unexpected: true }, 'unrecognized_keys', []]
]) {
  test(`middleware rejects ${label} instead of applying defaults`, () => {
    assert.throws(() => setup(options), error => {
      assert.equal(error.name, 'ZodError')
      assert.equal(error.issues[0].code, code)
      assert.deepEqual(error.issues[0].path, path)
      return true
    })
  })
}

test('Agent saves only run-local preview receipts, canonical defaults and discovered operations', async () => {
  const s = setup(), { input, binding } = draft()
  await assert.rejects(s.invoke('dashboard_create', input), /PREVIEW_REQUIRED/)
  const preview = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  assert.deepEqual(s.calls.map(call => call[0]), ['discover', 'preview'])
  assert.deepEqual(s.calls[0][2], { source: binding.source, providerId: binding.providerId, request: {} })
  assert.equal(preview.rows.length, 20); assert.equal(preview.preview.omittedRows, 5); assert.equal(preview.completeness.returnedRows, 25)
  input.previewIds = [preview.previewId]
  const executed = s.calls.find(c => c[0] === 'preview')[2]
  assert.equal(executed.binding.operation, 'query'); assert.deepEqual(executed.binding.source, binding.source)
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
  s.files.set(args.path, Buffer.from(html))
  await assert.rejects(s.invoke('dashboard_create_html', args), /PREVIEW_REQUIRED/)
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  args.previewIds = [JSON.parse(await s.invoke('dashboard_preview', { binding })).previewId]
  assert.equal(JSON.parse(await s.invoke('dashboard_create_html', args)).dashboard.artifactId, 'saved')
  const manifest = s.calls.filter(c => c[0] === 'save').at(-1)[2]
  assert.deepEqual(manifest.presentation, { type: 'html', html })
  assert.deepEqual(manifest.charts, []); assert.equal(manifest.bindings.length, 1)
  s.files.set(args.path, Buffer.from(html.replace('Custom', 'Another')))
  await assert.rejects(s.invoke('dashboard_create_html', args), /ALREADY_CREATED/)
  assert.equal(s.calls.filter(c => c[0] === 'save').length, 1)
  await s.invoke('dashboard_create_html', { ...args, title: 'A distinct dashboard' })
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
test('registered canonical bindings automatically discover contracts and retain preview receipt gates', async () => {
  const s = setup(), { input } = draft(), binding = structuredClone(example.bindings[0])
  const args = { bindingJson: JSON.stringify(binding) }
  const result = JSON.parse(await s.invoke('dashboard_preview_binding', args))
  assert.deepEqual(s.calls.map(call => call[0]), ['discover', 'preview'])
  assert.deepEqual(s.calls.find(c => c[0] === 'preview')[2].binding, binding)
  input.previewIds = [result.previewId]
  assert.equal(JSON.parse(await s.invoke('dashboard_create', { ...input, controls: JSON.stringify(input.controls),
    charts: JSON.stringify(input.charts), tables: JSON.stringify(input.tables), previewIds: JSON.stringify(input.previewIds) })).dashboard.artifactId, 'saved')
  s.revoke()
  await assert.rejects(s.invoke('dashboard_preview_binding', args), /REVOKED/)
})

test('preview contracts reuse explicit discovery and stay scoped to source, provider and run', async () => {
  const s = setup(), { binding } = draft()
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId, requestJson: '{"kind":"inspect"}' })
  const first = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  await s.invoke('dashboard_preview_binding', { bindingJson: first.bindingJson })
  assert.equal(s.calls.filter(call => call[0] === 'discover').length, 1)
  await s.invoke('dashboard_preview', { binding: { ...binding, providerId: 'other.query' } })
  await s.invoke('dashboard_preview', { binding: { ...binding, source: { kind: 'data-source', dataSourceId: randomUUID() } } })
  await s.another().tools.find(tool => tool.name === 'dashboard_preview').invoke({ binding })
  assert.equal(s.calls.filter(call => call[0] === 'discover').length, 4)
  assert.equal(s.calls.filter(call => call[0] === 'preview').length, 5)
})

test('concurrent preview tools share automatic discovery but execute each query', async () => {
  const s = setup(), { binding } = draft(), discover = s.service.discover
  let release, started
  const waiting = new Promise(resolve => { release = resolve })
  const entered = new Promise(resolve => { started = resolve })
  s.service.discover = async (...args) => { started(); await waiting; return discover(...args) }
  const previews = Promise.all([
    s.invoke('dashboard_preview', { binding }),
    s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(example.bindings[0]) })
  ])
  await entered
  release()
  await previews
  assert.equal(s.calls.filter(call => call[0] === 'discover').length, 1)
  assert.equal(s.calls.filter(call => call[0] === 'preview').length, 2)
})

for (const name of ['dashboard_preview', 'dashboard_preview_binding']) {
  const args = () => name === 'dashboard_preview' ? { binding: draft().binding } : { bindingJson: JSON.stringify(example.bindings[0]) }
  test(`${name} propagates discovery failure without querying or caching failure`, async () => {
    const s = setup(), discover = s.service.discover
    let attempts = 0
    s.service.discover = async (...args) => {
      if (++attempts === 1) throw new Error('ANALYTICS_ACCESS_DENIED')
      return discover(...args)
    }
    await assert.rejects(s.invoke(name, args()), /ANALYTICS_ACCESS_DENIED/)
    assert.equal(s.calls.length, 0)
    await s.invoke(name, args())
    assert.equal(attempts, 2)
    assert.deepEqual(s.calls.map(call => call[0]), ['discover', 'preview'])
  })

  test(`${name} respects listed source/provider pairs even with a cached contract`, async () => {
    const s = setup(), { binding } = draft()
    s.service.sources = async () => [{ source: binding.source, providers: [{ id: 'different.provider' }] }]
    await s.invoke('dashboard_list_sources', {})
    await assert.rejects(s.invoke(name, args()), /SOURCE_SELECTION_INVALID/)
    assert.equal(s.calls.length, 0)
    s.service.sources = async () => [{ source: binding.source, providers: [{ id: binding.providerId }] }]
    await s.invoke('dashboard_list_sources', {})
    await s.invoke(name, args())
    s.service.sources = async () => []
    await s.invoke('dashboard_list_sources', {})
    await assert.rejects(s.invoke(name, args()), /SOURCE_SELECTION_INVALID/)
    assert.deepEqual(s.calls.map(call => call[0]), ['discover', 'preview'])
  })

  test(`${name} validates the automatically discovered payload schema before executing`, async () => {
    const s = setup()
    s.service.discover = async () => ({ items: [], queryContract: { operation: 'query', contractVersion: 1,
      payloadSchema: { type: 'object', required: ['contractHash'] } } })
    await assert.rejects(s.invoke(name, args()), /ANALYTICS_PAYLOAD_INVALID: \/ \(required\)/)
    assert.equal(s.calls.filter(call => call[0] === 'preview').length, 0)
  })
}

test('library discovery includes the current preview Binding IDs and exact page lifecycle', async () => {
  const s = setup(), { binding } = draft()
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  const result = JSON.parse(await s.invoke('dashboard_libraries', {}))
  assert.deepEqual(result.pageRuntime.bindingIds, [JSON.parse(preview.bindingJson).id])
  assert.match(result.pageRuntime.refresh, /requires a Binding ID/)
  assert.equal(result.pageRuntime.global, 'window.xpertLiveArtifact')
  assert.deepEqual(JSON.parse(await s.another().tools.find(t => t.name === 'dashboard_libraries').invoke({})).pageRuntime.bindingIds, [])
})

test('mistyped source/provider pairs receive exact listed choices without querying or guessing', async () => {
  const s = setup(), { binding } = draft()
  const other = { source: { kind: 'data-source', dataSourceId: randomUUID() }, name: 'Other source', providers: [{ id: 'other.query' }] }
  s.service.sources = async () => [{ source: binding.source, name: 'Exact source', providers: [{ id: binding.providerId }] }, other]
  await s.invoke('dashboard_list_sources', {})
  for (const wrong of [{ source: { kind: 'data-source', dataSourceId: randomUUID() }, providerId: binding.providerId }, { source: binding.source, providerId: 'invented' },
    { source: binding.source, providerId: other.providers[0].id }, { source: other.source, providerId: binding.providerId }])
    await assert.rejects(s.invoke('dashboard_discover', wrong), error => /SOURCE_SELECTION_INVALID/.test(error.message) &&
      error.message.includes(binding.source.dataSourceId) && error.message.includes(binding.providerId) && /Refresh the list/.test(error.message))
  assert.equal(s.calls.length, 0)
  const request = { kind: 'inspect', datasetId: 'sales' }
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId, requestJson: JSON.stringify(request) })
  assert.deepEqual(s.calls, [['discover', { tenantId: context.tenantId, organizationId: context.organizationId,
    userId: context.userId, hostType: 'agent', hostId: context.xpertId, slots: [] },
    { source: binding.source, providerId: binding.providerId, request }]])
})

test('source selection follows refreshed lists including empty results and stays local to each run', async () => {
  const s = setup(), { binding } = draft()
  const first = { source: binding.source, providerId: binding.providerId }
  const next = { source: { kind: 'data-source', dataSourceId: randomUUID() }, providerId: 'other.query' }
  let sources = [{ source: first.source, providers: [{ id: first.providerId }] }]
  s.service.sources = async () => sources
  await s.invoke('dashboard_list_sources', {})
  await assert.rejects(s.invoke('dashboard_discover', next), /SOURCE_SELECTION_INVALID/)
  sources = [{ source: next.source, providers: [{ id: next.providerId }] }]
  await s.invoke('dashboard_list_sources', {})
  await assert.rejects(s.invoke('dashboard_discover', first), /SOURCE_SELECTION_INVALID/)
  await s.invoke('dashboard_discover', next)
  sources = []
  await s.invoke('dashboard_list_sources', {})
  await assert.rejects(s.invoke('dashboard_discover', next), /SOURCE_SELECTION_INVALID/)
  // A new run can still delegate an explicit selection to the host before listing sources.
  await s.another().tools.find(t => t.name === 'dashboard_discover').invoke(first)
  assert.deepEqual(s.calls.map(call => call[2].source), [next.source, first.source])
  await assert.rejects(s.invoke('dashboard_discover', first), /SOURCE_SELECTION_INVALID/)
})

test('listed source selections still require current host access and denied discovery creates no preview evidence', async () => {
  const s = setup(), { binding } = draft()
  s.service.sources = async () => [{ source: binding.source, providers: [{ id: binding.providerId }] }]
  await s.invoke('dashboard_list_sources', {})
  s.revoke()
  await assert.rejects(s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId }), /REVOKED/)
  await assert.rejects(s.invoke('dashboard_preview', { binding }), /REVOKED/)
  assert.equal(s.calls.length, 0)
})
test('Assistant final-provider policy allows upstream preview but rejects saving a substitute', async () => {
  const s = setup({ allowedFinalProviders: ['workspace_script.query'] }), { input } = draft()
  const upstream = structuredClone(example.bindings[0])
  await s.invoke('dashboard_discover', { source: upstream.source, providerId: upstream.providerId })
  const upstreamPreview = JSON.parse(await s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(upstream) }))
  await assert.rejects(s.invoke('dashboard_create', { ...input, previewIds: [upstreamPreview.previewId] }), /PROVIDER_REQUIRED/)
  assert.equal(s.calls.filter(c => c[0] === 'save').length, 0)
  const script = { ...upstream, providerId: 'workspace_script.query' }
  await s.invoke('dashboard_discover', { source: script.source, providerId: script.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(script) }))
  assert.equal(JSON.parse(await s.invoke('dashboard_create', { ...input, previewIds: [preview.previewId] })).dashboard.artifactId, 'saved')
})
test('failed preview gives no save evidence; guidance preserves existing system content', async () => {
  const s = setup(), { input, binding } = draft()
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  s.revoke(); await assert.rejects(s.invoke('dashboard_preview', { binding }), /REVOKED/)
  await assert.rejects(s.invoke('dashboard_create', input), /PREVIEW_REQUIRED/)
  let content
  await s.middleware.wrapModelCall({ systemMessage: { content: 'Existing system instructions' } }, async r => { content = r.systemMessage.content })
  assert.match(JSON.stringify(content), /Existing system instructions/); assert.match(JSON.stringify(content), /Do not invent business data/)
})

test('nullable dimension filters cannot save until real non-default rows pass explicit expectations', async () => {
  const s = setup(), { input, binding } = draft()
  binding.parameters[0].required = false; binding.parameters[0].defaultValue = null; binding.parameters[0].allowedValues = ['east', 'west']
  input.controls[0].defaultValue = null; input.controls[0].allowedValues = [null, 'east', 'west']
  const rows = [{ region: 'east', amount: 10 }, { region: 'west', amount: 20 }]
  s.service.preview = async () => ({ rows, completeness: { returnedRows: 2, truncated: false } })
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  input.previewIds = [preview.previewId]
  const check = { previewId: preview.previewId, controls: { region: 'east' }, expectations: [{ fieldId: 'region', oneOf: ['east'] }] }
  await assert.rejects(s.invoke('dashboard_create', input), /FILTER_TEST_REQUIRED/)
  await assert.rejects(s.invoke('dashboard_test_filter', check), /FILTER_TEST_FAILED/)
  await assert.rejects(s.invoke('dashboard_create', input), /FILTER_TEST_REQUIRED/)
  assert.equal(s.calls.filter(c => c[0] === 'save').length, 0)
  s.service.preview = async () => ({ rows: [], completeness: { truncated: false } })
  await assert.rejects(s.invoke('dashboard_test_filter', check), /INCONCLUSIVE/)
  s.service.preview = async () => ({ rows: [rows[0]], completeness: { returnedRows: 1, truncated: false } })
  assert.equal(JSON.parse(await s.invoke('dashboard_test_filter', { ...check, controls: JSON.stringify(check.controls), expectations: JSON.stringify(check.expectations) })).passed, true)
  await s.invoke('dashboard_create', input)
  await assert.rejects(s.invoke('dashboard_test_filter', { ...check, previewId: 'invented' }), /PREVIEW_REQUIRED/)
  await assert.rejects(s.invoke('dashboard_test_filter', { ...check, controls: { injected: 'east' } }), /UNKNOWN_CONTROL/)
  const changed = { ...binding, payloadJson: '{"sql":"SELECT changed"}' }
  const changedPreview = JSON.parse(await s.invoke('dashboard_preview', { binding: changed }))
  await assert.rejects(s.invoke('dashboard_create', { ...input, previewIds: [changedPreview.previewId] }), /FILTER_TEST_REQUIRED/)
})

test('editing reads the selected immutable version, preserves bindings and returns the same Artifact', async () => {
  const s = setup(), html = '<html><body>' + 'a'.repeat(17000) + '</body></html>'
  const dependencies = [{ id: 'echarts', version: '5.5.0', format: 'classic-script', global: 'echarts', sha256: 'a'.repeat(64) }]
  s.saved.manifest = { ...s.saved.manifest, charts: [], tables: [], presentation: { type: 'html', html, dependencies } }
  assert.equal(JSON.parse(await s.invoke('dashboard_open', {})).status, 'selection_required')
  const selected = { schemaVersion: 1, artifactId: s.saved.artifactId, versionId: s.saved.versionId }
  const opened = JSON.parse(await s.invoke('dashboard_open', {}, { context: { executionId: 'current-execution' }, configurable: { context: { live_dashboard: selected } } }))
  assert.equal(opened.versionId, selected.versionId)
  assert.equal(opened.presentation.html, undefined)
  assert.deepEqual(opened.presentation.dependencies, dependencies)
  const first = JSON.parse(await s.invoke('dashboard_read_html', { editId: opened.editId }))
  const rest = JSON.parse(await s.invoke('dashboard_read_html', { editId: opened.editId, offset: first.nextOffset }))
  assert.equal(first.html + rest.html, html); assert.equal(rest.nextOffset, null)
  s.files.set(opened.htmlPath, Buffer.from(html.replace('body>', 'body class="light">')))
  const receipt = JSON.parse(await s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, htmlPath: opened.htmlPath, title: 'Changed style' })).dashboard
  assert.equal(receipt.artifactId, selected.artifactId); assert.equal(receipt.draftRevision, 1)
  const call = s.calls.find(c => c[0] === 'update')
  assert.equal(call[2], selected.artifactId); assert.equal(call[3], 0)
  assert.deepEqual(call[4].bindings, example.bindings); assert.equal(call[4].id, undefined)
  assert.deepEqual(call[4].presentation.dependencies, dependencies)
  assert.equal(s.calls.filter(c => c[0] === 'save').length, 0)
  assert.equal(JSON.parse(await s.invoke('dashboard_history', { artifactId: selected.artifactId })).versions.length, 1)
  assert.equal(JSON.parse(await s.another().tools.find(t => t.name === 'dashboard_update').invoke({ editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: 'Other run' })).dashboard.artifactId, selected.artifactId)
  s.revoke()
  await assert.rejects(s.invoke('dashboard_read_html', { editId: opened.editId }), /REVOKED/)
  await assert.rejects(s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: 'Denied' }), /REVOKED/)
})

test('library discovery returns pins only and explicit edits select the packaged version', async () => {
  const s = setup()
  const catalog = JSON.parse(await s.invoke('dashboard_libraries', {}))
  assert.equal(JSON.stringify(catalog).includes('"source"'), false)
  const opened = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  s.files.set('dashboards/library.html', Buffer.from('<html><body>Library</body></html>'))
  await s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title, htmlPath: 'dashboards/library.html', libraries: ['echarts'], removals: { viewIds: [...s.saved.manifest.charts, ...s.saved.manifest.tables].map(item => item.id) } })
  const dependencies = s.calls.find(c => c[0] === 'update')[4].presentation.dependencies
  assert.equal(dependencies.length, 1)
  assert.equal(dependencies[0].id, 'echarts')
  assert.equal(dependencies[0].version, '5.6.0')
  assert.match(dependencies[0].sha256, /^[a-f0-9]{64}$/)
  await assert.rejects(s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title, libraries: ['https://untrusted.invalid/script.js'] }))
})

test('data updates require fresh complete preview receipts and never accept identity or raw bindings', async () => {
  const s = setup(), opened = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  await assert.rejects(s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title, previewIds: ['invented'] }), /PREVIEW_REQUIRED/)
  const { updateToolSchema } = require('../dist/lib/editing.js')
  for (const extras of [{ id: randomUUID() }, { artifactId: randomUUID() }, { versionId: randomUUID() }, { bindings: example.bindings }, { expectedVersionId: randomUUID() }])
    assert.equal(updateToolSchema.safeParse({ editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title, ...extras }).success, false)
  const changed = { ...structuredClone(example.bindings[0]), payload: { sql: 'SELECT region, amount FROM changed' } }
  await s.invoke('dashboard_discover', { source: changed.source, providerId: changed.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(changed) }))
  await s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title, previewIds: JSON.stringify([preview.previewId]) })
  assert.deepEqual(s.calls.find(c => c[0] === 'update')[4].bindings, [changed])
  const restricted = setup({ allowedFinalProviders: ['workspace_script.query'] })
  const edit = JSON.parse(await restricted.invoke('dashboard_open', { artifactId: restricted.saved.artifactId }))
  await assert.rejects(restricted.invoke('dashboard_update', { editId: edit.editId, expectedRevision: edit.expectedRevision, expectedCurrentVersionId: edit.expectedCurrentVersionId, title: 'Style' }), /PROVIDER_REQUIRED/)
})

test('sandbox mutations require a receipt for the same file and exact bytes', async () => {
  const { ToolMessage } = require('@langchain/core/messages')
  const { workspaceFileMutationMetadata } = require('@xpert-ai/plugin-sdk')
  const { createHash } = require('node:crypto')
  const s = setup(); s.saved.manifest.charts = []; s.saved.manifest.tables = []; s.saved.manifest.presentation = { type: 'html', html: '<html><body>Initial</body></html>' }
  const opened = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  const call = (name, args, content, status = 'success', metadata) => s.middleware.wrapToolCall({ toolCall: { name, args, id: 'call' }, tool: { metadata } },
    async () => {
      if (metadata) s.files.set(args.file_path, Buffer.concat([s.files.get(args.file_path), Buffer.from(' ')]))
      return new ToolMessage({ content, name, tool_call_id: 'call', status })
    })
  const path = opened.htmlPath
  s.files.set(path, Buffer.from('<html><body>Changed</body></html>'))
  await call('sandbox_edit_file', { file_path: path }, '{}', 'success', workspaceFileMutationMetadata)
  const pending = async expected => s.middleware.wrapModelCall({ tools: [] }, async request => assert.equal(request.toolChoice, expected ? 'required' : undefined))
  await pending(true)
  await call('dashboard_update', {}, 'DRAFT_CONFLICT', 'error'); await pending(true)
  const output = { dashboard: { artifactId: s.saved.artifactId, draftRevision: 3, status: 'draft' },
    sourceFile: { path, sha256: createHash('sha256').update(s.files.get(path)).digest('hex') } }
  await call('dashboard_update', {}, JSON.stringify({ ...output, dashboard: { ...output.dashboard, artifactId: randomUUID() } })); await pending(true)
  await call('dashboard_update', {}, JSON.stringify({ ...output, sourceFile: { ...output.sourceFile, path: 'unrelated.html' } })); await pending(true)
  await call('dashboard_update', {}, JSON.stringify({ ...output, sourceFile: { ...output.sourceFile, sha256: '0'.repeat(64) } })); await pending(true)
  await call('dashboard_update', {}, JSON.stringify(output)); await pending(false)
  await call('sandbox_append_file', { file_path: path }, '{}', 'success', workspaceFileMutationMetadata)
  await assert.rejects(s.middleware.wrapModelCall({ tools: [] }, async () => ({ tool_calls: [] })), /SAVE_NOT_CONFIRMED/)
})

test('opening prepares independent copies and only explicit update saves the draft', async () => {
  const s = setup(); const html = '<html><body>Saved page</body></html>'
  s.saved.manifest.charts = []; s.saved.manifest.tables = []; s.saved.manifest.presentation = { type: 'html', html }
  const first = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  assert.equal(s.files.get(first.htmlPath).toString(), html)
  s.files.set(first.htmlPath, Buffer.from(html.replace('Saved', 'Unsaved')))
  const second = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  assert.notEqual(first.htmlPath, second.htmlPath)
  assert.equal(s.files.get(first.htmlPath).toString(), html.replace('Saved', 'Unsaved'))
  assert.equal(s.files.get(second.htmlPath).toString(), html)
  assert.equal(s.calls.filter(c => c[0] === 'update').length, 0)
  const history = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId, versionId: s.saved.versionId }))
  assert.equal(history.htmlPath, undefined)
  assert.equal(s.middleware.tools.some(t => t.name === 'dashboard_write_html'), false)
  const receipt = JSON.parse(await s.invoke('dashboard_update', { editId: first.editId, expectedRevision: first.expectedRevision,
    expectedCurrentVersionId: first.expectedCurrentVersionId, htmlPath: first.htmlPath, title: 'Saved changes' }))
  assert.equal(receipt.dashboard.artifactId, s.saved.artifactId)
  assert.equal(receipt.sourceFile.path, first.htmlPath)
  assert.match(receipt.sourceFile.sha256, /^[a-f0-9]{64}$/)
})

test('a concurrent file edit remains pending after an earlier save receipt', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  const { createHash } = require('node:crypto')
  const path = 'dashboards/current.html', artifactId = randomUUID(), buffer = Buffer.from('saved bytes')
  let releaseRead
  const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: () => new Promise(resolve => { releaseRead = () => resolve({ buffer }) }) }))
  evidence.opened(path, artifactId); evidence.write(path)
  const receipt = { dashboard: { artifactId, status: 'draft', draftRevision: 2 }, sourceFile: { path, sha256: createHash('sha256').update(buffer).digest('hex') } }
  const saving = evidence.accept(evidence.beginSave(), JSON.stringify(receipt))
  evidence.write(path); releaseRead(); await saving
  assert.equal(evidence.pending, true)
  assert.deepEqual(evidence.pendingPaths, [path])
  const resaving = evidence.accept(evidence.beginSave(), JSON.stringify(receipt))
  releaseRead(); await resaving
  assert.equal(evidence.pending, false)
})

test('refused file writes do not require saves; real, earlier and concurrent changes remain pending', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  let buffer = Buffer.from('existing')
  const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async () => ({ buffer }) }))
  const path = 'dashboards/existing.html'
  const refused = { status: 'success', content: JSON.stringify({ error: 'already exists' }) }
  assert.equal(await evidence.trackWrite(path, async () => refused), refused)
  assert.equal(evidence.pending, false)
  await assert.rejects(evidence.trackWrite(path, async () => { throw new Error('refused') }), /refused/)
  assert.equal(evidence.pending, false)
  await evidence.trackWrite(path, async () => { buffer = Buffer.from('changed') })
  assert.equal(evidence.pending, true)
  await evidence.trackWrite(path, async () => refused)
  assert.equal(evidence.pending, true)
  await evidence.trackWrite(path, async () => { evidence.write(path); return refused })
  assert.equal(evidence.pending, true)
  const partial = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async () => ({ buffer }) }))
  await assert.rejects(partial.trackWrite(path, async () => { buffer = Buffer.from('partial change'); throw new Error('failed after write') }), /failed after write/)
  assert.equal(partial.pending, true)
})

test('a receipt during a write never confirms later bytes, including a partial failed write', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  const { createHash } = require('node:crypto')
  for (const fails of [false, true]) {
    let buffer = Buffer.from('saved bytes')
    const path = 'dashboards/current.html', artifactId = randomUUID()
    const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async () => ({ buffer }) }))
    const receipt = () => ({ dashboard: { artifactId, status: 'draft', draftRevision: 2 },
      sourceFile: { path, sha256: createHash('sha256').update(buffer).digest('hex') } })
    evidence.opened(path, artifactId)
    const writing = evidence.trackWrite(path, async () => {
      await evidence.accept(evidence.beginSave(), receipt())
      assert.equal(evidence.pending, true)
      buffer = Buffer.from('later unsaved bytes')
      if (fails) throw new Error('failed after write')
    })
    if (fails) await assert.rejects(writing, /failed after write/)
    else await writing
    assert.equal(evidence.pending, true)
    assert.deepEqual(evidence.pendingPaths, [path])
    await evidence.accept(evidence.beginSave(), receipt())
    assert.equal(evidence.pending, false)
  }
})

test('finishing one overlapping writer does not let a receipt confirm an unfinished writer', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  const { createHash } = require('node:crypto')
  let buffer = Buffer.from('initial'), release, started
  const gate = new Promise(resolve => { release = resolve })
  const ready = new Promise(resolve => { started = resolve })
  const path = 'dashboards/current.html', artifactId = randomUUID()
  const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async () => ({ buffer }) }))
  const receipt = () => ({ dashboard: { artifactId, status: 'draft', draftRevision: 2 },
    sourceFile: { path, sha256: createHash('sha256').update(buffer).digest('hex') } })
  evidence.opened(path, artifactId)
  const writing = evidence.trackWrite(path, async () => { started(); await gate; buffer = Buffer.from('last write') })
  await ready
  try {
    await evidence.trackWrite(path, async () => { buffer = Buffer.from('first completed write') })
    await evidence.accept(evidence.beginSave(), receipt())
    assert.equal(evidence.pending, true)
  } finally { release(); await writing }
  assert.equal(evidence.pending, true)
  await evidence.accept(evidence.beginSave(), receipt())
  assert.equal(evidence.pending, false)
})

test('HTML paths reject nameless, ambiguous and escaping paths before writing or saving', () => {
  const { htmlPathSchema } = require('../dist/lib/agent.schema.js')
  for (const path of ['  .html', '.html', 'dashboards/.html', '/workspace/page.html', '../page.html', 'a/../page.html', 'a//page.html', 'page.html '])
    assert.equal(htmlPathSchema.safeParse(path).success, false, path)
  for (const path of ['dashboards/sales.html', 'dashboards/销售.html']) assert.equal(htmlPathSchema.parse(path), path)
})

test('Agent saves require explicit control defaults before browser preflight', () => {
  const { createHtmlToolSchema } = require('../dist/lib/agent.schema.js')
  const base = { title: 'Sales', path: 'dashboards/sales.html', previewIds: ['verified'],
    controls: [{ controlId: 'region', type: 'string', label: 'Region' }] }
  const invalid = createHtmlToolSchema.safeParse(base)
  assert.equal(invalid.success, false)
  assert.ok(invalid.error.issues.some(issue => issue.path.includes('controls')))
  assert.equal(createHtmlToolSchema.safeParse({ ...base, controls: [{ ...base.controls[0], defaultValue: null }] }).success, true)
})


test('repeated creation retries advance the cached draft revision for the same Artifact', async () => {
  const s = setup(), { input, binding } = draft(), artifactId = randomUUID(), expectations = []
  s.service.save = async (_scope, _manifest, expectedVersionId, expectedRevision = 0) => {
    expectations.push({ expectedVersionId, expectedRevision })
    assert.equal(expectedRevision, expectations.length - 1)
    return { artifactId, draftRevision: expectations.length, baseVersionId: null, status: 'draft' }
  }
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  input.previewIds = [JSON.parse(await s.invoke('dashboard_preview', { binding })).previewId]
  for (let revision = 1; revision <= 3; revision++) {
    const result = JSON.parse(await s.invoke('dashboard_create', input)).dashboard
    assert.equal(result.artifactId, artifactId); assert.equal(result.draftRevision, revision)
  }
  assert.deepEqual(expectations.map(item => item.expectedVersionId), [null, null, null])
})

test('Agent discovers frontend pins and saves only explicitly requested libraries', async () => {
  const s = setup(), { input, binding } = draft()
  const catalog = JSON.parse(await s.invoke('dashboard_libraries', {}))
  assert.deepEqual(catalog.libraries.map(item => item.id), ['echarts', 'three'])
  assert(catalog.libraries.every(item => !Object.hasOwn(item, 'source')))
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  const { charts, tables, ...definition } = input
  const path = 'dashboards/chart.html'
  s.files.set(path, Buffer.from('<html><body>Chart</body></html>'))
  const args = { ...definition, previewIds: [preview.previewId], path, libraries: ['echarts'] }
  await s.invoke('dashboard_create_html', args)
  const manifest = s.calls.filter(call => call[0] === 'save').at(-1)[2]
  assert.deepEqual(manifest.presentation.dependencies, [catalog.libraries[0]])
  await assert.rejects(s.invoke('dashboard_create_html', { ...args, libraries: ['https://cdn.example/echarts.js'] }))
  await assert.rejects(s.invoke('dashboard_create_html', { ...args, libraries: ['echarts', 'echarts'] }))
  assert.equal(s.calls.filter(call => call[0] === 'save').length, 1)
})

test('create, HTML create, open and update emit only authorized committed cards via the active tool callbacks', async () => {
  const s = setup(), cards = [], config = { callbacks: [{ name: 'card-capture', handleCustomEvent(_name, data) { if (data.type === 'resource_card') cards.push(data) } }] }
  const { input, binding } = draft()
  await assert.rejects(s.invoke('dashboard_create', input, config), /PREVIEW_REQUIRED/)
  assert.equal(cards.length, 0)
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  input.previewIds = [JSON.parse(await s.invoke('dashboard_preview', { binding })).previewId]
  await s.invoke('dashboard_create', input, config)
  assert.equal(cards.length, 1); assert.equal(cards[0].data.title, input.title)
  await s.invoke('dashboard_create', input, config)
  assert.equal(cards.length, 2); assert.equal(cards[0].id, cards[1].id)
  const { charts, tables, ...definition } = input
  s.files.set('dashboards/card.html', Buffer.from('<html><body>Card</body></html>'))
  await s.invoke('dashboard_create_html', { ...definition, title: 'HTML card', path: 'dashboards/card.html' }, config)
  assert.equal(cards.at(-1).data.title, 'HTML card')
  const opened = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }, config))
  assert.equal(cards.at(-1).data.open.selectionId, s.saved.artifactId)
  await s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: 'Updated card' }, config)
  assert.equal(cards.at(-1).data.title, 'Updated card'); assert.match(cards.at(-1).data.description, /Draft r1/)
  assert.equal(cards.at(-1).id, cards.at(-2).id)
  const count = cards.length
  s.revoke()
  await assert.rejects(s.invoke('dashboard_open', { artifactId: s.saved.artifactId }, config), /REVOKED/)
  await assert.rejects(s.invoke('dashboard_create', input, config), /REVOKED/)
  await assert.rejects(s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: 0, expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title }, config), /REVOKED/)
  assert.equal(cards.length, count)
})

test('standard dashboard edits explain definition-only saves and missing HTML paths cannot emit successful cards', async () => {
  const s = setup()
  const opened = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  assert.equal(opened.presentation.type, 'standard')
  assert.equal(opened.htmlPath, undefined)
  assert.match(opened.next, /rename requires only title/)
  await assert.rejects(s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: 0,
    expectedCurrentVersionId: opened.expectedCurrentVersionId, title: s.saved.manifest.title, htmlPath: 'dashboards/invented.html' }), /standard dashboard.*omit htmlPath and libraries/)
  assert.equal(s.calls.filter(c => c[0] === 'update').length, 0)
})

test('a saved replacement only abandons explicitly named unsaved creation candidates', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  const { createHash } = require('node:crypto')
  const paths = ['dashboards/first.html', 'dashboards/second.html', 'dashboards/final.html', 'dashboards/other.html']
  const buffers = new Map(paths.map(path => [path, Buffer.from(path)]))
  const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async path => ({ buffer: buffers.get(path) }) }))
  paths.forEach(path => evidence.write(path))
  const output = { dashboard: { artifactId: randomUUID(), status: 'draft', draftRevision: 1 },
    sourceFile: { path: paths[2], sha256: createHash('sha256').update(buffers.get(paths[2])).digest('hex') } }
  const failed = evidence.beginSave(paths.slice(0, 2))
  await evidence.accept(failed, 'PREFLIGHT_FAILED')
  assert.deepEqual(evidence.pendingPaths, paths)
  await evidence.accept(evidence.beginSave(paths.slice(0, 2)), output)
  assert.deepEqual(evidence.pendingPaths, [paths[3]], 'unrelated candidates are still pending')
  evidence.write(paths[2])
  assert.throws(() => evidence.beginSave([paths[2]]), /SUPERSEDE_INVALID/, 'a saved Artifact file is never an abandonable candidate')
  assert.throws(() => evidence.beginSave(['untracked.html']), /SUPERSEDE_INVALID/)
})

test('replacement receipts cannot abandon changed, active or opened Artifact files', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  const { createHash } = require('node:crypto')
  const old = 'dashboards/candidate.html', current = 'dashboards/final.html', opened = 'dashboards/opened.html'
  const buffer = Buffer.from('bytes')
  const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async () => ({ buffer }) }))
  evidence.write(old); evidence.write(current); evidence.opened(opened, randomUUID()); evidence.write(opened)
  assert.throws(() => evidence.beginSave([opened]), /SUPERSEDE_INVALID/)
  const receipt = { dashboard: { artifactId: randomUUID(), status: 'draft', draftRevision: 1 }, sourceFile: { path: current, sha256: createHash('sha256').update(buffer).digest('hex') } }
  const snapshot = evidence.beginSave([old]); evidence.write(old)
  await evidence.accept(snapshot, receipt)
  assert.deepEqual(evidence.pendingPaths, [old, opened])
  await evidence.trackWrite(old, async () => {
    assert.throws(() => evidence.beginSave([old]), /SUPERSEDE_INVALID/)
  })
})

test('replacement requires a matching source digest before any candidate can be abandoned', async () => {
  const { dashboardSaveEvidence } = require('../dist/lib/save-evidence.js')
  const old = 'dashboards/candidate.html', current = 'dashboards/final.html'
  const evidence = dashboardSaveEvidence(() => ({ readRuntimeBuffer: async () => ({ buffer: Buffer.from('new bytes') }) }))
  evidence.write(old); evidence.write(current)
  await evidence.accept(evidence.beginSave([old]), { dashboard: { artifactId: randomUUID(), status: 'draft', draftRevision: 1 }, sourceFile: { path: current, sha256: '0'.repeat(64) } })
  assert.deepEqual(evidence.pendingPaths, [old, current])
})

test('HTML creation forwards explicit candidate replacements to the save guard without weakening unrelated edits', async () => {
  const { ToolMessage } = require('@langchain/core/messages')
  const { workspaceFileMutationMetadata } = require('@xpert-ai/plugin-sdk')
  const s = setup(), { input, binding } = draft(), artifactId = randomUUID()
  s.service.save = async (_, manifest) => { s.calls.push(['save', manifest]); return { artifactId, status: 'draft', draftRevision: 1, title: manifest.title } }
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  const preview = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  const paths = ['dashboards/old.html', 'dashboards/final.html']
  for (const path of paths) await s.middleware.wrapToolCall({ toolCall: { name: 'sandbox_write_file', args: { file_path: path }, id: path }, tool: { metadata: workspaceFileMutationMetadata } }, async () => {
    s.files.set(path, Buffer.from('<html><body>' + path + '</body></html>'))
    return new ToolMessage({ content: '{}', tool_call_id: path })
  })
  const args = { title: 'Replacement', path: paths[1], supersedesPaths: [paths[0]], previewIds: [preview.previewId], controls: input.controls }
  await assert.rejects(s.invoke('dashboard_create_html', { ...args, supersedesPaths: [paths[1]] }), /SUPERSEDE_INVALID/)
  assert.equal(s.calls.filter(c => c[0] === 'save').length, 0)
  const saved = await s.middleware.wrapToolCall({ toolCall: { name: 'dashboard_create_html', args, id: 'save' } }, async () => new ToolMessage({ tool_call_id: 'save', content: await s.invoke('dashboard_create_html', args) }))
  assert.equal(JSON.parse(saved.update?.messages?.[0]?.content ?? saved.content).dashboard.artifactId, artifactId)
  const manifest = s.calls.find(c => c[0] === 'save')[1]
  assert.equal(manifest.presentation.html, s.files.get(paths[1]).toString())
  assert.equal(manifest.supersedesPaths, undefined)
  await s.middleware.wrapModelCall({ tools: [] }, async request => { assert.equal(request.toolChoice, undefined); return { tool_calls: [] } })
  assert.equal(s.files.size, 2, 'abandoned candidates remain files, not additional saved dashboards')
})

test('switching to standard charts can explicitly abandon an HTML prototype using the same saved Artifact', async () => {
  const { ToolMessage } = require('@langchain/core/messages')
  const { workspaceFileMutationMetadata } = require('@xpert-ai/plugin-sdk')
  const s = setup(), { input, binding } = draft(), artifactId = randomUUID(), path = 'dashboards/prototype.html'
  s.service.save = async (_, manifest) => { s.calls.push(['save', manifest]); return { artifactId, draftRevision: 1, status: 'draft', title: manifest.title } }
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  input.previewIds = [JSON.parse(await s.invoke('dashboard_preview', { binding })).previewId]
  await s.middleware.wrapToolCall({ toolCall: { name: 'sandbox_write_file', args: { file_path: path }, id: 'write' }, tool: { metadata: workspaceFileMutationMetadata } }, async () => {
    s.files.set(path, Buffer.from('<html><body>Unused prototype</body></html>'))
    return new ToolMessage({ content: '{}', tool_call_id: 'write' })
  })
  const save = args => s.middleware.wrapToolCall({ toolCall: { name: 'dashboard_create', args, id: 'save' } }, async () => new ToolMessage({ tool_call_id: 'save', content: await s.invoke('dashboard_create', args) }))
  const first = await save(input)
  await s.middleware.wrapModelCall({ tools: [] }, async r => { assert.equal(r.toolChoice, 'required') })
  const final = await save({ ...input, supersedesPaths: [path] })
  assert.equal(JSON.parse(first.update?.messages?.[0]?.content ?? first.content).dashboard.artifactId, JSON.parse(final.update?.messages?.[0]?.content ?? final.content).dashboard.artifactId)
  await s.middleware.wrapModelCall({ tools: [] }, async r => { assert.equal(r.toolChoice, undefined); return { tool_calls: [] } })
  assert(s.files.has(path)); assert(s.calls.filter(c => c[0] === 'save').every(c => !c[1].presentation && !c[1].supersedesPaths))
})

test('preview surfaces actionable checks before authoring; checks still require real execution', async () => {
  const s = setup(), { input, binding } = draft()
  binding.parameters[0].defaultValue = null; binding.parameters[0].required = false; binding.parameters[0].allowedValues = ['east', 'west']
  input.controls[0].defaultValue = null; input.controls[0].allowedValues = [null, 'east', 'west']
  s.service.preview = async (_, query) => ({ rows: [{ region: query.controls.region ?? 'east' }], completeness: { truncated: false } })
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  const p = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  assert.equal(p.validation.status, 'filter_tests_required')
  const call = p.validation.checks[0].suggestedCall
  assert.deepEqual(call.arguments.controls, { region: 'east' })
  input.previewIds = [p.previewId]
  await assert.rejects(s.invoke('dashboard_create', input), /FILTER_TEST_REQUIRED/)
  const verified = JSON.parse(await s.invoke(call.tool, call.arguments))
  assert.deepEqual(verified.remainingControls, [])
  assert.equal(JSON.parse(await s.invoke('dashboard_preview', { binding })).validation.status, 'filter_tests_complete')
  await s.invoke('dashboard_create', input)
  // Editing a Binding changes its receipt; prior checks must not carry over.
  binding.payloadJson = JSON.stringify({ sql: 'SELECT changed' })
  const changed = JSON.parse(await s.invoke('dashboard_preview', { binding }))
  assert.equal(changed.validation.status, 'filter_tests_required')
})
test('an HTML edit receipt explicitly identifies an existing file and saves title with HTML', async () => {
  const s = setup()
  s.saved.manifest.charts = []; s.saved.manifest.tables = []; s.saved.manifest.presentation = { type: 'html', html: '<html><body>Old</body></html>' }
  const opened = JSON.parse(await s.invoke('dashboard_open', { artifactId: s.saved.artifactId }))
  assert.equal(opened.saveArguments.title, s.saved.manifest.title)
  assert.equal(opened.saveArguments.expectedCurrentVersionId, opened.expectedCurrentVersionId)
  await assert.rejects(s.invoke('dashboard_update', { ...opened.saveArguments, expectedCurrentVersionId: 'None' }), /JSON null/)
  assert.deepEqual(opened.editingFile, { path: opened.htmlPath, exists: true, hasUnsavedChanges: false, writeMode: 'edit_existing',
    read: { tool: 'sandbox_read_file', arguments: { file_path: opened.htmlPath } } })
  const { title, ...withoutTitle } = opened.saveArguments
  await assert.rejects(s.invoke('dashboard_update', withoutTitle), /title/)
  assert.equal(s.calls.filter(call => call[0] === 'update').length, 0)
  s.files.set(opened.htmlPath, Buffer.from('<html><body>New</body></html>'))
  const result = JSON.parse(await s.invoke('dashboard_update', { editId: opened.editId, expectedRevision: opened.expectedRevision,
    expectedCurrentVersionId: opened.expectedCurrentVersionId, title: 'New title', htmlPath: opened.htmlPath }))
  assert.equal(result.dashboard.title, 'New title')
  const updates = s.calls.filter(call => call[0] === 'update')
  assert.equal(updates.length, 1)
  assert.equal(updates[0][4].presentation.html, '<html><body>New</body></html>')
  assert.deepEqual(updates[0][4].bindings, s.saved.manifest.bindings)
})

test('invalid provider payloads fail with field feedback before executing previews', async () => {
  const s = setup(), { binding } = draft()
  s.service.discover = async () => ({ items: [], queryContract: { operation: 'query', contractVersion: 1,
    payloadSchema: { type: 'object', properties: { contractHash: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['contractHash'] } } })
  await s.invoke('dashboard_discover', { source: binding.source, providerId: binding.providerId })
  binding.payloadJson = JSON.stringify({ contractHash: 'missing-characters' })
  await assert.rejects(s.invoke('dashboard_preview', { binding }), /\/contractHash \(pattern\)/)
  assert.equal(s.calls.filter(call => call[0] === 'preview').length, 0)
  binding.payloadJson = JSON.stringify({ contractHash: 'a'.repeat(64) })
  await s.invoke('dashboard_preview', { binding })
  assert.equal(s.calls.filter(call => call[0] === 'preview').length, 1)
})

for (const source of [{ kind: 'definition', definitionId: randomUUID(), versionId: randomUUID() }, { kind: 'artifact', artifactId: randomUUID(), versionId: randomUUID() }]) {
  test(`historical ${source.kind} versions remain discoverable without reusing another version's preview contract`, async () => {
    const s = setup(), { binding } = draft(); binding.source = source
    const latest = { ...source, versionId: randomUUID() }
    s.service.sources = async () => [{ source: latest, providers: [{ id: binding.providerId }] }]
    await s.invoke('dashboard_list_sources', {})
    await s.invoke('dashboard_discover', { source, providerId: binding.providerId })
    assert.deepEqual(s.calls.at(-1)[2].source, source)
    await s.invoke('dashboard_preview', { binding })
    await s.invoke('dashboard_preview', { binding: { ...binding, source: latest } })
    assert.deepEqual(s.calls.filter(call => call[0] === 'discover').map(call => call[2].source), [source, latest])
    s.revoke(); await assert.rejects(s.invoke('dashboard_discover', { source, providerId: binding.providerId }), /REVOKED/)
  })
}
