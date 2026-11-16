import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { generatePresentation } from '../dist/lib/ai-generate.js'
import { createSchema, applySchema, inspectSchema } from '../dist/lib/ai-schema.js'
import { PptxEngine } from '../dist/lib/ai-engine.js'
import { PptxFormat } from '../dist/lib/format.js'
import { PptxAi } from '../dist/lib/ai-service.js'
import { PptxTemplates } from '../dist/lib/template-service.js'
import { PptxAiMiddleware } from '../dist/lib/ai-middleware.js'
import { PptxAssistantCapability } from '../dist/lib/assistant-capability.js'
import { ASSISTANT_CAPABILITY_PROVIDER } from '@xpert-ai/plugin-sdk'
import { ModelFeature, parseResourceCard, upsertResourceCardContent } from '@xpert-ai/contracts'
import { digest, readReceipts, recordReceipt, matchReceipt } from '../dist/lib/ai-receipts.js'

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { actor: { tenantId: id(1), organizationId: id(2), userId: id(3) }, projectId: id(4), assistantId: id(5) }
const plan = { operationId: id(10), title: '企业协作方案', brand: { company: '南京元数信息技术有限公司' }, slides: [
  { layout: 'cover', title: '人和 AI 共同制作', subtitle: '原生 PPTX，同一稿件', notes: '开场备注，不出现在预览中。' },
  { layout: 'section', title: '第一章 架构', subtitle: '统一资源与版本', notes: '章节备注。' },
  { layout: 'bullets', title: '价值', points: ['可手动编辑', 'AI 只改指定对象'], notes: '内容备注。' },
  { layout: 'process', title: '工作过程', steps: [{ title: '计划', detail: '明确结构' }, { title: '制作', detail: '原生对象' }, { title: '验收', detail: '导出复查' }], notes: '流程备注。' },
  { layout: 'table', title: '能力对照', headers: ['能力', '结果'], rows: [['原生文字', '可编辑'], ['备注', '保留']], notes: '表格备注。' }
] }
const normalized = createSchema.parse(plan)
const engine = new PptxEngine(), format = new PptxFormat()
const generated = await generatePresentation(normalized)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = (buffer, extra = {}) => engine.run({ action: 'inspect', buffer, offset: 0, limit: 3, ...extra })
const target = inspected => inspected.slides[0].objects.find(obj => obj.text === '人和 AI 共同制作')

function fixture(managed = false) {
  const storage = new Map(), calls = { writes: 0, providerWrites: 0, auth: 0 }, state = { denied: false, canWrite: true, bound: true }
  const check = () => { if (state.denied) throw new ForbiddenException('revoked') }
  const project = { assertAssistant: async () => { check(); if (!state.bound) throw new ForbiddenException('unbound') },
    assertEdit: async () => { check(); if (!state.canWrite) throw new ForbiddenException('readonly') } }
  const file = path => { check(); const buffer = storage.get(path); if (!buffer) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return { buffer, sha256: hash(buffer) } }
  const native = { read: async input => file(input.path), write: async input => {
    check(); if (!state.canWrite) throw new ForbiddenException('readonly')
    const previous = storage.get(input.path)
    if ((previous ? hash(previous) : null) !== input.expectedHash) throw new ConflictException('cas')
    storage.set(input.path, input.buffer); calls.writes++; return { sha256: hash(input.buffer) }
  } }
  let path = ''
  const current = locator => { const value = file(locator); return { buffer: value.buffer, revision: value.sha256, canWrite: state.canWrite,
    registration: { key: 'pptx_editor.pptx' }, file: { path: locator, title: 'demo.pptx' } } }
  const editors = {
    resolveFile: async input => {
      path = input.path; file(path)
      if (managed && input.editorKey && input.editorKey !== 'pptx_editor.ooxml') throw new Error('resource_editor_unavailable')
      const resourceId = input.path.startsWith('presentation-exports/') ? id(22) : id(20)
      return { viewKey: 'pptx_editor.views__pptx_editor.editor', selectionId: managed ? resourceId : hash(Buffer.from(path)),
        parameters: managed ? { contentProvider: 'spaces', contentId: id(21), contentTitle: 'demo.pptx', contentEditor: 'pptx_editor.ooxml' }
          : { contentProvider: 'platform.workspace.file', contentTitle: 'demo.pptx', filePath: path, contentEditor: 'pptx_editor.pptx' },
        ...(managed ? { resource: { resourceRef: { providerKey: 'spaces', resourceId } } } : {}) }
    },
    readFile: async input => { assert.equal(managed, false, 'owned files cannot use readFile'); return current(input.path) },
    read: async input => { assert.equal(input.source.providerKey, 'spaces'); return current(path) },
    writeFile: async input => { assert.equal(managed, false, 'owned files cannot use writeFile'); return { revision: (await native.write({ ...input, expectedHash: input.expectedRevision })).sha256 } },
    write: async input => { calls.providerWrites++; return { revision: (await native.write({ ...input, path, expectedHash: input.expectedRevision })).sha256 } }
  }
  const capabilities = { 'platform.content.editors': editors, 'platform.project.files': native, 'platform.project.access': project,
    'platform.assistant.middleware-access': { assertAccess: async input => { calls.auth++; check(); assert.equal(input.provider, 'pptx-editor'); assert.equal(input.assistantId, scope.assistantId) } } }
  const runtime = { require: key => { assert.ok(capabilities[key.id], key.id); return capabilities[key.id] } }
  const templates = new PptxTemplates(runtime, format, engine)
  return { storage, state, calls, templates, service: new PptxAi(runtime, format, engine, templates) }
}

test('native template creation preserves human edits on retries, binds input identity and rechecks permissions', async () => {
  const { service, storage, state, calls } = fixture(true)
  const source = { kind: 'builtin', templateId: 'dsh-signal', language: 'zh' }
  const template = await service.inspectTemplate(scope, { source })
  const slot = template.slides[0].objects.find(object => object.kind === 'text')
  const input = { source, operationId: id(77), title: '企业套版验收', slides: [{ sourceSlide: 1, notes: '原生备注', fills: [{ kind: 'text', objectId: slot.objectId, text: '结构化内容' }] }] }
  const result = await service.composeTemplate(scope, input)
  assert.equal(result.card.open.projectId, scope.projectId)
  assert.equal(result.replayed, false)
  const before = calls.writes, content = await service.inspect(scope, { filePath: result.filePath })
  const shape = content.slides[0].objects.find(object => object.text === '结构化内容')
  await service.apply(scope, { filePath: result.filePath, expectedRevision: content.revision, operationId: id(78),
    operations: [{ kind: 'setText', slideId: content.slides[0].slideId, objectId: shape.objectId, text: '保留人工修改' }] })
  assert.equal((await service.composeTemplate(scope, input)).replayed, true)
  assert.equal(calls.writes, before + 1)
  assert.ok((await service.inspect(scope, { filePath: result.filePath })).slides[0].objects.some(object => object.text === '保留人工修改'))
  await assert.rejects(service.composeTemplate(scope, { ...input, title: '不同请求' }), /operation_reused/)
  state.canWrite = false
  await assert.rejects(service.composeTemplate(scope, input), /readonly/)
  state.canWrite = true; state.bound = false
  await assert.rejects(service.inspectTemplate(scope, { source }), /unbound/)
  state.bound = true; state.denied = true
  await assert.rejects(service.composeTemplate(scope, input), /revoked/)
  assert.equal(storage.size, 1)
})

test('enterprise template revision conflicts and forged scope are rejected without a write', async () => {
  const { service, templates, storage, calls } = fixture(true)
  storage.set('company/template.pptx', generated)
  const source = { kind: 'file', filePath: 'company/template.pptx', expectedRevision: hash(generated) }
  assert.equal((await service.inspectTemplate(scope, { source })).slideCount, 5)
  const input = { source: { ...source, expectedRevision: 'stale' }, operationId: id(79), title: 'stale', slides: [{ sourceSlide: 1 }] }
  await assert.rejects(service.composeTemplate(scope, input), /template_version_conflict/)
  await assert.rejects(templates.compose(scope, { ...input, actor: { userId: id(99) } }))
  assert.equal(calls.writes, 0)
})

test('enterprise import keeps original bytes and reserves operation identity across retries', async () => {
  const { templates, storage } = fixture(true)
  const input = { operationId: id(80), title: '公司母版.pptx' }
  const imported = await templates.import(scope, input, generated)
  assert.ok(storage.get(imported.source.filePath).equals(generated))
  const again = await templates.import(scope, input, generated)
  assert.equal(again.source.filePath, imported.source.filePath)
  assert.equal(storage.size, 2, 'one original binary and one small receipt')
  await assert.rejects(templates.import(scope, { ...input, title: '另一个名字' }, generated), /template_import_conflict/)
  assert.equal(storage.size, 2)
})

test('strict schemas reject forged scope, traversal, oversized decks and inconsistent tables', () => {
  for (const patch of [{ projectId: id(99) }, { slides: [] }, { slides: Array(41).fill(plan.slides[0]) }]) assert.equal(createSchema.safeParse({ ...plan, ...patch }).success, false)
  for (const filePath of ['/secret.pptx', '../secret.pptx', 'a/../b.pptx', 'a\\b.pptx', 'a.pdf']) assert.equal(inspectSchema.safeParse({ filePath }).success, false)
  assert.equal(createSchema.safeParse({ ...plan, slides: [{ ...plan.slides[4], rows: [['one']] }] }).success, false)
  assert.equal(applySchema.safeParse({ filePath: 'x.pptx', expectedRevision: '1', operationId: id(1), operations: [{ kind: 'deleteEverything' }] }).success, false)
})

test('five layouts are native editable objects, with Chinese text, tables, diagrams and notes', async () => {
  await format.validateFile(generated)
  const inspection = await read(generated), tail = await read(generated, { offset: 3, limit: 2 })
  assert.equal(inspection.slideCount, 5); assert.equal(inspection.hasMore, true)
  assert.ok(target(inspection)?.editable)
  assert.equal(inspection.slides[0].notes, plan.slides[0].notes)
  assert.ok(tail.slides[0].objects.filter(obj => obj.kind === 'shape').length > 6)
  assert.ok(tail.slides[1].objects.some(obj => obj.kind === 'table'))
  const zip = await JSZip.loadAsync(generated)
  assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /10263A/)
})

test('targeted edits retain another human object and untouched package assets', async () => {
  const before = await read(generated), object = target(before), page = before.slides[0]
  const human = page.objects.find(item => item.text === '原生 PPTX，同一稿件')
  const first = await engine.run({ action: 'apply', buffer: generated, operations: [{ kind: 'setText', slideId: page.slideId, objectId: human.objectId, text: '人工作品必须保留' }] })
  const next = await engine.run({ action: 'apply', buffer: first.buffer, operations: [
    { kind: 'setText', slideId: page.slideId, objectId: object.objectId, text: 'AI 定点修改' },
    { kind: 'setNotes', slideId: page.slideId, notes: '新备注' },
    { kind: 'setBounds', slideId: page.slideId, objectId: object.objectId, x: 10, y: 20, width: 70, height: 25 }
  ] })
  const after = await read(next.buffer)
  assert.equal(after.slides[0].notes, '新备注')
  assert.equal(after.slides[0].objects.find(item => item.objectId === human.objectId).text, '人工作品必须保留')
  assert.equal(after.slides[0].objects.find(item => item.objectId === object.objectId).text, 'AI 定点修改')
  const oldZip = await JSZip.loadAsync(generated), newZip = await JSZip.loadAsync(next.buffer)
  const protectedParts = Object.keys(oldZip.files).filter(name => /ppt\/(theme|slideMasters|slideLayouts|media)\//.test(name) && !oldZip.files[name].dir)
  assert.ok(protectedParts.length > 0)
  for (const name of protectedParts) assert.deepEqual(await newZip.file(name).async('uint8array'), await oldZip.file(name).async('uint8array'), name)
})

test('receipts survive manual serializer, bind payload and keep creation receipt separately', async () => {
  const creation = { id: id(10), actor: digest(scope), hash: digest(normalized) }
  let buffer = await recordReceipt(generated, creation, true)
  const receipt = { ...creation, id: id(11), hash: digest('edit') }
  buffer = await recordReceipt(buffer, receipt)
  const result = await engine.run({ action: 'apply', buffer, operations: [{ kind: 'setNotes', slideId: 'ppt/slides/slide1.xml', notes: '人工作品' }] })
  const journal = await readReceipts(Buffer.from(result.buffer))
  assert.ok(matchReceipt(journal, creation, true)); assert.ok(matchReceipt(journal, receipt))
  assert.throws(() => matchReceipt(journal, { ...receipt, hash: digest('changed') }), /operation_reused/)
})

test('create retries do not duplicate or overwrite later human edits; changed payload is rejected', async () => {
  const f = fixture(), created = await f.service.create(scope, plan)
  const buffer = f.storage.get(created.filePath)
  const human = await engine.run({ action: 'apply', buffer, operations: [{ kind: 'setNotes', slideId: 'ppt/slides/slide1.xml', notes: 'human latest' }] })
  f.storage.set(created.filePath, Buffer.from(human.buffer))
  const retry = await f.service.create(scope, plan)
  assert.ok(retry.replayed); assert.equal(f.calls.writes, 1); assert.equal(f.storage.size, 1)
  assert.equal((await f.service.inspect(scope, { filePath: created.filePath })).slides[0].notes, 'human latest')
  await assert.rejects(f.service.create(scope, { ...plan, title: 'changed' }), /operation_reused/)
})

test('managed saves go through provider, reject stale revision and replay without rewriting current content', async () => {
  const f = fixture(true), created = await f.service.create(scope, plan)
  const inspected = await f.service.inspect(scope, { filePath: created.filePath }), object = target(inspected)
  const change = { filePath: created.filePath, expectedRevision: inspected.revision, operationId: id(22),
    operations: [{ kind: 'setText', slideId: inspected.slides[0].slideId, objectId: object.objectId, text: 'new' }] }
  const saved = await f.service.apply(scope, change)
  assert.equal(f.calls.providerWrites, 1); assert.notEqual(saved.revision, inspected.revision)
  assert.ok((await f.service.apply(scope, change)).replayed); assert.equal(f.calls.providerWrites, 1)
  await assert.rejects(f.service.apply(scope, { ...change, operationId: id(23) }), /version_conflict/)
  await assert.rejects(f.service.apply(scope, { ...change, operations: [{ ...change.operations[0], text: 'different' }] }), /operation_reused/)
})

test('concurrent requests publish once; each call rechecks read/write, middleware and Project binding', async () => {
  const f = fixture(), created = await f.service.create(scope, plan)
  const change = { filePath: created.filePath, expectedRevision: created.revision, operationId: id(25), operations: [{ kind: 'setNotes', slideId: 'ppt/slides/slide1.xml', notes: 'concurrent' }] }
  const results = await Promise.all([f.service.apply(scope, change), f.service.apply(scope, change)])
  assert.deepEqual(results.map(r => r.replayed).sort(), [false, true]); assert.equal(f.calls.writes, 2)
  f.state.canWrite = false
  await assert.rejects(f.service.apply(scope, change), /readonly/)
  assert.equal((await f.service.inspect(scope, { filePath: created.filePath })).canWrite, false)
  f.state.denied = true
  await assert.rejects(f.service.inspect(scope, { filePath: created.filePath }), /revoked/)
  f.state.denied = false; f.state.bound = false
  await assert.rejects(f.service.inspect(scope, { filePath: created.filePath }), /unbound/)
})

test('preview has no scripts or notes; export preserves exact bytes and stale renders fail', async () => {
  const f = fixture(), created = await f.service.create(scope, plan)
  const input = { filePath: created.filePath, expectedRevision: created.revision }
  const validation = await f.service.validate(scope, input)
  assert.equal(validation.slideCount, 5); assert.equal(validation.visualReviewRequired, true)
  const preview = await f.service.render(scope, { ...input, limit: 2 })
  const html = f.storage.get(preview.filePath).toString()
  assert.match(html, /Content-Security-Policy/); assert.match(html, /人和 AI 共同制作/)
  assert.ok(!html.includes('<script')); assert.ok(!html.includes(plan.slides[0].notes))
  const exported = await f.service.export(scope, input)
  assert.deepEqual(f.storage.get(exported.filePath), f.storage.get(created.filePath))
  await assert.rejects(f.service.render(scope, { ...input, expectedRevision: 'stale' }), /version_conflict/)
})

test('invalid or partially valid operations never persist a partial change', async () => {
  const f = fixture(), created = await f.service.create(scope, plan), before = f.storage.get(created.filePath)
  const change = { filePath: created.filePath, expectedRevision: created.revision, operationId: id(27), operations: [
    { kind: 'setNotes', slideId: 'ppt/slides/slide1.xml', notes: 'must not persist' },
    { kind: 'setText', slideId: 'ppt/slides/slide1.xml', objectId: 'nonexistent', text: 'bad' }
  ] }
  await assert.rejects(f.service.apply(scope, change), /object_not_editable/)
  assert.deepEqual(f.storage.get(created.filePath), before)
})

test('native middleware publishes nine strict tools; real tool call uses only trusted context', async () => {
  const f = fixture(), middleware = new PptxAiMiddleware(f.service).createMiddleware({}, { ...scope.actor, projectId: scope.projectId, xpertId: scope.assistantId })
  assert.equal(middleware.tools.length, 9)
  const create = middleware.tools.find(tool => tool.name === 'pptx_create')
  const result = JSON.parse(await create.invoke(plan))
  assert.equal(result.slideCount, 5)
  await assert.rejects(create.invoke({ ...plan, projectId: id(100) }))
})

test('Assistant capability is discoverable, optional and composes the native PPTX middleware idempotently', async () => {
  const capability = new PptxAssistantCapability()
  assert.equal(Reflect.getMetadata(ASSISTANT_CAPABILITY_PROVIDER, PptxAssistantCapability), 'pptx-editor')
  assert.equal(capability.availableForBlankAssistant, true); assert.equal(capability.supportsQuickCreation, true)
  assert.deepEqual(capability.requiredModelFeatures, [ModelFeature.TOOL_CALL])
  const draft = { team: { agent: { key: 'Agent_Main' } }, nodes: [{ type: 'agent', key: 'Agent_Main', position: { x: 0, y: 0 }, entity: { key: 'Agent_Main', prompt: 'Preserve me' } }], connections: [] }
  assert.equal(capability.isEnabled(draft), false)
  await capability.apply({ draft })
  assert.equal(capability.isEnabled(draft), true)
  assert.equal(draft.nodes[1].entity.provider, 'pptx-editor')
  assert.match(draft.nodes[0].entity.prompt, /^Preserve me/)
  const once = structuredClone(draft)
  await capability.apply({ draft })
  assert.deepEqual(draft, once)
})

test('export keeps original editing separate from the committed download snapshot', async () => {
  for (const managed of [false, true]) {
    const f = fixture(managed), created = await f.service.create(scope, plan), cards = []
    const middleware = new PptxAiMiddleware(f.service).createMiddleware({}, { ...scope.actor, projectId: scope.projectId, xpertId: scope.assistantId })
    const exportTool = middleware.tools.find(tool => tool.name === 'pptx_export')
    const config = { callbacks: [{ handleCustomEvent(_name, data) { if (data.type === 'resource_card') cards.push(data) } }] }
    const result = JSON.parse(await exportTool.invoke({ filePath: created.filePath, expectedRevision: created.revision }, config))
    assert.deepEqual(result.resourceCard, { status: 'emitted' }); assert.equal(cards.length, 1)
    const card = cards[0].data
    assert.deepEqual(parseResourceCard(card), card)
    assert.deepEqual(f.storage.get(result.filePath), f.storage.get(created.filePath))
    assert.equal(card.open.target, 'assistant.project'); assert.equal(card.open.projectId, scope.projectId)
    const download = JSON.parse(card.content[0].files[0].file.fileKey)
    if (managed) {
      assert.equal(card.open.selectionId, id(20))
      assert.deepEqual(download, { providerKey: 'spaces', resourceId: id(22) })
    } else {
      assert.equal(card.open.parameters.filePath, created.filePath)
      assert.equal(download.filePath, result.filePath); assert.notEqual(download.filePath, created.filePath)
    }
    assert.equal(card.resource.id, digest({ projectId: scope.projectId, filePath: created.filePath }))
    assert.equal(card.title, plan.title)
    assert.equal(card.description, `PPTX · ${plan.slides.length} slides`)
    assert.equal(card.icon.type, 'svg')
    assert.ok(!JSON.stringify(card).includes(scope.actor.userId))
    await assert.rejects(exportTool.invoke({ filePath: created.filePath, expectedRevision: 'stale' }, config), /version_conflict/)
    assert.equal(cards.length, 1, 'a failed export must never emit a success card')
    f.state.denied = true
    await assert.rejects(f.service.exportCard(scope, result), /revoked/)
  }
})

test('compose, export and export retries upsert one delivery without merging different originals', async () => {
  const f = fixture(), cards = []
  const middleware = new PptxAiMiddleware(f.service).createMiddleware({}, { ...scope.actor, projectId: scope.projectId, xpertId: scope.assistantId })
  const tool = name => middleware.tools.find(tool => tool.name === name)
  const config = { callbacks: [{ handleCustomEvent(_name, data) { if (data.type === 'resource_card') cards.push(data) } }] }
  const input = { source: { kind: 'builtin', templateId: 'dsh-signal', language: 'zh' }, operationId: id(90), title: '南京元数模板能力验收',
    slides: [{ sourceSlide: 1, fills: [], notes: '开场' }, { sourceSlide: 3, fills: [], notes: '假设' }] }
  const created = JSON.parse(await tool('pptx_template_compose').invoke(input, config))
  const version = { filePath: created.filePath, expectedRevision: created.revision }
  const exported = JSON.parse(await tool('pptx_export').invoke(version, config))
  await tool('pptx_export').invoke(version, config)
  assert.equal(cards.length, 3)
  assert.equal(new Set(cards.map(card => card.id)).size, 1)
  const deliveries = cards.reduce((result, card) => upsertResourceCardContent(result, card), [])
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].data.title, input.title)
  assert.equal(deliveries[0].data.description, 'PPTX · 2 slides')
  assert.equal(deliveries[0].data.open.parameters.filePath, created.filePath)
  assert.equal(JSON.parse(deliveries[0].data.content[0].files[0].file.fileKey).filePath, exported.filePath)
  await tool('pptx_template_compose').invoke({ ...input, operationId: id(91) }, config)
  assert.equal(cards.reduce((result, card) => upsertResourceCardContent(result, card), []).length, 2)
})


test('card resolution/delivery failure does not fail or repeat a committed export', async () => {
  const f = fixture(), created = await f.service.create(scope, plan)
  f.service.exportCard = async () => { throw new Error('view unavailable') }
  const middleware = new PptxAiMiddleware(f.service).createMiddleware({}, { ...scope.actor, projectId: scope.projectId, xpertId: scope.assistantId })
  const exportTool = middleware.tools.find(tool => tool.name === 'pptx_export')
  const result = JSON.parse(await exportTool.invoke({ filePath: created.filePath, expectedRevision: created.revision }))
  assert.deepEqual(result.resourceCard, { status: 'unavailable' })
  assert.deepEqual(f.storage.get(result.filePath), f.storage.get(created.filePath)); assert.equal(f.calls.writes, 2)
})
