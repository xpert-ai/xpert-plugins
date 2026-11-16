import { z } from 'zod/v3'
import type { XpertWorkbook } from './core.js'

export const workbookSelection = z.object({ sheetId: z.string().min(1),
  startRow: z.number().int().nonnegative(), endRow: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(), endColumn: z.number().int().nonnegative() }).strict()
export type WorkbookSelection = z.infer<typeof workbookSelection>

/** A bounded description of a selected draft, never an authorization or write precondition. */
export function selectionContext(book: XpertWorkbook, input: WorkbookSelection, revision: string, unsaved: boolean) {
  const range = workbookSelection.parse(input), sheet = book.sheets[range.sheetId]
  if (!sheet || range.startRow > range.endRow || range.startColumn > range.endColumn ||
    range.endRow >= sheet.rows || range.endColumn >= sheet.columns) throw new Error('office.selection_invalid')
  const totalCells = (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1)
  const cells: Array<{ row: number; column: number; value?: string | number | boolean | null; formula?: string; omitted?: boolean }> = []
  let bytes = 0
  outer: for (let row = range.startRow; row <= range.endRow; row++) for (let column = range.startColumn; column <= range.endColumn; column++) {
    if (cells.length >= 200) break outer
    const cell = sheet.cells[`${row}:${column}`]
    const data = { row, column, value: cell?.value ?? null, ...(cell?.formula ? { formula: cell.formula } : {}) }
    const size = new TextEncoder().encode(JSON.stringify(data)).length
    if (bytes + size > 32000) { cells.push({ row, column, omitted: true }); continue }
    cells.push(data); bytes += size
  }
  return { format: 'xpert.workbook.selection@1', documentId: book.id, baseRevision: revision, unsaved,
    sheetId: sheet.id, sheetTitle: sheet.title, range, totalCells,
    truncated: cells.length < totalCells || cells.some(cell => cell.omitted), cells }
}

/** Presence bounds use the current sheet dimensions, not the protocol maxima. */
export function selectionWithinBounds(range: WorkbookSelection, rows: number, columns: number): boolean {
  return [range.startRow, range.endRow, range.startColumn, range.endColumn].every(value => Number.isSafeInteger(value) && value >= 0) &&
    range.startRow <= range.endRow && range.startColumn <= range.endColumn && range.endRow < rows && range.endColumn < columns
}
