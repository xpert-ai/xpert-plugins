import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SpaceImports, literalMarkdown } from '../src/imports.js'
import { SpaceItem } from '../src/entities.js'
import { contentHash } from '../src/documents.js'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'writer', projectId: 'project', assistantId: 'assistant' }
const content = '# 远端标题\n<script>example</script>\n[链接](javascript:bad)'
const input = { bindingId: 'binding', locator: 'remote-doc', spaceId: 'space', parentId: 'folder', requestId: 'ab234567-1234-4234-8234-123456789abc', expectedRevision: '5', expectedHash: contentHash(Buffer.from(content)), confirmed: true as const }
function setup() {
  const space = { id: 'space', projectId: 'project' }
  const rows = new Map<string, SpaceItem>([['folder', Object.assign(new SpaceItem(), { id: 'folder', ...actor, spaceId: 'space', filePath: '产品', kind: 'folder', title: '产品' })]])
  const files = new Map<string, Buffer>(); let writes = 0, registrations = 0, fail = false
  const match = (row: SpaceItem, where: object) => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)
  let locked = Promise.resolve()
  const items = {
    findOneBy: async (where: object) => [...rows.values()].find((row) => match(row, where)) ?? null,
    find: async ({ where }: { where: object }) => [...rows.values()].filter((row) => match(row, where)),
    create: (row: object) => Object.assign(new SpaceItem(), { deleted: false }, row),
    save: async (row: SpaceItem) => { rows.set(row.id, row); return row },
    update: async (id: string, value: object) => { Object.assign(rows.get(id)!, value) },
    manager: { transaction: async <T>(work: (manager: object) => Promise<T>) => {
      const previous = locked; let unlock = () => {}; locked = new Promise<void>((resolve) => { unlock = resolve }); await previous
      try { return await work({ getRepository: () => ({ findOneOrFail: async () => space }) }) } finally { unlock() }
    } }
  }
  const access = { items, project: async (scope: typeof actor, _projectId: string, operation: string) => { if (scope.userId === 'outsider' || (operation === 'write' && scope.userId === 'reader')) throw new Error('spaces.access_denied') }, resource: async (scope: typeof actor & { projectId: string }, id: string, operation: string) => {
    if (scope.projectId !== 'project' || scope.userId === 'outsider' || (operation === 'write' && scope.userId === 'reader')) throw new Error('spaces.access_denied')
    const item = rows.get(id)
    if ((!item && id !== 'space') || item?.deleted) throw new Error('spaces.access_denied')
    return { space, item, canWrite: scope.userId !== 'reader' }
  } }
  const documents = { api: () => ({ read: async ({ path }: { path: string }) => {
    const buffer = files.get(path); if (!buffer) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { buffer, sha256: contentHash(buffer) }
  }, write: async ({ path, buffer }: { path: string; buffer: Buffer }) => {
    assert.ok(!files.has(path)); writes++; files.set(path, buffer); return { sha256: contentHash(buffer) }
  } }), content: () => ({ validateImport: async () => undefined, register: async () => { registrations++; if (fail) { fail = false; throw new Error('publication interrupted') } } }) }
  let revision = '5', revoked = false
  const source = { id: 'remote-doc', title: '导入文档', url: 'https://team.feishu.cn/docx/doxcn1234567890', type: 'document', revision: '5',
    contentHash: contentHash(Buffer.from(content)), content, format: 'text/plain', warnings: ['纯文本副本'] }
  const api = { sources: async () => ({ items: revoked ? [] : [{ bindingId: 'binding', available: true, provider: 'lark' }] }), read: async () => ({ ...source, revision }) }
  const service = new SpaceImports(access as never, documents as never, { initializePage: async (_: object, id: string) => { rows.get(id)!.artifactId = id } } as never, { require: () => api } as never)
  return { service, rows, files, writes: () => writes, registrations: () => registrations, fail: () => { fail = true }, changed: () => { revision = '6' }, revoke: () => { revoked = true } }
}
test('concurrent import retries create one project file and preserve immutable origin metadata', async () => {
  const f = setup(); const receipts = await Promise.all([f.service.apply(actor, input), f.service.apply(actor, input)])
  assert.deepEqual(receipts[0], receipts[1]); assert.equal(f.writes(), 1); assert.equal(f.registrations(), 1)
  const item = f.rows.get(input.requestId)!; assert.equal(item.importOrigin?.provider, 'lark'); assert.equal(item.parentId, 'folder')
  assert.equal(item.importOrigin?.contentHash, input.expectedHash)
  assert.ok(f.files.get(item.filePath!)!.toString().includes(literalMarkdown(content)))
  f.changed(); f.revoke(); item.title = '本地已修改'; assert.deepEqual(await f.service.apply(actor, input), receipts[0])
})
test('previewed revision and source authorization are rechecked before writing', async () => {
  const changed = setup(); changed.changed(); await assert.rejects(() => changed.service.apply(actor, input), /source_changed/u); assert.equal(changed.writes(), 0)
  const revoked = setup(); revoked.revoke(); await assert.rejects(() => revoked.service.apply(actor, input), /access_denied/u); assert.equal(revoked.writes(), 0)
})
test('read-only and cross-project users cannot import and request reuse is bound to its creator and destination', async () => {
  const f = setup()
  for (const userId of ['reader', 'outsider']) await assert.rejects(() => f.service.apply({ ...actor, userId }, input))
  await assert.rejects(() => f.service.apply({ ...actor, projectId: 'other' }, input)); assert.equal(f.writes(), 0)
  await f.service.apply(actor, input)
  await assert.rejects(() => f.service.apply({ ...actor, userId: 'other-editor' }, input), /request_conflict/u)
  await assert.rejects(() => f.service.apply(actor, { ...input, expectedRevision: 'other' }), /request_conflict/u)
})
test('interrupted publication resumes without duplicating files; foreign file edits are preserved', async () => {
  const f = setup(); f.fail(); await assert.rejects(() => f.service.apply(actor, input), /interrupted/u)
  await f.service.apply(actor, input); assert.equal(f.writes(), 1); assert.equal(f.registrations(), 2)
  const g = setup(); g.fail(); await assert.rejects(() => g.service.apply(actor, input))
  const path = g.rows.get(input.requestId)!.filePath!; g.files.set(path, Buffer.from('外部修改'))
  await assert.rejects(() => g.service.apply(actor, input), /file_conflict/u); assert.equal(g.files.get(path)!.toString(), '外部修改')
})
// Cross-plugin contract: imported text must be accepted by the actual Tiptap model without activating markup.
test('imported literal text survives the actual Markdown editor model', async () => {
  const { MarkdownDocumentModel } = await import('../../markdown-editor/src/model.js')
  const model = new MarkdownDocumentModel()
  const original = '# heading\n<script>alert(1)</script>\n[bad](javascript:alert)\n![image](https://example.test/x)\n$x^2$'
  const state = model.read(model.initialize(literalMarkdown(original)))
  assert.ok(state.blocks.every((block) => block.type === 'paragraph'))
  assert.equal(state.blocks.map((block) => block.text).join('\n'), original)
})
