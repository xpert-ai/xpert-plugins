import { applyWorkbookOperations, diffWorkbook, mergeWorkbookOperations, workbookSubmission, xpertWorkbook, type WorkbookOperation } from './core.js'
import { fromUniver, toUniver } from './univer-adapter.js'

const base = () => xpertWorkbook.parse({ format: 'xpert.workbook', schemaVersion: 1,
  id: 'b19a72aa-c7e6-4695-8c81-c03665fc851a', title: 'Budget', order: ['s'], extensions: {},
  sheets: { s: { id: 's', title: 'Data', rows: 10, columns: 10, cells: {}, extensions: {} } } })
const set = (column: number, value: number): WorkbookOperation => ({ kind: 'set_cell', sheetId: 's', row: 0, column,
  cell: { value, extensions: {} } })

describe('Xpert operations without Univer runtime', () => {
  it('merges two people and an Agent from one baseline and replays the same history', () => {
    const original = base(), a = applyWorkbookOperations(original, [set(0, 10)])
    const b = mergeWorkbookOperations(original, [a], [set(1, 20)])
    const agent: WorkbookOperation = { kind: 'set_cell', sheetId: 's', row: 0, column: 2,
      cell: { value: null, formula: '=A1+B1', extensions: {} } }
    const final = mergeWorkbookOperations(original, [a, b], [agent])
    expect(final.sheets.s.cells).toMatchObject({ '0:0': { value: 10 }, '0:1': { value: 20 }, '0:2': { formula: '=A1+B1' } })
    expect(applyWorkbookOperations(b, [agent])).toEqual(final)
    expect(original.sheets.s.cells).toEqual({})
  })
  it('rejects same-cell conflicts, including edits subsequently reverted (ABA)', () => {
    const original = base(), changed = applyWorkbookOperations(original, [set(0, 10)])
    expect(() => mergeWorkbookOperations(original, [changed], [set(0, 30)])).toThrow('office.version_conflict')
    expect(() => mergeWorkbookOperations(original, [changed, original], [set(0, 30)])).toThrow('office.version_conflict')
  })
  it('rejects stale edits across structural changes even if later undone', () => {
    const original = base(), inserted = structuredClone(original); inserted.sheets.s.rows++
    expect(() => mergeWorkbookOperations(original, [inserted, original], [set(0, 30)])).toThrow('office.version_conflict')
    expect(() => mergeWorkbookOperations(original, [applyWorkbookOperations(original, [set(1, 1)])],
      [{ kind: 'replace_structure', workbook: inserted }])).toThrow('office.version_conflict')
  })
  it('validates bounds, duplicates, identities and protocol; never partially mutates input', () => {
    const original = base()
    expect(() => applyWorkbookOperations(original, [set(0, 1), set(0, 2)])).toThrow()
    expect(() => applyWorkbookOperations(original, [set(100, 1)])).toThrow()
    expect(original.sheets.s.cells).toEqual({})
    expect(workbookSubmission.safeParse({ protocol: 'other', requestId: 'x', baseRevision: 1, operations: [set(0, 1)] }).success).toBe(false)
  })
  it('normalizes ordering and produces bounded narrow cell operations', () => {
    const original = base(), next = applyWorkbookOperations(original, [set(3, 7)])
    expect(diffWorkbook(original, next)).toEqual([set(3, 7)])
    expect(diffWorkbook(next, next)).toEqual([])
  })
})
describe('replaceable Univer adapter', () => {
  it('merges a browser cell edit after Univer materializes default sheet metadata', () => {
    const legacy = { id: base().id, name: 'Budget', appVersion: '0.25.0', locale: 'enUS', styles: {},
      sheetOrder: ['s'], sheets: { s: { id: 's', name: 'Data', rowCount: 10, columnCount: 10, cellData: {} } } }
    const initial = fromUniver(legacy)
    // Captured from an actual createUnit/save round trip in the browser.
    const browser = { ...legacy, resources: [], sheets: { s: { ...legacy.sheets.s,
      tabColor: '', hidden: 0, zoomRatio: 1, freeze: { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 },
      scrollTop: 0, scrollLeft: 0, defaultColumnWidth: 88, defaultRowHeight: 24,
      mergeData: [], rowData: {}, columnData: {}, showGridlines: 1,
      rowHeader: { width: 46, hidden: 0 }, columnHeader: { height: 20, hidden: 0 }, rightToLeft: 0,
      cellData: { 0: { 4: { v: 99, t: 2 } } } } } }
    const operations = diffWorkbook(initial, fromUniver(browser))
    expect(operations).toEqual([{ kind: 'set_cell', sheetId: 's', row: 0, column: 4, cell: { value: 99, extensions: { t: 2 } } }])
    const merged = mergeWorkbookOperations(initial, [applyWorkbookOperations(initial, [set(5, 88)])], operations)
    expect(merged.sheets.s.cells['0:4'].value).toBe(99)
    expect(merged.sheets.s.cells['0:5'].value).toBe(88)
    browser.sheets.s.freeze.xSplit = 1
    expect(diffWorkbook(initial, fromUniver(browser))[0].kind).toBe('replace_structure')
  })
  it('preserves opaque formatting but removes derived formula caches from edit intent', () => {
    const legacy = { id: base().id, name: 'Budget', appVersion: '0.25.0', locale: 'enUS', styles: { bold: { bl: 1 } },
      sheetOrder: ['s'], resources: [{ name: 'opaque', data: 'keep' }], sheets: { s: { id: 's', name: 'Data',
        rowCount: 10, columnCount: 10, cellData: { 0: { 0: { f: '=1+1', v: 2, t: 2, s: 'bold' } } } } } }
    const canonical = fromUniver(legacy)
    const recalculated = structuredClone(legacy); recalculated.sheets.s.cellData[0][0].v = 123
    expect(diffWorkbook(canonical, fromUniver(recalculated))).toEqual([])
    expect(fromUniver(toUniver(canonical))).toEqual(canonical)
    expect(toUniver(canonical)).toMatchObject({ resources: legacy.resources, styles: legacy.styles })
  })
})
