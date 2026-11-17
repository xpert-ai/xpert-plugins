import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { DocxAi } from '../dist/lib/native/ai-service.js'
import { DocxEngine } from '../dist/lib/native/ai-engine.js'
import { DocxFormat } from '../dist/lib/native/format.js'
import { createSchema, inspectSchema } from '../dist/lib/native/ai-schema.js'
import { DocxFileCapability } from '../dist/lib/native/assistant-capability.js'
import { DocxFileMiddleware } from '../dist/lib/native/ai-middleware.js'
import { ModelFeature, parseResourceCard } from '@xpert-ai/contracts'
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const scope = { actor: { tenantId: id(1), organizationId: id(2), userId: id(3) }, projectId: id(4), assistantId: id(5) }
const plan = { operationId: id(10), title: '企业报告', templateId: 'report', blocks: [{ kind: 'paragraph', text: '原始段落' }, { kind: 'paragraph', text: '保留人工内容' }] }
const engine = new DocxEngine(), format = new DocxFormat()
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
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
    registration: { key: 'docx_editor.docx' }, file: { path: locator, title: 'demo.docx' } } }
  const editors = {
    resolveFile: async input => {
      path = input.path; file(path)
      if (managed && input.editorKey && input.editorKey !== 'docx_editor.ooxml') throw new Error('resource_editor_unavailable')
      const resourceId = input.path.startsWith('document-exports/') ? id(22) : id(20)
      return { viewKey: 'docx_editor.files__docx_editor.file', selectionId: managed ? resourceId : hash(Buffer.from(path)),
        parameters: managed ? { contentProvider: 'spaces', contentId: id(21), contentTitle: 'demo.docx', contentEditor: 'docx_editor.ooxml' }
          : { contentProvider: 'platform.workspace.file', contentTitle: 'demo.docx', filePath: path, contentEditor: 'docx_editor.docx' },
        ...(managed ? { resource: { resourceRef: { providerKey: 'spaces', resourceId } } } : {}) }
    },
    readFile: async input => { assert.equal(managed, false, 'owned files cannot use readFile'); return current(input.path) },
    read: async input => { assert.equal(input.source.providerKey, 'spaces'); return current(path) },
    writeFile: async input => { assert.equal(managed, false, 'owned files cannot use writeFile'); return { revision: (await native.write({ ...input, expectedHash: input.expectedRevision })).sha256 } },
    write: async input => { calls.providerWrites++; return { revision: (await native.write({ ...input, path, expectedHash: input.expectedRevision })).sha256 } }
  }
  const capabilities = { 'platform.content.editors': editors, 'platform.project.files': native, 'platform.project.access': project,
    'platform.assistant.middleware-access': { assertAccess: async input => { calls.auth++; check(); assert.equal(input.provider, 'docx-files'); assert.equal(input.assistantId, scope.assistantId) } } }
  const runtime = { require: key => { assert.ok(capabilities[key.id], key.id); return capabilities[key.id] } }
  return { storage, state, calls, service: new DocxAi(runtime, format, engine) }
}

test('creation and targeted edits use the authoritative provider, retain other content and replay without overwriting', async () => {
  const f = fixture(true), created = await f.service.create(scope, plan)
  const before = await f.service.inspect(scope, { filePath: created.filePath })
  const paragraph = before.paragraphs.find(p => p.text === '原始段落')
  const input = { filePath: created.filePath, expectedRevision: before.revision, operationId: id(11), edits: [{ paragraphId: paragraph.paragraphId, expectedText: paragraph.text, text: '人工更新' }] }
  await f.service.apply(scope, input)
  assert.equal((await f.service.apply(scope, input)).replayed, true)
  assert.equal((await f.service.create(scope, plan)).replayed, true)
  assert.equal(f.calls.providerWrites, 1)
  assert.equal(f.calls.writes, 2)
  const after = await f.service.inspect(scope, { filePath: created.filePath })
  assert.ok(after.paragraphs.some(p => p.text === '人工更新'))
  assert.ok(after.paragraphs.some(p => p.text === '保留人工内容'))
  await assert.rejects(f.service.create(scope, { ...plan, title: 'changed request' }), /operation_reused/)
  await assert.rejects(f.service.apply(scope, { ...input, operationId: id(12) }), /version_conflict/)
  assert.equal(f.calls.writes, 2)
})
test('revocation, read-only access, unbound assistants and forged scope cannot write', async () => {
  const f = fixture(), created = await f.service.create(scope, plan)
  f.state.canWrite = false
  await assert.rejects(f.service.create(scope, plan), /readonly/)
  f.state.canWrite = true; f.state.bound = false
  await assert.rejects(f.service.inspect(scope, { filePath: created.filePath }), /unbound/)
  f.state.bound = true; f.state.denied = true
  await assert.rejects(f.service.create(scope, plan), /revoked/)
  assert.equal(f.calls.writes, 1)
  for (const path of ['/secret.docx', '../secret.docx', 'a/../b.docx', 'a\\b.docx', 'file.pdf']) assert.equal(inspectSchema.safeParse({filePath:path}).success,false)
  assert.equal(createSchema.safeParse({...plan, actor:scope.actor}).success,false)
  assert.equal(createSchema.safeParse({...plan, blocks:[{kind:'table', rows:[['a','b'],['c']]}]}).success,false)
})
test('human template creation needs project edit access but no AI capability', async () => {
  const f = fixture()
  await f.service.create({ actor: scope.actor, projectId: scope.projectId }, plan, true)
  assert.equal(f.calls.auth, 0)
  f.state.canWrite=false
  await assert.rejects(f.service.create({ actor: scope.actor, projectId: scope.projectId }, {...plan,operationId:id(13)},true),/readonly/)
})
test('export cards reopen the original and download the immutable version', async () => {
  const f=fixture(true), created=await f.service.create(scope,plan)
  const exported=await f.service.export(scope,{filePath:created.filePath,expectedRevision:created.revision})
  const card=await f.service.exportCard(scope,exported)
  assert.equal(card.open.projectId,scope.projectId)
  assert.equal(card.open.selectionId,id(20))
  assert.equal(card.content[0].files[0].file.targetId,id(22))
  assert.ok(f.storage.get(created.filePath).equals(f.storage.get(exported.filePath)))
  assert.ok(parseResourceCard(card))
})
test('Assistant capability is discoverable, idempotent and installs native file tools', async () => {
  const capability=new DocxFileCapability(),draft={team:{agent:{key:'Agent_Main'}},nodes:[{type:'agent',key:'Agent_Main',position:{x:0,y:0},entity:{key:'Agent_Main',prompt:'Preserve me'}}],connections:[]}
  assert.equal(capability.supportsQuickCreation,true)
  assert.ok(capability.requiredModelFeatures.includes(ModelFeature.TOOL_CALL))
  await capability.apply({draft}); await capability.apply({draft})
  assert.equal(capability.isEnabled(draft),true)
  const middleware=new DocxFileMiddleware({})
  const tools=middleware.createMiddleware({}, {tenantId:scope.actor.tenantId,organizationId:scope.actor.organizationId,userId:scope.actor.userId,projectId:scope.projectId,xpertId:scope.assistantId}).tools
  assert.deepEqual(tools.map(t=>t.name),['docx_file_templates','docx_file_create','docx_file_inspect','docx_file_apply','docx_file_fill_template','docx_file_export'])
})
