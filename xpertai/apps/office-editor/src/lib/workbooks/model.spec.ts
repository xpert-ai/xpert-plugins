import { randomUUID } from 'node:crypto'
import { blankWorkbook, parseWorkbook, workbookText } from './model.js'
import { boundedRange, editWorkbook, readWorkbookRange } from './operations.js'

describe('Native Project workbook model and AI operations', () => {
  it('preserves native formatting, opaque resources and unaffected cells without XLSX conversion', () => {
    const book = blankWorkbook(randomUUID(), '季度预算')
    book.styles = { currency: { n: { pattern: '$0.00' } } }
    book.resources = [{ name: 'opaque-plugin-state', data: 'do not rewrite' }]
    book.sheets['sheet-1'].cellData = { '0': { '0': { v: 7, s: 'currency' }, '1': { v: '保留' } } }
    const next = editWorkbook(book, [
      { type: 'set_range_values', sheetName: 'Sheet1', range: 'A1', values: [[42]] },
      { type: 'set_range_formulas', sheetName: 'Sheet1', range: 'A2', formulas: [['=A1*2']] },
      { type: 'create_sheet', sheetName: '计划' }
    ])
    expect(next.styles).toEqual(book.styles)
    expect(next.resources).toEqual(book.resources)
    expect(next.sheets['sheet-1'].cellData['0']).toEqual({ '0': { v: 42, t: 2, s: 'currency' }, '1': { v: '保留' } })
    expect(readWorkbookRange(next, 'Sheet1', 'A1:A2').rows).toEqual([[{ value: 42, formula: null }], [{ value: null, formula: '=A1*2' }]])
    expect(next.sheetOrder).toHaveLength(2)
    expect(book.sheets['sheet-1'].cellData['0']['0']?.v).toBe(7)
    expect(parseWorkbook(next, book.id)).toEqual(next)
  })
  it('rejects malformed identities, unbounded ranges and shape mismatch before changing input', () => {
    const book = blankWorkbook(randomUUID(), 'Workbook')
    expect(() => parseWorkbook(book, randomUUID())).toThrow('office.workbook_invalid')
    expect(() => parseWorkbook({ ...book, sheetOrder: ['missing'] })).toThrow()
    for (const range of ['A0', 'A1:XFD1048576', 'A2:A1', 'XFE1', 'A1048577', 'Sheet1!A1']) expect(() => boundedRange(range)).toThrow()
    expect(() => editWorkbook(book, [{ type: 'set_range_values', sheetName: 'Sheet1', range: 'A1:B2', values: [[1]] }])).toThrow('office.workbook_range_size')
    expect(book.sheets['sheet-1'].cellData).toEqual({})
  })
  it('does not approximate structural or grouped-formula edits on the server', () => {
    const book = blankWorkbook(randomUUID(), 'Workbook')
    expect(() => editWorkbook(book, [{ type: 'rename_sheet', sheetName: 'Sheet1', newSheetName: 'Renamed' }])).toThrow('office.workbook_structure_use_editor')
    book.sheets['sheet-1'].cellData = { '0': { '0': { f: '=A2', si: 'shared-group' } } }
    expect(() => editWorkbook(book, [{ type: 'clear_range', sheetName: 'Sheet1', range: 'A1' }])).toThrow('office.workbook_formula_use_editor')
  })
  it('rejects unsupported workbook model versions and extracts formulas without fabricating results', () => {
    const book = blankWorkbook(randomUUID(), 'Workbook')
    expect(() => parseWorkbook({ ...book, appVersion: 'future-incompatible' })).toThrow()
    book.sheets['sheet-1'].cellData = { '0': { '0': { f: '=1+2' }, '1': { v: '中文内容' } } }
    expect(workbookText(book)[0].text).toContain('=1+2\n中文内容')
    expect(readWorkbookRange(book, 'Sheet1', 'A1').rows![0][0].value).toBeNull()
  })
})
