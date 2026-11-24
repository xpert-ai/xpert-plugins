const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { AIMessage, HumanMessage, ToolMessage } = require('@langchain/core/messages')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')
const { editingSession } = require('../dist/lib/editing-session.js')
const { upsertComponents, assertHtmlPreserved } = require('../dist/lib/editing-patch.js')
const example = require('../examples/postgres-sales.json')
const scope = { projectId: 'project', tenantId: 'tenant', organizationId: 'org', userId: 'owner', xpertId: 'assistant', conversationId: 'conversation', threadId: 'branch' }

test('a delivered draft informs the next model call and repeated reads leave other work available', async () => {
  const middleware = new DashboardMiddleware({ maxBindings: 8 }).createMiddleware({}, scope)
  const artifactId = randomUUID()
  const tool = (name, value) => new ToolMessage({ name, content: JSON.stringify(value), tool_call_id: randomUUID() })
  const saved = tool('dashboard_create', { dashboard: { artifactId, draftRevision: 1, status: 'draft' }, resourceCard: { status: 'emitted' } })
  const read = (id = artifactId) => tool('dashboard_open', { artifactId: id, state: 'draft', expectedRevision: 1 })
  const tools = [{ name: 'dashboard_open' }, { name: 'dashboard_update' }, { name: 'another_capability' }]
  const openCall = args => ({ name: 'dashboard_open', args, id: 'open', type: 'tool_call' })
  const invoke = async (messages, calls, content = '') => {
    const response = new AIMessage({ content, tool_calls: calls, usage_metadata: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } })
    let captured
    const result = await middleware.wrapModelCall({ messages, tools }, async request => { captured = request; return response })
    assert.deepEqual(captured.tools, tools)
    return { result, prompt: JSON.stringify(captured.systemMessage.content) }
  }
  const calls = [openCall({ artifactId })]
  assert.match((await invoke([saved], calls)).prompt, /card has already been delivered/)
  const checked = await invoke([saved, read()], calls, [{ type: 'text', text: '已保存' }])
  assert.deepEqual(checked.result.tool_calls, [])
  assert.equal(checked.result.content, '已保存')
  assert.equal(checked.result.usage_metadata.total_tokens, 6)
  assert.match((await invoke([saved, read()], calls)).result.content, /Draft r1/)
  for (const messages of [[saved], [saved, read(randomUUID())], [saved, read(), tool('another_capability', {})],
    [saved, tool('dashboard_open', { artifactId, state: 'draft', expectedRevision: 2 })],
    [saved, read(), new HumanMessage('inspect again')]]) {
    assert.deepEqual((await invoke(messages, calls)).result.tool_calls, calls)
  }
  for (const distinct of [[openCall({ artifactId: randomUUID() })], [openCall({ artifactId, versionId: randomUUID() })],
    [...calls, { name: 'another_capability', args: {}, id: 'other', type: 'tool_call' }]]) {
    assert.deepEqual((await invoke([saved, read()], distinct)).result.tool_calls, distinct)
  }
  assert.doesNotMatch((await invoke([saved, new HumanMessage('next task')], [])).prompt, /card has already been delivered/)
})

test('checkpoint target restores only in the same authorized conversation; explicit selection and New win', () => {
  const a = { schemaVersion: 1, artifactId: randomUUID(), draftRevision: 2 }, b = { schemaVersion: 1, artifactId: randomUUID() }
  const state = editingSession(scope).select(a)
  const reopened = editingSession(scope)
  assert.deepEqual(reopened.restore(state, {}).dashboardEditing.target, a)
  assert.deepEqual(reopened.restore(state, { live_dashboard: b }).dashboardEditing.target, b)
  for (const clear of [null, { schemaVersion: 1, mode: 'new' }]) assert.equal(reopened.restore(state, { live_dashboard: clear }).dashboardEditing.target, null)
  for (const key of ['tenantId', 'organizationId', 'userId', 'xpertId', 'conversationId', 'threadId'])
    assert.equal(editingSession({ ...scope, [key]: 'other' }).restore(state, {}).dashboardEditing.target, null)
})

test('a server-only next turn restores the successful save target and refuses replacement creation', async () => {
  const id = randomUUID(), manifest = structuredClone(example)
  const calls = []
  const service = {
    open: async (_, selected) => { calls.push(selected); if (selected !== id) throw new Error('DENIED'); return { artifactId: id, manifest, draftRevision: 3, isDraft: true } },
    discover: async () => ({ queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {} } }),
    preview: async () => ({ rows: [], completeness: { truncated: false } }),
    save: async () => { throw new Error('MUST_NOT_CREATE') }
  }
  const first = new DashboardMiddleware(service).createMiddleware({}, scope)
  const command = await first.wrapToolCall({ toolCall: { name: 'dashboard_update', args: {}, id: 'save' } },
    async () => new ToolMessage({ tool_call_id: 'save', content: JSON.stringify({ dashboard: { artifactId: id, draftRevision: 3, status: 'draft' } }) }))
  assert.equal(command.update.dashboardEditing.target.artifactId, id)
  const next = new DashboardMiddleware(service).createMiddleware({}, scope)
  next.beforeAgent(command.update, { context: {} })
  const invoke = (name, args) => next.tools.find(tool => tool.name === name).invoke(args)
  const opened = JSON.parse(await invoke('dashboard_open', {}))
  assert.equal(opened.artifactId, id); assert.equal(opened.expectedRevision, 3)
  const preview = JSON.parse(await invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(manifest.bindings[0]) }))
  const { schema, id: ignored, bindings, ...definition } = manifest
  await assert.rejects(invoke('dashboard_create', { ...definition, previewIds: [preview.previewId] }), /EDIT_TARGET_ACTIVE/)
  await assert.rejects(invoke('dashboard_create', { ...definition, previewIds: [preview.previewId], creationIntent: 'new' }), /MUST_NOT_CREATE/)
  assert.deepEqual(calls, [id])
})

test('component patches retain unrelated views and bindings and require named removals', () => {
  const original = [{ id: 'orders', payload: 'unchanged' }, { id: 'suppliers', payload: 'old' }]
  assert.deepEqual(upsertComponents(original, [{ id: 'suppliers', payload: 'new' }], item => item.id), [original[0], { id: 'suppliers', payload: 'new' }])
  assert.deepEqual(upsertComponents(original, [], item => item.id), original)
  assert.deepEqual(upsertComponents(original, [], item => item.id, ['suppliers']), [original[0]])
  assert.throws(() => upsertComponents(original, [{ id: 'orders' }], item => item.id, ['orders']), /REMOVAL_INVALID/)
  assert.throws(() => upsertComponents(original, [{ id: 'x' }, { id: 'x' }], item => item.id), /DUPLICATE/)
})

test('a successful save supersedes the initial request selection within the same run', () => {
  const session = editingSession(scope), old = { schemaVersion: 1, artifactId: randomUUID() }, next = { schemaVersion: 1, artifactId: randomUUID() }
  session.restore({}, { live_dashboard: old })
  session.select(next)
  assert.deepEqual(session.resolve({ context: { live_dashboard: old } }), next)
  assert.deepEqual(session.resolve({ context: { live_dashboard: { schemaVersion: 1, mode: 'new' } } }), next)
  assert.throws(() => session.restore(session.select(next), { live_dashboard: { artifactId: 'broken' } }), /SELECTION_INVALID/)
})

test('HTML source edits retain unrelated component IDs, including template contents', () => {
  const original = { type: 'html', html: '<main id="orders"><div id="chart"></div><template><span id="detail"></span></template></main>' }
  assert.doesNotThrow(() => assertHtmlPreserved(original, { ...original, html: original.html.replace('<main', '<main class="compact"') }))
  const changed = { type: 'html', html: '<main id="orders"></main>' }
  assert.throws(() => assertHtmlPreserved(original, changed), /chart.*detail/)
  assert.doesNotThrow(() => assertHtmlPreserved(original, changed, ['chart', 'detail']))
})

test('platform runtime keeps execution scope separate from UI selection and New overrides a checkpoint', async () => {
  const a = { schemaVersion: 1, artifactId: randomUUID() }, b = { schemaVersion: 1, artifactId: randomUUID() }
  const checkpoint = editingSession(scope).select(a)
  const opened = []
  const service = { open: async (_, artifactId) => { opened.push(artifactId); return {
    artifactId, manifest: structuredClone(example), draftRevision: 6, isDraft: true
  } } }
  const middleware = new DashboardMiddleware(service).createMiddleware({}, scope)
  // The host passes its execution context at the top level, and the request context under configurable.
  const runtime = selection => ({ context: { executionId: 'execution' }, configurable: { context: { live_dashboard: selection } } })
  const state = middleware.beforeAgent(checkpoint, runtime(b))
  assert.deepEqual(state.dashboardEditing.target, b)
  const open = () => middleware.tools.find(tool => tool.name === 'dashboard_open').invoke({})
  assert.equal(JSON.parse(await open()).artifactId, b.artifactId)
  assert.deepEqual(opened, [b.artifactId])
  middleware.beforeAgent(state, runtime({ schemaVersion: 1, mode: 'new' }))
  assert.equal(JSON.parse(await open()).status, 'selection_required')
  assert.throws(() => middleware.beforeAgent(state, runtime({ artifactId: 'invalid' })), /SELECTION_INVALID/)
})


test('missing selection returns localized normal feedback without reads, writes or checkpoint changes', async () => {
  const calls = []
  const service = Object.fromEntries(['open', 'history', 'list', 'save', 'update'].map(name => [name, async () => { calls.push(name); throw Error('MUST_NOT_RUN') }]))
  const middleware = new DashboardMiddleware(service).createMiddleware({}, scope)
  const checkpoint = editingSession(scope).select({ schemaVersion: 1, artifactId: randomUUID() })
  const state = middleware.beforeAgent(checkpoint, { context: {}, configurable: { context: { live_dashboard: { schemaVersion: 1, mode: 'new' } } } })
  for (const [language, expected] of [['zh-Hans', '请先选择要编辑的看板'], ['zh_CN', '请先选择要编辑的看板'], ['zh-TW', '請先選擇要編輯的看板'], ['en-US', 'Please select a dashboard to edit first.']]) {
    for (const name of ['dashboard_open', 'dashboard_history']) {
      const request = { toolCall: { type: 'tool_call', name, args: {}, id: name } }
      const tool = middleware.tools.find(tool => tool.name === name)
      const result = await middleware.wrapToolCall(request, () => tool.invoke(request.toolCall, { configurable: { language } }))
      assert.equal(result.status, 'success')
      assert.deepEqual(JSON.parse(result.content), { status: 'selection_required', message: expected })
      assert.equal(result.update, undefined)
    }
  }
  assert.deepEqual(calls, [])
  assert.equal(state.dashboardEditing.target, null)
  const open = middleware.tools.find(tool => tool.name === 'dashboard_open')
  await assert.rejects(open.invoke({ artifactId: randomUUID() }), /MUST_NOT_RUN/)
  assert.deepEqual(calls, ['open'])
})


test('empty-input reads honor the selected published version and draft selection replaces it', async () => {
  const artifactId = randomUUID(), versionId = randomUUID(), calls = []
  const service = {open: async (_context, selected, version) => {
    calls.push({artifactId:selected, versionId:version})
    return {artifactId:selected, manifest:structuredClone(example), ...(version ? {versionId:version, versionNumber:2, isDraft:false} : {draftRevision:7, isDraft:true})}
  }}
  const middleware = new DashboardMiddleware(service).createMiddleware({}, {...scope, projectId:'project-a'})
  const invoke = args => middleware.tools.find(tool => tool.name === 'dashboard_open').invoke(args)
  middleware.beforeAgent({}, {configurable:{context:{live_dashboard:{schemaVersion:1, artifactId, versionId}}}})
  const formal = JSON.parse(await invoke({}))
  assert.equal(formal.readVersionId, versionId)
  assert.match(formal.next, /Read-only published/)
  assert.deepEqual(calls.at(-1), {artifactId, versionId})
  const other = randomUUID(); await invoke({artifactId:other})
  assert.deepEqual(calls.at(-1), {artifactId:other, versionId:undefined})
  middleware.beforeAgent({}, {configurable:{context:{live_dashboard:{schemaVersion:1, artifactId, draftRevision:7}}}})
  assert.equal(JSON.parse(await invoke({})).expectedRevision, 7)
  assert.deepEqual(calls.at(-1), {artifactId, versionId:undefined})
})
