import { randomUUID } from 'node:crypto'
import { blankWorkbook } from '../model.js'
import { fromUniver } from '../univer-adapter.js'
import { createStructuralState } from './model.js'
import { transformWorkbook } from './transform.js'
import { axisIdentity, axisIndex } from './axis.js'

function fixture() {
  const native = blankWorkbook(randomUUID(), '结构测试')
  native.sheets['sheet-1'].name = '数据'
  native.sheets['sheet-1'].cellData = { 0: { 0: { v: 10 }, 1: { v: 'alpha' } }, 1: { 0: { v: 20 } }, 2: { 0: { v: 30 } } }
  native.sheets['sheet-1'].rowData = { 1: { h: 42 } }
  native.sheetOrder.push('summary')
  native.sheets.summary = { id: 'summary', name: '汇总', rowCount: 100, columnCount: 26,
    cellData: { 0: { 0: { f: "=SUM('数据'!$A$1:A3)+'数据'!$A$2" } } } }
  const workbook = fromUniver(native)
  return { workbook, axes: createStructuralState(workbook, 'epoch') }
}
it('inserts rows without changing existing identities and rewrites cross-sheet absolute/range references', () => {
  const before = fixture(), original = structuredClone(before)
  const after = transformWorkbook(before.workbook, before.axes, { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'rows', index: 1, count: 2 }, 'request-1')
  expect(after.workbook.sheets['sheet-1'].cells['3:0'].value).toBe(20)
  expect(after.workbook.sheets['sheet-1'].extensions.rowData).toEqual({ 3: { h: 42 } })
  expect(after.workbook.sheets.summary.cells['0:0'].formula).toBe("=SUM('数据'!$A$1:A5)+'数据'!$A$4")
  expect(axisIndex(after.axes.sheets['sheet-1'].rows, axisIdentity(before.axes.sheets['sheet-1'].rows, 1))).toBe(3)
  expect(before).toEqual(original)
})
it('deletes reference edges, produces REF for deleted single cells and escapes renamed sheet references', () => {
  const before = fixture()
  const after = transformWorkbook(before.workbook, before.axes, { kind: 'delete_axis', sheetId: 'sheet-1', axis: 'rows', index: 0, count: 2 }, 'delete')
  expect(after.workbook.sheets.summary.cells['0:0'].formula).toBe("=SUM('数据'!$A$1:A1)+#REF!")
  const renamed = transformWorkbook(after.workbook, after.axes, { kind: 'rename_sheet', sheetId: 'sheet-1', title: "销售 '华东' 区" }, 'rename')
  expect(renamed.workbook.sheets.summary.cells['0:0'].formula).toBe("=SUM('销售 ''华东'' 区'!$A$1:A1)+#REF!")
})
it('reorders whole rows with stable references and rejects ranges which would become disjoint', () => {
  const before = fixture()
  const after = transformWorkbook(before.workbook, before.axes, { kind: 'reorder_rows', sheetId: 'sheet-1', index: 0, order: [2, 0, 1] }, 'sort')
  expect(after.workbook.sheets['sheet-1'].cells['0:0'].value).toBe(30)
  expect(after.workbook.sheets.summary.cells['0:0'].formula).toBe("=SUM('数据'!$A$1:A3)+'数据'!$A$3")
  before.workbook.sheets.summary.cells['0:0'].formula = "=SUM('数据'!A1:A2)"
  expect(() => transformWorkbook(before.workbook, before.axes, { kind: 'reorder_rows', sheetId: 'sheet-1', index: 0, order: [0, 2, 1] }, 'sort'))
    .toThrow('office.workbook_range_reordered')
})
it('sorts whole rows by typed input values with stable ties, and never sorts stale formula caches', () => {
  const before = fixture()
  const sorted = transformWorkbook(before.workbook, before.axes, { kind: 'sort_rows', sheetId: 'sheet-1', startRow: 0, endRow: 2, column: 0, direction: 'descending' }, 'sort')
  expect([0, 1, 2].map(row => sorted.workbook.sheets['sheet-1'].cells[`${row}:0`].value)).toEqual([30, 20, 10])
  expect(sorted.workbook.sheets['sheet-1'].cells['2:1'].value).toBe('alpha')
  const withEmpty = transformWorkbook(before.workbook, before.axes, { kind: 'sort_rows', sheetId: 'sheet-1', startRow: 0, endRow: 4, column: 0, direction: 'descending' }, 'sort-blank')
  expect([0, 1, 2].map(row => withEmpty.workbook.sheets['sheet-1'].cells[`${row}:0`].value)).toEqual([30, 20, 10])
  expect(withEmpty.workbook.sheets['sheet-1'].cells['3:0']).toBeUndefined()
  expect(() => transformWorkbook(before.workbook, before.axes, { kind: 'sort_rows', sheetId: 'summary', startRow: 0, endRow: 1, column: 0, direction: 'ascending' }, 'sort'))
    .toThrow('office.workbook_sort_formula_unsupported')
})
it('merges only empty subordinate cells, rejects overlaps and extends an existing merge across inserted rows', () => {
  const before = fixture(), range = { sheetId: 'sheet-1', startRow: 5, endRow: 6, startColumn: 0, endColumn: 1 }
  const merged = transformWorkbook(before.workbook, before.axes, { kind: 'merge_cells', ...range }, 'merge')
  const inserted = transformWorkbook(merged.workbook, merged.axes, { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'rows', index: 6, count: 2 }, 'insert')
  expect(inserted.workbook.sheets['sheet-1'].extensions.mergeData).toEqual([{ startRow: 5, endRow: 8, startColumn: 0, endColumn: 1 }])
  expect(() => transformWorkbook(merged.workbook, merged.axes, { kind: 'merge_cells', ...range }, 'overlap')).toThrow('office.workbook_merge_invalid')
  expect(() => transformWorkbook(before.workbook, before.axes, { kind: 'merge_cells', ...range, startRow: 0, endRow: 0 }, 'loss'))
    .toThrow('office.workbook_merge_would_discard')
  const unmerged = transformWorkbook(merged.workbook, merged.axes, { kind: 'unmerge_cells', ...range }, 'unmerge')
  expect(unmerged.workbook.sheets['sheet-1'].extensions.mergeData).toBeUndefined()
})
it('rejects unknown dependencies and invalid identities before applying any transform', () => {
  const before = fixture(), operation = { kind: 'insert_axis', sheetId: 'sheet-1', axis: 'columns', index: 0, count: 1 } as const
  before.workbook.sheets.summary.cells['0:0'].formula = '=INDIRECT("A1")'
  expect(() => transformWorkbook(before.workbook, before.axes, operation, 'x')).toThrow('office.workbook_formula_transform_unsupported')
  before.workbook.sheets.summary.cells['0:0'].formula = '=1+2'
  before.workbook.extensions.resources = [{ name: 'unknown-chart-dependencies', data: 'opaque' }]
  expect(() => transformWorkbook(before.workbook, before.axes, operation, 'x')).toThrow('office.workbook_structure_extensions_unsupported')
  delete before.workbook.extensions.resources
  before.axes.sheets['sheet-1'].rows[0].count--
  expect(() => transformWorkbook(before.workbook, before.axes, operation, 'x')).toThrow('office.workbook_axis_invalid')
})
