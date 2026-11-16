jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  ProjectAccessRuntimeCapability: 'access', ProjectFilesRuntimeCapability: 'files', ContentResourcesRuntimeCapability: 'catalog',
  XPERT_RUNTIME_CAPABILITIES_TOKEN: 'runtime'
}))
import { createHash, randomUUID } from 'node:crypto'
import { OfficeDocument, OfficeOperation, OfficeSnapshot } from '../entities/index.js'
import { OfficeWorkbookService } from './service.js'
import { blankWorkbook, WORKBOOK_MODEL } from './model.js'
import { fromUniver } from './univer-adapter.js'
import type { WorkbookSubmission, WorkbookOperation } from './core.js'

/** Transaction/ACL test double, not a database or installed-platform acceptance.
 * Serial transactions let tests exercise the actual shared service writer. */
function fixture() {
  const scope = { actor: { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }, projectId: randomUUID(), assistantId: randomUUID() }
  const id = randomUUID()
  const snapshots: OfficeSnapshot[] = [{ id: randomUUID(), documentId: id, versionNumber: 1,
    snapshot: blankWorkbook(id, 'Budget'), ...scope.actor, projectId: scope.projectId }]
  let document: OfficeDocument = { id, title: 'Budget', documentType: 'spreadsheet', status: 'active',
    contentModel: WORKBOOK_MODEL.modelId, currentVersionNumber: 1, currentSnapshotId: snapshots[0].id,
    ...scope.actor, projectId: scope.projectId }
  const operations: OfficeOperation[] = [], files = new Map<string, Buffer>()
  let writable = true, readable = true, queue: Promise<unknown> = Promise.resolve()
  const documents = {
    findOne: jest.fn(async () => readable ? { ...document } : null),
    save: jest.fn(async (value: OfficeDocument) => { document = { ...value }; return document })
  }
  const history = {
    findOneBy: jest.fn(async (where: Partial<OfficeSnapshot>) => snapshots.find(row => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value))),
    findOneByOrFail: jest.fn(async (where: Partial<OfficeSnapshot>) => {
      const row = await history.findOneBy(where); if (!row) throw new Error('missing snapshot'); return row
    }),
    find: jest.fn(async () => snapshots.filter(row => row.versionNumber > 1)),
    create: (row: OfficeSnapshot) => ({ ...row, id: randomUUID() }),
    save: jest.fn(async (row: OfficeSnapshot) => { snapshots.push(row); return row })
  }
  const journal = {
    findOneBy: jest.fn(async (where: Partial<OfficeOperation>) => operations.find(row => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value))),
    create: (row: OfficeOperation) => ({ ...row, id: randomUUID() }),
    save: jest.fn(async (row: OfficeOperation) => { operations.push(row); return row })
  }
  const manager = {
    connection: {},
    getRepository(entity: typeof OfficeDocument | typeof OfficeSnapshot | typeof OfficeOperation) {
      return entity === OfficeDocument ? documents : entity === OfficeSnapshot ? history : journal
    },
    transaction<T>(callback: (value: typeof manager) => Promise<T>): Promise<T> {
      const result = queue.then(() => callback(manager)); queue = result.catch(() => undefined); return result
    }
  }
  const runtime = { get: () => undefined, require(key: string) {
    if (key === 'access') return {
      assertAssistant: async () => { if (!readable) throw new Error('denied'); return { role: writable ? 'editor' : 'viewer', archived: false } },
      assertEdit: async () => { if (!writable) throw new Error('denied') }, assertManage: async () => { if (!writable) throw new Error('denied') }
    }
    if (key === 'files') return { mkdir: async () => undefined,
      read: async ({ path }: { path: string }) => {
        const buffer = files.get(path); if (!buffer) throw new Error('missing file')
        return { buffer, sha256: createHash('sha256').update(buffer).digest('hex') }
      },
      write: async ({ path, buffer, expectedHash }: { path: string; buffer: Buffer; expectedHash: string | null }) => {
        const prior = files.get(path), hash = prior ? createHash('sha256').update(prior).digest('hex') : null
        if (hash !== expectedHash) throw new Error('file conflict')
        files.set(path, buffer)
      } }
    return { catalog: { register: async () => undefined } }
  } }
  const service = new OfficeWorkbookService({ ...documents, manager } as never, runtime as never)
  return { service, id, scope, snapshots, operations, files, history,
    revoke() { readable = false; writable = false }, readOnly() { writable = false }, head: () => document }
}
const cell = (column: number, value: number): WorkbookOperation => ({ kind: 'set_cell', sheetId: 'sheet-1', row: 0, column,
  cell: { value, extensions: { t: 2 } } })
const submission = (operations: WorkbookOperation[], baseRevision = 1): WorkbookSubmission => ({
  protocol: 'xpert.workbook.operations@1', requestId: randomUUID(), baseRevision, operations })

it('commits structural protocol v2 through the same writer and replays rebased cell coordinates', async () => {
  const f = fixture()
  const structural = (baseRevision: number): WorkbookSubmission => {
    const requestId = randomUUID()
    return { protocol: 'xpert.workbook.operations@2', requestId, baseRevision, operations: [{ kind: 'transform_structure', identitySeed: requestId,
      operation: { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'rows', index: 0, count: 1 } }] }
  }
  const upgrade = structural(1)
  const v2 = await f.service.submit(f.scope, f.id, upgrade)
  expect(v2.workbook.schemaVersion).toBe(2)
  expect(v2.operationProtocol).toBe('xpert.workbook.operations@2')
  expect((await f.service.submit(f.scope, f.id, upgrade)).replayed).toBe(true)
  await expect(f.service.submit(f.scope, f.id, submission([cell(0, 10)], 2))).rejects.toThrow('office.workbook_protocol_upgrade_required')
  await f.service.submit(f.scope, f.id, structural(2))
  f.history.find.mockImplementation(async () => f.snapshots.filter(row => row.versionNumber > 2))
  const intent = { ...submission([cell(0, 10)], 2), protocol: 'xpert.workbook.operations@2' as const }
  const result = await f.service.submit(f.scope, f.id, intent)
  expect(result.workbook.sheets['sheet-1'].cells['1:0'].value).toBe(10)
  expect(f.operations.at(-1)?.result).toMatchObject({ baseRevision: 2, appliedBaseRevision: 3, operations: [{ kind: 'set_cell', row: 1 }] })
  expect((await f.service.submit(f.scope, f.id, intent)).replayed).toBe(true)
  const restored = await f.service.restore(f.scope, f.id, 1, result.revision, randomUUID())
  expect(restored.workbook.schemaVersion).toBe(2)
  expect(restored.revision).toBe('5')
  const old = blankWorkbook(f.id, 'Budget')
  await expect(f.service.save(f.scope, f.id, '5', old, randomUUID())).rejects.toThrow('office.workbook_protocol_upgrade_required')
})

it('serializes two people plus Agent; stores canonical snapshots and replayable operations', async () => {
  const f = fixture(), second = { ...f.scope, actor: { ...f.scope.actor, userId: randomUUID() } }
  await Promise.all([
    f.service.submit(f.scope, f.id, submission([cell(0, 10)])),
    f.service.submit(second, f.id, submission([cell(1, 20)])),
    f.service.edit(f.scope, f.id, '1', [{ type: 'set_range_formulas', sheetName: 'Sheet1', range: 'C1', formulas: [['=A1+B1']] }], randomUUID())
  ])
  const result = await f.service.read(f.scope, f.id)
  expect(result.revision).toBe('4')
  expect(result.workbook.sheets['sheet-1'].cells).toMatchObject({ '0:0': { value: 10 }, '0:1': { value: 20 }, '0:2': { formula: '=A1+B1' } })
  expect(f.operations).toHaveLength(3)
  expect(f.snapshots[3].snapshot).toMatchObject({ format: 'xpert.workbook', schemaVersion: 1 })
  expect(f.operations[2].result).toMatchObject({ protocol: 'xpert.workbook.operations@1', baseRevision: 1 })
})
it('retries a lost acknowledgement without another write and binds the id to intent and actor', async () => {
  const f = fixture(), input = submission([cell(0, 10)])
  await f.service.submit(f.scope, f.id, input)
  const retry = await f.service.submit(f.scope, f.id, input)
  expect(retry).toMatchObject({ appliedRevision: 2, replayed: true, revision: '2' })
  expect(f.snapshots).toHaveLength(2)
  await expect(f.service.submit(f.scope, f.id, { ...input, operations: [cell(0, 20)] })).rejects.toThrow('office.request_conflict')
  await expect(f.service.submit({ ...f.scope, actor: { ...f.scope.actor, userId: randomUUID() } }, f.id, input)).rejects.toThrow('office.request_conflict')
})
it('Agent sheet creation produces stable IDs across a lost response retry', async () => {
  const f = fixture(), requestId = randomUUID()
  const operations = [{ type: 'create_sheet' as const, sheetName: 'Summary' }]
  await f.service.edit(f.scope, f.id, '1', operations, requestId)
  await f.service.edit(f.scope, f.id, '1', operations, requestId)
  expect(f.snapshots).toHaveLength(2)
  expect((await f.service.read(f.scope, f.id)).workbook.order).toHaveLength(2)
})
it('routes an Agent sheet rename through checked structural protocol and binds its retry identity', async () => {
  const f = fixture(), key = 'agent-rename-request'
  const operations = [{ type: 'rename_sheet' as const, sheetName: 'Sheet1', newSheetName: 'Sales' }]
  const first = await f.service.edit(f.scope, f.id, '1', operations, key)
  expect(first.workbook.schemaVersion).toBe(2)
  expect(first.workbook.sheets['sheet-1'].title).toBe('Sales')
  expect((await f.service.edit(f.scope, f.id, '1', operations, key)).replayed).toBe(true)
  expect(f.snapshots).toHaveLength(2)
  await expect(f.service.edit(f.scope, f.id, '1', [{ ...operations[0], newSheetName: 'Different' }], key)).rejects.toThrow('office.request_conflict')
})
it('rejects same-cell and future/stale structural writes without changing the head', async () => {
  const f = fixture()
  await f.service.submit(f.scope, f.id, submission([cell(0, 10)]))
  await expect(f.service.submit(f.scope, f.id, submission([cell(0, 20)]))).rejects.toThrow('office.version_conflict')
  await expect(f.service.submit(f.scope, f.id, submission([cell(1, 20)], 3))).rejects.toThrow('office.version_conflict')
  const structure = fromUniver(blankWorkbook(f.id, 'Renamed'))
  await expect(f.service.submit(f.scope, f.id, submission([{ kind: 'replace_structure', workbook: structure }]))).rejects.toThrow('office.version_conflict')
  expect(f.head().currentVersionNumber).toBe(2)
})
it('restores as a new revision and blocks stale writers across restore, including equal contents', async () => {
  const f = fixture()
  await f.service.submit(f.scope, f.id, submission([cell(0, 10)]))
  const requestId = randomUUID()
  expect((await f.service.previewRevision(f.scope, f.id, 1)).workbook.sheets['sheet-1'].cells).toEqual({})
  expect(f.head().currentVersionNumber).toBe(2)
  await f.service.restore(f.scope, f.id, 1, '2', requestId)
  await f.service.restore(f.scope, f.id, 1, '2', requestId)
  await expect(f.service.restore({ ...f.scope, actor: { ...f.scope.actor, userId: 'other-user' } }, f.id, 1, '2', requestId)).rejects.toThrow('office.request_conflict')
  expect((await f.service.read(f.scope, f.id)).workbook.sheets['sheet-1'].cells).toEqual({})
  await expect(f.service.submit(f.scope, f.id, submission([cell(1, 20)]))).rejects.toThrow('office.version_conflict')
  expect(f.head().currentVersionNumber).toBe(3)
})
it('keeps old snapshot saves strict CAS and denies writes after revocation, including retries', async () => {
  const f = fixture(), input = submission([cell(0, 10)])
  await f.service.submit(f.scope, f.id, input)
  await expect(f.service.save(f.scope, f.id, '1', blankWorkbook(f.id, 'Budget'), randomUUID())).rejects.toThrow('office.version_conflict')
  f.readOnly()
  await expect(f.service.submit(f.scope, f.id, input)).rejects.toThrow('denied')
  f.revoke()
  await expect(f.service.read(f.scope, f.id)).rejects.toThrow('denied')
  await expect(f.service.history(f.scope, f.id)).rejects.toThrow('denied')
  await expect(f.service.previewRevision(f.scope, f.id, 1)).rejects.toThrow('denied')
  expect(f.head().currentVersionNumber).toBe(2)
})
it('imports a reviewable draft without writing and exports only the requested persisted revision', async () => {
  const f = fixture()
  const draft = await f.service.importDraft(f.scope, f.id, '1', 'budget.csv', Buffer.from('9007199254740993.0001'))
  expect(draft.snapshot.sheets[draft.snapshot.sheetOrder[0]].cellData[0][0]?.v).toBe('9007199254740993.0001')
  expect(f.snapshots).toHaveLength(1)
  expect(f.operations).toHaveLength(0)
  expect(f.files.size).toBe(0)
  await f.service.save(f.scope, f.id, '1', draft.snapshot, randomUUID())
  const exported = await f.service.exportFile(f.scope, f.id, '2', 'csv')
  expect(Buffer.from(exported.base64, 'base64').toString()).toContain('9007199254740993.0001')
  await expect(f.service.exportFile(f.scope, f.id, '1', 'csv')).rejects.toThrow('office.version_conflict')
  await expect(f.service.importDraft(f.scope, f.id, '1', 'budget.csv', Buffer.from('stale'))).rejects.toThrow('office.version_conflict')
  f.readOnly()
  await expect(f.service.importDraft(f.scope, f.id, '2', 'budget.csv', Buffer.from('denied'))).rejects.toThrow('denied')
  await expect(f.service.exportFile(f.scope, f.id, '2', 'xlsx')).resolves.toMatchObject({ revision: '2' })
  f.revoke()
  await expect(f.service.exportFile(f.scope, f.id, '2', 'csv')).rejects.toThrow('denied')
  expect(f.head().currentVersionNumber).toBe(2)
})

it('selectively undoes own committed cells, preserves another actor and replays a lost response once', async () => {
  const f = fixture(), second = { ...f.scope, actor: { ...f.scope.actor, userId: randomUUID() } }
  await f.service.submit(f.scope, f.id, submission([cell(0, 10)]))
  await f.service.submit(second, f.id, submission([cell(1, 20)]))
  f.history.find.mockImplementation(async () => f.snapshots.filter(row => row.versionNumber > 2))
  const requestId = randomUUID()
  const result = await f.service.undo(f.scope, f.id, 2, requestId)
  expect(result.revision).toBe('4')
  expect(result.workbook.sheets['sheet-1'].cells['0:0']).toBeUndefined()
  expect(result.workbook.sheets['sheet-1'].cells['0:1'].value).toBe(20)
  expect(f.operations.at(-1)?.result).toMatchObject({ undoOfRevision: 2, revision: 4 })
  await expect(f.service.undo(f.scope, f.id, 2, requestId)).resolves.toMatchObject({ revision: '4', replayed: true })
  await expect(f.service.undo(f.scope, f.id, 2, randomUUID())).rejects.toThrow('office.version_conflict')
  await expect(f.service.undo(f.scope, f.id, 3, requestId)).rejects.toThrow('office.workbook_undo_unavailable')
  f.revoke()
  await expect(f.service.undo(f.scope, f.id, 2, requestId)).rejects.toThrow('denied')
})
it('refuses selective undo across later same-cell changes, including ABA', async () => {
  const f = fixture()
  await f.service.submit(f.scope, f.id, submission([cell(0, 10)]))
  await f.service.submit(f.scope, f.id, submission([cell(0, 20)], 2))
  await f.service.submit(f.scope, f.id, submission([cell(0, 10)], 3))
  f.history.find.mockImplementation(async () => f.snapshots.filter(row => row.versionNumber > 2))
  await expect(f.service.undo(f.scope, f.id, 2, randomUUID())).rejects.toThrow('office.version_conflict')
  expect(f.head().currentVersionNumber).toBe(4)
})
it('rejects structural and legacy revisions as selective undo targets', async () => {
  const f = fixture()
  await f.service.save(f.scope, f.id, '1', blankWorkbook(f.id, 'Renamed'), randomUUID())
  await expect(f.service.undo(f.scope, f.id, 2, randomUUID())).rejects.toThrow('office.workbook_undo_unavailable')
  const next = (await f.service.read(f.scope, f.id)).workbook; next.title = 'Other title'
  await f.service.submit(f.scope, f.id, submission([{ kind: 'replace_structure', workbook: next }], 2))
  await expect(f.service.undo(f.scope, f.id, 3, randomUUID())).rejects.toThrow('office.workbook_undo_unavailable')
})

it('repairs missing and corrupted projections from the DB head while quarantining prior bytes', async () => {
  const f = fixture()
  await f.service.submit(f.scope, f.id, submission([cell(0, 10)]))
  const path = f.head().sourceSnapshotPath!, original = f.files.get(path)!
  f.files.delete(path)
  await f.service.reconcile(f.scope, f.id)
  expect(f.files.get(path)).toEqual(original)
  const corrupt = Buffer.from('damaged projection')
  f.files.set(path, corrupt)
  await f.service.reconcile(f.scope, f.id)
  expect(f.files.get(path)).toEqual(original)
  expect([...f.files.entries()].some(([name, bytes]) => name.includes('/quarantine/') && bytes.equals(corrupt))).toBe(true)
  expect(f.head().currentVersionNumber).toBe(2)
  expect(f.snapshots).toHaveLength(2)
  f.revoke()
  await expect(f.service.reconcile(f.scope, f.id)).rejects.toThrow('denied')
})
