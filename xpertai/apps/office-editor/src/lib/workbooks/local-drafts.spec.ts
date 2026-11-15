jest.mock('../../../remote-file/bridge', () => ({ command: jest.fn() }))
import { randomUUID } from 'node:crypto'
import { command } from '../../../remote-file/bridge'
import { createWorkbookDrafts, localWorkbookDraft } from '../../../remote-workbook/local-drafts'
import { blankWorkbook } from './model.js'
import { fromUniver } from './univer-adapter.js'
const documentId = randomUUID(), base = fromUniver(blankWorkbook(documentId, 'Draft'))
const record = () => ({ format: 'xpert.workbook.local-draft@1' as const, documentId, baseRevision: 1, base, draft: base })
const call = jest.mocked(command)
beforeEach(() => call.mockReset())
it('serializes durable writes so older acknowledgements cannot advance a newer draft', async () => {
  const ids: string[] = [], revisions: number[] = []
  call.mockImplementation(async (_key, input) => {
    const value = input as { draftId: string; expectedRevision: number }
    ids.push(value.draftId); revisions.push(value.expectedRevision)
    return { success: true, data: { draftId: value.draftId, revision: value.expectedRevision + 1, bytes: 10, updatedAt: 1 } }
  })
  const drafts = createWorkbookDrafts(documentId)
  await Promise.all([drafts.persist(record()), drafts.persist(record())])
  expect(ids[0]).toBe(ids[1]); expect(revisions).toEqual([0, 1])
})
it('forks on a competing tab CAS conflict without replacing the other draft', async () => {
  call.mockRejectedValueOnce(new Error('local_draft.conflict')).mockImplementation(async (_key, input) => {
    const value = input as { draftId: string }
    return { success: true, data: { draftId: value.draftId, revision: 1, bytes: 10, updatedAt: 1 } }
  })
  await createWorkbookDrafts(documentId).persist(record())
  const first = call.mock.calls[0][1] as { draftId: string }, second = call.mock.calls[1][1] as { draftId: string; expectedRevision: number }
  expect(second.draftId).not.toBe(first.draftId); expect(second.expectedRevision).toBe(0)
})
it('keeps a pending submission unchanged when the draft is written again', async () => {
  const requestId = randomUUID(), sheetId = base.order[0]
  const pending = { submission: { protocol: 'xpert.workbook.operations@1' as const, requestId, baseRevision: 1,
    operations: [{ kind: 'set_cell' as const, sheetId, row: 0, column: 0, cell: { value: 9, extensions: {} } }] },
    workbook: structuredClone(base) }
  pending.workbook.sheets[sheetId].cells['0:0'] = { value: 9, extensions: {} }
  const value = { ...record(), draft: structuredClone(pending.workbook), pending }
  value.draft.sheets[sheetId].cells['0:1'] = { value: 20, extensions: {} }
  expect(localWorkbookDraft.parse(value).pending?.submission.requestId).toBe(requestId)
  const invalid = structuredClone(value); invalid.pending.workbook.sheets[sheetId].cells['0:0'].value = 10
  expect(() => localWorkbookDraft.parse(invalid)).toThrow()
})
it('does not turn quota or permission failures into additional drafts', async () => {
  call.mockRejectedValue(new Error('local_draft.limit'))
  await expect(createWorkbookDrafts(documentId).persist(record())).rejects.toThrow('limit')
  expect(call).toHaveBeenCalledTimes(1)
})
