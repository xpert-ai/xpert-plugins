import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SpaceSubpages } from '../src/subpages.js'
import { SpaceItem } from '../src/entities.js'
import { contentHash } from '../src/documents.js'
const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'writer' }
const input = { actor, projectId: 'project', assistantId: 'assistant', sourceResourceId: 'parent', title: '设计说明', requestId: 'ab234567-1234-4234-8234-123456789abc' }
function setup() {
  const space = { id: 'space', projectId: 'project' }
  const rows = new Map<string, SpaceItem>([['parent', Object.assign(new SpaceItem(), { id: 'parent', ...actor,
    spaceId: 'space', filePath: '产品/方案.md', parentId: 'folder', kind: 'page', title: '方案', editorKey: 'markdown.tiptap' })]])
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
  const access = { items, resource: async (scope: typeof actor & { projectId: string }, id: string, operation: string) => {
    if (scope.projectId !== 'project' || scope.userId === 'outsider' || (operation === 'write' && scope.userId === 'reader')) throw new Error('spaces.access_denied')
    const item = rows.get(id)
    if (!item || item.deleted) throw new Error('spaces.access_denied')
    return { space, item, canWrite: scope.userId !== 'reader' }
  } }
  const documents = { api: () => ({ read: async ({ path }: { path: string }) => {
    const buffer = files.get(path); if (!buffer) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    return { buffer, sha256: contentHash(buffer) }
  }, write: async ({ path, buffer }: { path: string; buffer: Buffer }) => {
    assert.ok(!files.has(path)); writes++; files.set(path, buffer); return { sha256: contentHash(buffer) }
  } }), content: () => ({ register: async () => { registrations++; if (fail) { fail = false; throw new Error('publication interrupted') } } }) }
  const service = new SpaceSubpages(access as never, documents as never, { initializePage: async (_: object, id: string) => { rows.get(id)!.artifactId = id } } as never)
  return { service, rows, files, writes: () => writes, registrations: () => registrations, fail: () => { fail = true } }
}
test('duplicate/concurrent child requests share one file and preserve independent folder and page parents', async () => {
  const fixture = setup()
  const result = await Promise.all([fixture.service.createChild(input), fixture.service.createChild(input)])
  assert.deepEqual(result[0], result[1]); assert.equal(fixture.writes(), 1); assert.equal(fixture.registrations(), 1)
  const child = fixture.rows.get(input.requestId)!
  assert.equal(child.parentPageId, 'parent'); assert.equal(child.parentId, 'folder')
  assert.match(child.filePath!, /^产品\/设计说明--/u)
  child.title = '重命名后'; assert.deepEqual(await fixture.service.createChild(input), result[0])
})
test('publication failure resumes the original file, without duplicate writes', async () => {
  const fixture = setup(); fixture.fail()
  await assert.rejects(() => fixture.service.createChild(input), /interrupted/u)
  await fixture.service.createChild(input)
  assert.equal(fixture.writes(), 1); assert.equal(fixture.registrations(), 2)
})
test('read-only, outsiders, wrong projects and reused request payloads are rejected', async () => {
  const fixture = setup()
  for (const userId of ['reader', 'outsider']) await assert.rejects(() => fixture.service.createChild({ ...input, actor: { ...actor, userId } }))
  await assert.rejects(() => fixture.service.createChild({ ...input, projectId: 'other' }))
  assert.equal(fixture.writes(), 0)
  await fixture.service.createChild(input)
  await assert.rejects(() => fixture.service.createChild({ ...input, title: 'other' }), /request_conflict/u)
  await assert.rejects(() => fixture.service.createChild({ ...input, actor: { ...actor, userId: 'other-writer' } }), /request_conflict/u)
})
test('trash hides the parent breadcrumb but keeps independently authorized child files and restores the relationship', async () => {
  const fixture = setup(); await fixture.service.createChild(input)
  assert.equal((await fixture.service.hierarchy(input)).children.length, 1)
  const child = { ...input, sourceResourceId: input.requestId }
  assert.equal((await fixture.service.hierarchy(child)).parent?.resourceId, 'parent')
  fixture.rows.get('parent')!.deleted = true
  assert.equal((await fixture.service.hierarchy(child)).parent, null); assert.equal(fixture.files.size, 1)
  fixture.rows.get('parent')!.deleted = false
  assert.equal((await fixture.service.hierarchy(child)).parent?.resourceId, 'parent')
  fixture.rows.get(input.requestId)!.deleted = true
  assert.equal((await fixture.service.hierarchy(input)).children.length, 0)
})
test('external changes during interrupted creation are preserved instead of overwritten', async () => {
  const fixture = setup(); fixture.fail()
  await assert.rejects(() => fixture.service.createChild(input))
  const path = fixture.rows.get(input.requestId)!.filePath!
  fixture.files.set(path, Buffer.from('外部修改'))
  await assert.rejects(() => fixture.service.createChild(input), /file_conflict/u)
  assert.equal(fixture.files.get(path)!.toString(), '外部修改')
})
test('hierarchy allows level 32 but rejects level 33 before writing a file', async () => {
  const fixture = setup()
  let parent = fixture.rows.get('parent')!
  for (let level = 2; level <= 31; level++) {
    const next = Object.assign(new SpaceItem(), parent, { id: `level-${level}`, parentPageId: parent.id })
    fixture.rows.set(next.id, next); parent = next
  }
  await fixture.service.createChild({ ...input, sourceResourceId: parent.id })
  await assert.rejects(() => fixture.service.createChild({ ...input, sourceResourceId: input.requestId,
    requestId: 'ab234567-1234-4234-8234-123456789abd' }), /page_depth/u)
  assert.equal(fixture.writes(), 1)
})
