import { randomUUID } from 'node:crypto'
import { blankWorkbook } from '../model.js'
import { fromUniver, toUniver } from '../univer-adapter.js'
import { applyWorkbookOperations, mergeWorkbookOperationResult, mergeWorkbookOperations, type WorkbookOperation } from '../core.js'

function fixture() {
  const raw = blankWorkbook(randomUUID(), 'Concurrent rows')
  raw.sheets['sheet-1'].cellData = { 0: { 0: { v: 10 } }, 1: { 0: { v: 20 }, 1: { f: '=A2*2' } } }
  return applyWorkbookOperations(fromUniver(raw), [{ kind: 'transform_structure', identitySeed: randomUUID(),
    operation: { kind: 'rename_sheet', sheetId: 'sheet-1', title: 'Data' } }])
}
const edit = (row: number, column: number, value: number): WorkbookOperation => ({ kind: 'set_cell', sheetId: 'sheet-1', row, column, cell: { value, extensions: {} } })
it('rebases stale cell/formula intents by identity and records replayable applied coordinates', () => {
  const base = fixture()
  const inserted = applyWorkbookOperations(base, [{ kind: 'transform_structure', identitySeed: randomUUID(),
    operation: { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'rows', index: 0, count: 2 } }])
  const result = mergeWorkbookOperationResult(base, [inserted], [edit(1, 0, 99),
    { kind: 'set_cell', sheetId: 'sheet-1', row: 1, column: 1, cell: { value: null, formula: '=A2*3', extensions: {} } }])
  expect(result.workbook.sheets['sheet-1'].cells['3:0'].value).toBe(99)
  expect(result.workbook.sheets['sheet-1'].cells['3:1'].formula).toBe('=A4*3')
  expect(result.operations[0]).toMatchObject({ row: 3, column: 0 })
  expect(applyWorkbookOperations(inserted, result.operations)).toEqual(result.workbook)
  expect(fromUniver(toUniver(result.workbook))).toEqual(result.workbook)
})
it('rejects deleted targets, ABA writes and stale structural commands', () => {
  const base = fixture(), inserted = applyWorkbookOperations(base, [{ kind: 'transform_structure', identitySeed: randomUUID(),
    operation: { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'rows', index: 0, count: 1 } }])
  const changed = applyWorkbookOperations(inserted, [edit(2, 0, 30)]), back = applyWorkbookOperations(changed, [edit(2, 0, 20)])
  expect(() => mergeWorkbookOperations(base, [inserted, changed, back], [edit(1, 0, 99)])).toThrow('office.version_conflict')
  const removed = applyWorkbookOperations(base, [{ kind: 'transform_structure', identitySeed: randomUUID(),
    operation: { kind: 'delete_axis', sheetId: 'sheet-1', axis: 'rows', index: 1, count: 1 } }])
  expect(() => mergeWorkbookOperations(base, [removed], [edit(1, 0, 99)])).toThrow('office.version_conflict')
  expect(() => mergeWorkbookOperations(base, [inserted], [{ kind: 'transform_structure', identitySeed: randomUUID(),
    operation: { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'rows', index: 0, count: 1 } }])).toThrow('office.version_conflict')
})
it('blocks writes crossing newly merged cells while allowing unrelated edits', () => {
  const base = fixture(), merged = applyWorkbookOperations(base, [{ kind: 'transform_structure', identitySeed: randomUUID(),
    operation: { kind: 'merge_cells', sheetId: 'sheet-1', startRow: 4, endRow: 4, startColumn: 0, endColumn: 2 } }])
  expect(() => mergeWorkbookOperations(base, [merged], [edit(4, 1, 22)])).toThrow('office.version_conflict')
  expect(mergeWorkbookOperations(base, [merged], [edit(7, 1, 22)]).sheets['sheet-1'].cells['7:1'].value).toBe(22)
})
