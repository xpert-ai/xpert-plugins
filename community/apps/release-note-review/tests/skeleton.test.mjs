import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function source(path) { return readFile(new URL(path, root), 'utf8') }

function matches(row, where) {
  return Object.entries(where || {}).every(([key, value]) => value === undefined || row[key] === value)
}

function fakeRepository(prefix) {
  const rows = []
  let sequence = 0
  return {
    rows,
    create(value) { return { ...value } },
    async save(value) {
      if (!value.id) value.id = `${prefix}-${++sequence}`
      if (!value.createdAt) value.createdAt = new Date()
      value.updatedAt = new Date()
      const index = rows.findIndex((row) => row.id === value.id)
      if (index >= 0) rows[index] = value
      else rows.push(value)
      return value
    },
    async find({ where = {}, order = {}, take } = {}) {
      let result = rows.filter((row) => matches(row, where))
      const [key, direction] = Object.entries(order)[0] || []
      if (key) result = result.sort((a, b) => direction === 'DESC' ? Number(b[key] ?? 0) - Number(a[key] ?? 0) : Number(a[key] ?? 0) - Number(b[key] ?? 0))
      return take ? result.slice(0, take) : result
    },
    async findOne({ where = {} }) { return rows.find((row) => matches(row, where)) ?? null },
    async update(where, patch) {
      const row = rows.find((item) => matches(item, where))
      if (!row) return { affected: 0 }
      Object.assign(row, patch, { updatedAt: new Date() })
      return { affected: 1 }
    }
  }
}

async function makeService(failureInjection = 'none') {
  const { RelnoteService } = await import(new URL('dist/lib/relnote.service.js', root))
  const releases = fakeRepository('release')
  const runs = fakeRepository('run')
  const resolver = { resolve: () => ({ failureInjection }) }
  return { service: new RelnoteService(releases, runs, resolver), releases, runs, resolver }
}

const scope = { tenantId: 'tenant-a', organizationId: 'org-a', assistantId: 'assistant-a', userId: 'user-a' }
const validDraft = { deviceModel: 'G7', version: '2026.09.20', changesRaw: '修复唤醒词误触发\n优化导航投屏帧率\n补充回滚方案' }
const validNote = { noteMarkdown: '## 优化\n提升稳定性', risks: [{ level: 'medium', category: 'wakeword', item: '需验证唤醒词', evidence: '修复唤醒词误触发', suggestion: '回归测试' }], rollout: 'full' }

test('declares every fixed OTA plugin identifier and both plugin-prefixed entities', async () => {
  const pkg = JSON.parse(await source('package.json'))
  assert.equal(pkg.name, '@xpert-ai/plugin-release-note-review')
  assert.equal(pkg.xpert.plugin.artifactNamespace, 'relnote')
  const constants = await import(new URL('dist/lib/constants.js', root))
  assert.equal(constants.RELNOTE_MIDDLEWARE_NAME, 'RelnoteMiddleware')
  assert.equal(constants.RELNOTE_PROVIDER_KEY, 'relnote')
  assert.equal(constants.RELNOTE_REMOTE_ENTRY_KEY, 'relnote-workbench')
  assert.equal(constants.RELNOTE_TEMPLATE_KEY, 'relnote-review-assistant')
  assert.equal(constants.RELNOTE_FEATURE, 'relnote-core')
  assert.deepEqual(constants.RELNOTE_TOOL_NAMES, ['relnote_get_draft', 'relnote_save_note', 'relnote_list_releases'])
  assert.match(await source('src/lib/entities/relnote-release.entity.ts'), /@Entity\('plugin_relnote_release'\)/)
  assert.match(await source('src/lib/entities/relnote-ai-run.entity.ts'), /@Entity\('plugin_relnote_ai_run'\)/)
})

test('persists one draft, runs AI once, and rejects a stale optimistic-lock write', async () => {
  const { service, releases, runs } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  assert.equal(draft.status, 'draft'); assert.equal(draft.revision, 0)
  const read = await service.getDraft(scope, draft.id)
  assert.deepEqual(read.changes, ['修复唤醒词误触发', '优化导航投屏帧率', '补充回滚方案'])

  const requested = await service.requestAi(scope, draft.id)
  assert.equal(requested.attempt, 1); assert.match(requested.promptText, new RegExp(draft.id))
  assert.equal(releases.rows[0].status, 'ai_running')
  await service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote })
  assert.equal(releases.rows[0].status, 'ai_done'); assert.equal(releases.rows[0].revision, 1)
  assert.equal(runs.rows.length, 1); assert.equal(runs.rows[0].status, 'succeeded')
  await assert.rejects(() => service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote }), /版本冲突/)
})

test('failure injection records a failed attempt; retry reuses the same release and increments attempt', async () => {
  const { service, releases, runs, resolver } = await makeService('save')
  const draft = await service.createDraft(scope, validDraft)
  await service.requestAi(scope, draft.id)
  await assert.rejects(() => service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote }), /模拟持久化失败/)
  assert.equal(releases.rows.length, 1); assert.equal(releases.rows[0].status, 'ai_failed')
  assert.equal(runs.rows.length, 1); assert.equal(runs.rows[0].status, 'failed')
  resolver.resolve = () => ({ failureInjection: 'none' })
  const retried = await service.retryAi(scope, draft.id)
  assert.equal(retried.attempt, 2); assert.equal(releases.rows.length, 1)
  await service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote })
  assert.equal(releases.rows[0].status, 'ai_done'); assert.equal(runs.rows.length, 2)
  assert.deepEqual(runs.rows.map((run) => [run.attempt, run.status]), [[1, 'failed'], [2, 'succeeded']])
})

test('read-side failure marks the active run failed and keeps retry on one release', async () => {
  const { service, releases, runs, resolver } = await makeService('read')
  const draft = await service.createDraft(scope, validDraft)
  await service.requestAi(scope, draft.id)
  await assert.rejects(() => service.getDraft(scope, draft.id), /模拟上游变更系统超时/)
  assert.equal(releases.rows[0].status, 'ai_failed')
  assert.equal(runs.rows[0].status, 'failed')
  resolver.resolve = () => ({ failureInjection: 'none' })
  const retried = await service.retryAi(scope, draft.id)
  assert.equal(retried.attempt, 2)
  assert.equal(releases.rows.length, 1)
})
test('exposes the data-xpert providers and a fixed workbench manifest at runtime', async () => {
  const { default: plugin } = await import(new URL('dist/index.js', root))
  assert.deepEqual(plugin.meta.targetApps, ['data-xpert'])
  assert.deepEqual(plugin.meta.targetAppMeta['data-xpert'].runtime, { middlewareProviders: ['RelnoteMiddleware'], viewProviders: ['relnote'], templateProviders: ['relnoteTemplates'] })
  const { RelnoteViewProvider } = await import(new URL('dist/lib/relnote-view.provider.js', root))
  const provider = new RelnoteViewProvider({ listReleases: async () => [] })
  const [manifest] = provider.getViewManifests({ hostType: 'agent' }, 'agent.workbench.fixed')
  assert.equal(manifest.key, 'relnote_release_review_workbench')
  assert.equal(manifest.view.type, 'remote_component')
  assert.equal(manifest.view.component.entry, 'relnote-workbench')
  assert.equal(manifest.view.dataSource.mode, 'platform')
  assert.deepEqual(manifest.hostEvents.subscriptions[0].filter.toolNames, ['relnote_get_draft', 'relnote_save_note', 'relnote_list_releases'])
})

test('keeps the assistant middleware provider, safety prompt, assets, and template key aligned', async () => {
  const yaml = await source('src/relnote-assistant.yaml')
  const middleware = await source('src/lib/relnote.middleware.ts')
  const copyAssets = await source('scripts/copy-assets.mjs')
  assert.match(yaml, /templateKey: relnote-review-assistant/); assert.match(yaml, /provider: RelnoteMiddleware/)
  assert.match(yaml, /evidence 必须引用命中的变更条目原文/); assert.match(yaml, /不得发布 OTA/)
  assert.match(middleware, /@AgentMiddlewareStrategy\(RELNOTE_MIDDLEWARE_NAME\)/); assert.match(middleware, /name: RELNOTE_MIDDLEWARE_NAME/)
  assert.match(copyAssets, /relnote-assistant\.yaml/); assert.match(copyAssets, /remote-components/)
})

test('uses the standard remote component bridge rather than browser storage', async () => {
  const app = await source('src/lib/remote-components/relnote-workbench/app.js')
  for (const expected of ["const CHANNEL = 'xpertai.remote_component'", "post('ready')", "message.type === 'init'", "request('requestData'", "request('executeAction'", "request('invokeClientCommand'", "commandKey: 'assistant.chat.send_message'", "message.type === 'hostEvent'", "post('resize'"]) assert.match(app, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.doesNotMatch(app, /(?:localStorage|sessionStorage)/)
})
test('renders the remote entry with React UMD assets', async () => {
  const { RelnoteViewProvider } = await import(new URL('dist/lib/relnote-view.provider.js', root))
  const provider = new RelnoteViewProvider({})
  const entry = await provider.getRemoteComponentEntry({}, 'relnote_release_review_workbench', { entry: 'relnote-workbench' })
  assert.equal(entry.contentType, 'text/html; charset=utf-8')
  assert.match(entry.html, /OTA 发布说明审核台/)
  assert.match(entry.html, /新建发布单/)
  assert.ok(entry.html.length > 140000)
})


test('archives human edits atomically and keeps archived releases read-only', async () => {
  const { service, runs } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  await service.requestAi(scope, draft.id)
  await service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote })
  await assert.rejects(() => service.confirmRelease(scope, { releaseId: draft.id, expectedRevision: 0 }), /版本冲突/)
  const saved = await service.confirmRelease(scope, { releaseId: draft.id, expectedRevision: 1, noteMarkdown: '人工修订：补充回滚文档，不承诺已验证回滚。', risks: [], rollout: 'canary' })
  assert.equal(saved.status, 'confirmed'); assert.equal(saved.revision, 2)
  assert.match(saved.noteMarkdown, /人工修订/); assert.deepEqual(saved.risks, [])
  assert.equal(saved.rollout, 'canary'); assert.equal(runs.rows[0].status, 'succeeded')
  await assert.rejects(() => service.requestAi(scope, draft.id), /只读/)
  await assert.rejects(() => service.confirmRelease(scope, { releaseId: draft.id, expectedRevision: 2 }), /待审核/)
})

test('rejects a race at the conditional archive update without overwriting newer data', async () => {
  const { service, releases } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  await service.requestAi(scope, draft.id)
  await service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote })
  const originalUpdate = releases.update
  releases.update = async (where, patch) => {
    assert.equal(where.revision, 1); assert.equal(where.status, 'ai_done')
    assert.equal(where.tenantId, scope.tenantId)
    releases.rows[0].revision = 2
    releases.rows[0].noteMarkdown = 'concurrent edit'
    return originalUpdate(where, patch)
  }
  await assert.rejects(() => service.confirmRelease(scope, { releaseId: draft.id, expectedRevision: 1, noteMarkdown: 'stale edit' }), /版本冲突/)
  assert.equal(releases.rows[0].noteMarkdown, 'concurrent edit')
  assert.equal(releases.rows[0].status, 'ai_done')
})

test('workbench submits reviewed edits and retry dispatches an assistant message', async () => {
  const app = await source('src/lib/remote-components/relnote-workbench/app.js')
  assert.ok(app.includes("onRetry: () => requestAi('retry_ai')"))
  assert.ok(app.includes("run(actionKey, {}, selectedId)"))
  assert.ok(app.includes('onConfirm({ noteMarkdown: note, risks, rollout })'))
  assert.ok(app.includes('risks.every((_, i) => checked.includes(i))'))
  assert.ok(app.includes('移除此风险（归档时生效）'))
  assert.ok(app.includes('selected.id}:${selected.revision}:${selected.status}'))
  const prompt = await source('src/relnote-assistant.yaml')
  assert.match(prompt, /严格区分事实与推测/)
})

test('saves draft edits with revision control and rejects invalid or out-of-scope changes', async () => {
  const { service, releases, runs } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  const input = { ...validDraft, releaseId: draft.id, expectedRevision: 0, deviceModel: 'M3', version: 'edited', changesRaw: '补充文档' }
  await assert.rejects(() => service.saveDraft(scope, { ...input, version: ' ' }), /版本号/)
  assert.equal(releases.rows[0].revision, 0)
  await assert.rejects(() => service.saveDraft({ ...scope, organizationId: 'other' }, input), /数据范围/)
  const saved = await service.saveDraft(scope, input)
  assert.equal(saved.deviceModel, 'M3'); assert.equal(saved.version, 'edited')
  assert.equal(saved.changesRaw, '补充文档'); assert.equal(saved.revision, 1)
  assert.equal(saved.status, 'draft'); assert.equal(releases.rows.length, 1); assert.equal(runs.rows.length, 0)
  await assert.rejects(() => service.saveDraft(scope, input), /版本冲突/)
  await service.requestAi(scope, draft.id)
  await assert.rejects(() => service.saveDraft(scope, { ...input, expectedRevision: 1 }), /正在生成/)
  await service.saveNote(scope, { releaseId: draft.id, expectedRevision: 1, ...validNote })
  await service.confirmRelease(scope, { releaseId: draft.id, expectedRevision: 2 })
  await assert.rejects(() => service.saveDraft(scope, { ...input, expectedRevision: 3 }), /只读/)
})

test('draft save cannot overwrite a concurrent transition to AI running', async () => {
  const { service, releases } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  const originalUpdate = releases.update
  releases.update = async (where, patch) => {
    assert.equal(where.status, 'draft')
    releases.rows[0].status = 'ai_running'
    return originalUpdate(where, patch)
  }
  await assert.rejects(() => service.saveDraft(scope, { ...validDraft, releaseId: draft.id, expectedRevision: 0, changesRaw: 'stale change' }), /版本冲突/)
  assert.equal(releases.rows[0].changesRaw, validDraft.changesRaw)
  assert.equal(releases.rows[0].revision, 0)
  assert.equal(releases.rows[0].status, 'ai_running')
})

test('draft UI wires saving through the host and guards unsaved generation', async () => {
  const app = await source('src/lib/remote-components/relnote-workbench/app.js')
  assert.ok(app.includes("onSaveDraft: (draft) => run('save_draft'"))
  assert.ok(app.includes("const draftEditable = release.status === 'draft'"))
  assert.ok(app.includes('!!busy || draftDirty, onClick: onRequestAi'))
  assert.ok(app.includes('保存草稿'))
  assert.ok(app.includes("draft.version.trim()"))
})

test('empty workbench returns no releases and foreign scopes cannot read or request AI', async () => {
  const { service, runs } = await makeService()
  assert.deepEqual(await service.getWorkbenchData(scope), { items: [], total: 0 })
  const draft = await service.createDraft(scope, validDraft)
  for (const foreign of [{ ...scope, tenantId: 'foreign' }, { ...scope, organizationId: 'foreign' }, { ...scope, assistantId: 'foreign' }]) {
    assert.deepEqual(await service.listReleases(foreign), [])
    await assert.rejects(() => service.getDraft(foreign, draft.id), /数据范围/)
    await assert.rejects(() => service.requestAi(foreign, draft.id), /数据范围/)
  }
  assert.equal(runs.rows.length, 0)
})

test('actual workbench App renders the empty state after host initialization', async () => {
  const { runInNewContext } = await import('node:vm')
  const app = await source('src/lib/remote-components/relnote-workbench/app.js')
  const states = []; let cursor = 0; let rootElement; let onMessage
  const sent = []
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useCallback: fn => fn,
    useEffect() {},
    Fragment: 'fragment'
  }
  const window = { addEventListener: (event, handler) => { if (event === 'message') onMessage = handler } }
  runInNewContext(app, {
    React, ReactDOM: { createRoot: () => ({ render: el => { rootElement = el } }) }, window,
    parent: { postMessage: message => sent.push(message) },
    document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: () => ({}), body: { scrollHeight: 620 }, documentElement: { scrollHeight: 620 } },
    setTimeout: fn => fn()
  })
  cursor = 0
  assert.match(JSON.stringify(rootElement.type()), /正在连接/)
  onMessage({ data: { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'init', instanceId: 'test', manifest: {}, payload: {} } })
  cursor = 0
  const tree = JSON.stringify(rootElement.type())
  assert.match(tree, /暂无发布单/)
  assert.match(tree, /创建第一条 OTA 发布草稿/)
  assert.match(tree, /选择一条发布单/)
  assert.ok(sent.some(message => message.type === 'ready'))
})

test('failed stale AI save does not overwrite concurrent result or mark its run failed', async () => {
  const { service, releases, runs } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  await service.requestAi(scope, draft.id)
  const findOne = releases.findOne
  releases.findOne = async query => { const row = await findOne(query); return row ? { ...row } : null }
  const update = releases.update
  let injected = false
  releases.update = async (where, patch) => {
    if (!injected && patch.status === 'ai_done') {
      injected = true
      Object.assign(releases.rows[0], { status: 'ai_done', revision: 1, noteMarkdown: 'newer result' })
      runs.rows[0].status = 'succeeded'
    }
    return update(where, patch)
  }
  await assert.rejects(() => service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote }), /版本冲突/)
  assert.equal(releases.rows[0].noteMarkdown, 'newer result')
  assert.equal(releases.rows[0].revision, 1)
  assert.equal(releases.rows[0].status, 'ai_done')
  assert.equal(runs.rows[0].status, 'succeeded')
})

test('audit failure after committed AI output does not roll back the business result', async () => {
  const { service, releases, runs } = await makeService()
  const draft = await service.createDraft(scope, validDraft)
  await service.requestAi(scope, draft.id)
  const findOne = releases.findOne
  releases.findOne = async query => { const row = await findOne(query); return row ? { ...row } : null }
  runs.save = async () => { throw new Error('audit unavailable') }
  await assert.rejects(() => service.saveNote(scope, { releaseId: draft.id, expectedRevision: 0, ...validNote }), /audit unavailable/)
  assert.equal(releases.rows[0].status, 'ai_done')
  assert.equal(releases.rows[0].revision, 1)
  assert.equal(releases.rows[0].noteMarkdown, validNote.noteMarkdown)
})
