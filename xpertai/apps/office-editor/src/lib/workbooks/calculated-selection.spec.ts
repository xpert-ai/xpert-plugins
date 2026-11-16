import { calculatedSelectionContext, assertSelectionBasis } from './calculated-selection.js'
import { blankWorkbook } from './model.js'
const id = '163c1862-8f41-4faf-9fb2-f332cae75922'
it('keeps formula inputs separate from bounded, revision-bound browser results', () => {
  const book = blankWorkbook(id, 'Evidence'), sheet = book.sheets[book.sheetOrder[0]]
  sheet.cellData = { 0: { 0: { f: '=SUM(B1:B2)', v: 42, t: 2 }, 1: { v: '9007199254740993.001', t: 1 } } }
  const context = calculatedSelectionContext(book, { sheetId: sheet.id, startRow: 0, endRow: 0, startColumn: 0, endColumn: 1 }, '7', true, 3)
  expect(context).toMatchObject({ format: 'xpert.workbook.selection@2', calculation: {
    source: 'browser', engine: 'univer@0.25.0', baseRevision: '7', unsaved: true, draftGeneration: 3 } })
  expect(context.cells[0]).toEqual({ row: 0, column: 0, formula: '=SUM(B1:B2)', value: null, calculatedValue: 42 })
  expect(context.cells[1]).toEqual({ row: 0, column: 1, value: '9007199254740993.001' })
})
it('bounds large derived results without dropping the formula/source distinction', () => {
  const book = blankWorkbook(id, 'Large'), sheet = book.sheets[book.sheetOrder[0]]
  sheet.cellData = { 0: { 0: { f: '=REPT("文",20000)', v: '文'.repeat(20000) } } }
  const context = calculatedSelectionContext(book, { sheetId: sheet.id, startRow: 0, endRow: 0, startColumn: 0, endColumn: 0 }, '8', false, 0)
  expect(context.truncated).toBe(true)
  expect(context.cells).toEqual([{ row: 0, column: 0, omitted: true }])
  expect(Buffer.byteLength(JSON.stringify(context))).toBeLessThanOrEqual(32000)
})
it('rejects references captured across edits, remote revisions or resource changes', () => {
  const basis = { documentId: id, revision: '7', generation: 3 }
  expect(() => assertSelectionBasis(basis, { ...basis })).not.toThrow()
  for (const after of [{ ...basis, generation: 4 }, { ...basis, revision: '8' }, { ...basis, documentId: 'different' }])
    expect(() => assertSelectionBasis(basis, after)).toThrow('office.selection_changed')
})
