import { selectionWithinBounds } from './selection.js'
import { selectionContext } from './selection.js'
import { fromUniver } from './univer-adapter.js'
import { blankWorkbook } from './model.js'

it('preserves exact values and formulas, bounds large selections and excludes opaque extensions', () => {
  const book = fromUniver(blankWorkbook('163c1862-8f41-4faf-9fb2-f332cae75922', 'Evidence'))
  const id = book.order[0]
  book.sheets[id].rows = 10000
  book.sheets[id].cells['0:0'] = { value: '9007199254740993.0001', formula: '=SUM(B1:B2)', extensions: { hidden: 'do not forward' } }
  book.sheets[id].cells['1:0'] = { value: '文'.repeat(12000), extensions: {} }
  const context = selectionContext(book, { sheetId: id, startRow: 0, endRow: 9999, startColumn: 0, endColumn: 0 }, '7', true)
  expect(context).toMatchObject({ baseRevision: '7', unsaved: true, totalCells: 10000, truncated: true })
  expect(context.cells).toHaveLength(200)
  expect(context.cells[0]).toEqual({ row: 0, column: 0, value: '9007199254740993.0001', formula: '=SUM(B1:B2)' })
  expect(context.cells[1]).toEqual({ row: 1, column: 0, omitted: true })
  expect(() => selectionContext(book, { sheetId: id, startRow: 0, endRow: 10000, startColumn: 0, endColumn: 0 }, '7', false)).toThrow()
})

it('rejects presence outside the actual sheet dimensions before invoking the grid facade', () => {
  const range = { sheetId: 's', startRow: 0, endRow: 99, startColumn: 0, endColumn: 25 }
  expect(selectionWithinBounds(range, 100, 26)).toBe(true)
  expect(selectionWithinBounds({ ...range, endRow: 100 }, 100, 26)).toBe(false)
  expect(selectionWithinBounds({ ...range, startRow: -1 }, 100, 26)).toBe(false)
  expect(selectionWithinBounds({ ...range, endColumn: NaN }, 100, 26)).toBe(false)
  expect(selectionWithinBounds({ ...range, startColumn: 26 }, 100, 26)).toBe(false)
})
