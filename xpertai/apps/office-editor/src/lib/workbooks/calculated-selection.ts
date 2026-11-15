import { workbookSchema } from './native-schema.js'
import { fromUniver } from './univer-adapter.js'
import { selectionContext, type WorkbookSelection } from './selection.js'

export type SelectionBasis = { documentId: string; revision: string; generation: number }
export function assertSelectionBasis(before: SelectionBasis, after: SelectionBasis) {
  if (before.documentId !== after.documentId || before.revision !== after.revision || before.generation !== after.generation)
    throw new Error('office.selection_changed')
}

/** Called only after the engine applied its current calculation. Derived browser
 * values are bounded context, never persisted inputs or certification evidence. */
export function calculatedSelectionContext(input: unknown, range: WorkbookSelection, revision: string, unsaved: boolean, generation: number) {
  const snapshot = workbookSchema.parse(input)
  const context = selectionContext(fromUniver(snapshot), range, revision, unsaved)
  const calculation = { source: 'browser' as const, engine: 'univer@0.25.0' as const,
    baseRevision: revision, unsaved, draftGeneration: generation }
  type Cell = typeof context.cells[number] & { calculatedValue?: string | number | boolean | null }
  const cells: Cell[] = [], encoder = new TextEncoder()
  let bytes = encoder.encode(JSON.stringify({ ...context, format: 'xpert.workbook.selection@2', calculation, cells: [] })).length
  for (const cell of context.cells) {
    const value: Cell = cell.formula && !cell.omitted
      ? { ...cell, calculatedValue: snapshot.sheets[range.sheetId].cellData[cell.row]?.[cell.column]?.v ?? null } : cell
    const size = encoder.encode(JSON.stringify(value)).length + 1
    if (bytes + size > 32000) {
      const omitted = { row: cell.row, column: cell.column, omitted: true }
      if (bytes + encoder.encode(JSON.stringify(omitted)).length + 1 <= 32000) cells.push(omitted)
      break
    }
    cells.push(value); bytes += size
  }
  return { ...context, format: 'xpert.workbook.selection@2', calculation, cells,
    truncated: context.truncated || cells.length < context.totalCells || cells.some(cell => cell.omitted) }
}
