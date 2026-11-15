import { readWorkbookChanges } from './changes.js'
import { OfficeSnapshot, OfficeOperation } from '../entities/index.js'

function fixture(count = 2) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `s-${i + 2}`, versionNumber: i + 2, changeSummary: 'xpert.workbook.operations@1' }))
  const operations = rows.map(row => ({ snapshotId: row.id, result: { protocol: 'xpert.workbook.operations@1', revision: row.versionNumber,
    baseRevision: 1, operations: [{ kind: 'set_cell', sheetId: 'sheet', row: 0, column: row.versionNumber,
      cell: { value: row.versionNumber, extensions: {} } }] } }))
  const snapshots = { find: jest.fn(async () => rows) }, journal = { find: jest.fn(async () => operations) }
  const repository = { manager: { getRepository: (entity: unknown) => entity === OfficeSnapshot ? snapshots : entity === OfficeOperation ? journal : null } }
  const scope = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }, projectId: 'project' }
  const document = { id: 'book', currentVersionNumber: count + 1, title: 'Budget', sourceSnapshotPath: 'v3.json', sourceSnapshotHash: 'hash' }
  return { rows, operations, repository, scope, document, snapshots, journal,
    read: () => readWorkbookChanges(repository as never, scope, document as never, 1) }
}
it('returns contiguous bounded operations from scoped committed snapshots', async () => {
  const f = fixture(), result = await f.read()
  expect(result).toMatchObject({ reset: false, revision: 3, cursor: 3, more: false, items: [{ revision: 2 }, { revision: 3 }] })
  expect(f.snapshots.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50, where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org', projectId: 'project' }) }))
})
it.each(['restore', 'missing', 'receipt'])('requests a fresh snapshot for %s instead of guessing a delta', async kind => {
  const f = fixture()
  if (kind === 'restore') f.rows[0].changeSummary = 'restore'
  if (kind === 'missing') f.rows.shift()
  if (kind === 'receipt') f.operations[0].result.revision = 99
  expect(await f.read()).toEqual({ reset: true, revision: 3 })
})
it('bounds outdated cursors and response size', async () => {
  const f = fixture(); f.document.currentVersionNumber = 102
  expect(await f.read()).toEqual({ reset: true, revision: 102 })
  expect(f.snapshots.find).not.toHaveBeenCalled()
})
