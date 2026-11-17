import { z } from 'zod/v3'
import { xpertWorkbook, type Json, type XpertWorkbook } from '../core.js'
import { axisLength, deleteAxis, insertAxis, reorderAxis } from './axis.js'
import { parseFormulaReferences } from './formula.js'
import { createStructuralMapper } from './references.js'
import { assertStructuralState, structuralOperation, type StructuralOperation, type StructuralState } from './model.js'

const mergeRange = z.object({ startRow: z.number().int().nonnegative(), endRow: z.number().int().nonnegative(),
  startColumn: z.number().int().nonnegative(), endColumn: z.number().int().nonnegative() }).strict()
type Merge = z.infer<typeof mergeRange>
const merges = z.array(mergeRange).max(10000)
const frozen = z.object({ xSplit: z.number().optional(), ySplit: z.number().optional(),
  startRow: z.number().optional(), startColumn: z.number().optional() }).strict()
const sheetMetadata = new Set(['tabColor', 'hidden', 'zoomRatio', 'freeze', 'scrollTop', 'scrollLeft', 'defaultColumnWidth',
  'defaultRowHeight', 'mergeData', 'rowData', 'columnData', 'showGridlines', 'rowHeader', 'columnHeader', 'rightToLeft'])
const bookMetadata = new Set(['appVersion', 'locale', 'styles', 'resources'])
function assertTransformable(book: XpertWorkbook) {
  if (Object.keys(book.extensions).some(key => !bookMetadata.has(key)) ||
      (book.extensions.resources !== undefined && (!Array.isArray(book.extensions.resources) || book.extensions.resources.length)))
    throw new Error('office.workbook_structure_extensions_unsupported')
  for (const sheet of Object.values(book.sheets)) {
    if (Object.keys(sheet.extensions).some(key => !sheetMetadata.has(key))) throw new Error('office.workbook_structure_extensions_unsupported')
    const freeze = frozen.parse(sheet.extensions.freeze ?? {})
    if ((freeze.xSplit ?? 0) > 0 || (freeze.ySplit ?? 0) > 0 || (freeze.startRow ?? -1) >= 0 || (freeze.startColumn ?? -1) >= 0)
      throw new Error('office.workbook_structure_extensions_unsupported')
    for (const cell of Object.values(sheet.cells)) {
      if (cell.extensions.si !== undefined || cell.extensions.ref !== undefined)
        throw new Error('office.workbook_formula_transform_unsupported')
      if (cell.formula) parseFormulaReferences(cell.formula)
    }
  }
}
function assertRange(range: Merge, sheet: XpertWorkbook['sheets'][string]) {
  if (range.startRow > range.endRow || range.startColumn > range.endColumn || range.endRow >= sheet.rows || range.endColumn >= sheet.columns)
    throw new Error('office.workbook_merge_invalid')
}
const overlaps = (a: Merge, b: Merge) => a.startRow <= b.endRow && a.endRow >= b.startRow && a.startColumn <= b.endColumn && a.endColumn >= b.startColumn
function assertMerges(ranges: Merge[], sheet: XpertWorkbook['sheets'][string]) {
  ranges.forEach(range => assertRange(range, sheet))
  // Cap aggregate comparison work; highly merged sheets stay on snapshot CAS.
  if (ranges.length > 1000 || ranges.some((range, index) => ranges.slice(0, index).some(other => overlaps(range, other))))
    throw new Error('office.workbook_merge_invalid')
}
function remapMetadata(value: Json | undefined, map: (index: number) => number | null) {
  const metadata = value ?? {}
  if (typeof metadata !== 'object' || Array.isArray(metadata) || Object.keys(metadata).some(key => !/^(0|[1-9][0-9]*)$/.test(key)))
    throw new Error('office.workbook_structure_extensions_unsupported')
  return Object.fromEntries(Object.entries(metadata).flatMap(([key, item]) => {
    const index = map(Number(key))
    return index === null ? [] : [[String(index), item]]
  }))
}

export function transformWorkbook(book: XpertWorkbook, axes: StructuralState, raw: StructuralOperation, insertionId: string) {
  assertStructuralState(book, axes)
  let operation = structuralOperation.parse(raw)
  const originalSheet = book.sheets[operation.sheetId]
  if (!originalSheet) throw new Error('office.sheet_not_found')
  if (operation.kind === 'sort_rows') {
    const { startRow, endRow, column, direction } = operation
    if (startRow > endRow || endRow >= originalSheet.rows || column >= originalSheet.columns || endRow - startRow >= 10000)
      throw new Error('office.workbook_axis_invalid')
    const entries = Array.from({ length: endRow - startRow + 1 }, (_, index) => {
      const cell = originalSheet.cells[`${startRow + index}:${column}`]
      if (cell?.formula) throw new Error('office.workbook_sort_formula_unsupported')
      return { index, value: cell?.value ?? null }
    })
    const rank = (value: typeof entries[number]['value']) => value === null ? 3 : typeof value === 'number' ? 0 : typeof value === 'boolean' ? 1 : 2
    entries.sort((a, b) => {
      // Empty rows remain last in either direction, retaining their own order.
      if (a.value === null || b.value === null) return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1
      const comparison = rank(a.value) - rank(b.value) || (a.value === b.value ? 0 : a.value < b.value ? -1 : 1)
      return (direction === 'ascending' ? comparison : -comparison) || a.index - b.index
    })
    operation = { kind: 'reorder_rows', sheetId: operation.sheetId, index: startRow, order: entries.map(entry => entry.index) }
  }
  assertTransformable(book)
  const next = structuredClone(book), identities = structuredClone(axes), sheet = next.sheets[operation.sheetId]
  const layout = identities.sheets[operation.sheetId]
  if (operation.kind === 'insert_axis') layout[operation.axis] = insertAxis(layout[operation.axis], operation.index, operation.count, insertionId)
  if (operation.kind === 'delete_axis') layout[operation.axis] = deleteAxis(layout[operation.axis], operation.index, operation.count)
  if (operation.kind === 'reorder_rows') layout.rows = reorderAxis(layout.rows, operation.index, operation.order)
  if (operation.kind === 'rename_sheet') sheet.title = operation.title
  sheet.rows = axisLength(layout.rows); sheet.columns = axisLength(layout.columns)
  if (sheet.columns > 16384) throw new Error('office.workbook_axis_invalid')
  const mapper = createStructuralMapper(book, axes, next, identities), transforms = mapper.transforms
  const targetTransform = transforms[operation.sheetId]
  const oldRanges = merges.parse(originalSheet.extensions.mergeData ?? [])
  assertMerges(oldRanges, originalSheet)
  let ranges: Merge[] = oldRanges.flatMap(range => {
    const rows = targetTransform.rows.range(range.startRow, range.endRow)
    const columns = targetTransform.columns.range(range.startColumn, range.endColumn)
    if (!rows || !columns || rows[0] === rows[1] && columns[0] === columns[1]) return []
    // A reordered merge cannot move its anchor while leaving hidden contents in
    // another cell. Require unchanged identity order for each existing merge.
    if (operation.kind === 'reorder_rows' && (targetTransform.rows.index(range.startRow) !== rows[0] ||
        targetTransform.rows.index(range.endRow) !== rows[1])) throw new Error('office.workbook_merge_invalid')
    return [{ startRow: rows[0], endRow: rows[1], startColumn: columns[0], endColumn: columns[1] }]
  })
  if (operation.kind === 'merge_cells' || operation.kind === 'unmerge_cells') {
    const range = mergeRange.parse({ startRow: operation.startRow, endRow: operation.endRow,
      startColumn: operation.startColumn, endColumn: operation.endColumn })
    assertRange(range, sheet)
    if (operation.kind === 'unmerge_cells') {
      const exact = (other: Merge) => Object.entries(range).every(([key, value]) => Reflect.get(other, key) === value)
      if (ranges.some(other => overlaps(range, other) && !exact(other))) throw new Error('office.workbook_merge_invalid')
      ranges = ranges.filter(other => !exact(other))
    } else {
      if (range.startRow === range.endRow && range.startColumn === range.endColumn || ranges.some(other => overlaps(range, other)))
        throw new Error('office.workbook_merge_invalid')
      for (const [key, cell] of Object.entries(sheet.cells)) {
        const [row, column] = key.split(':').map(Number)
        if (row >= range.startRow && row <= range.endRow && column >= range.startColumn && column <= range.endColumn &&
          (row !== range.startRow || column !== range.startColumn) && (cell.value !== null || cell.formula || cell.extensions.p))
          throw new Error('office.workbook_merge_would_discard')
      }
      ranges.push(range)
    }
  }
  assertMerges(ranges, sheet)
  if (ranges.length) sheet.extensions.mergeData = ranges
  else delete sheet.extensions.mergeData
  const rowData = remapMetadata(sheet.extensions.rowData, targetTransform.rows.index)
  const columnData = remapMetadata(sheet.extensions.columnData, targetTransform.columns.index)
  if (Object.keys(rowData).length) sheet.extensions.rowData = rowData
  else delete sheet.extensions.rowData
  if (Object.keys(columnData).length) sheet.extensions.columnData = columnData
  else delete sheet.extensions.columnData
  for (const id of book.order) {
    const mapped: XpertWorkbook['sheets'][string]['cells'] = {}
    for (const [key, oldCell] of Object.entries(book.sheets[id].cells)) {
      const [oldRow, oldColumn] = key.split(':').map(Number)
      const row = transforms[id].rows.index(oldRow), column = transforms[id].columns.index(oldColumn)
      if (row === null || column === null) continue
      const cell = structuredClone(oldCell)
      if (cell.formula) cell.formula = mapper.formula(cell.formula, id)
      mapped[`${row}:${column}`] = cell
    }
    next.sheets[id].cells = mapped
  }
  next.schemaVersion = 2; next.axes = identities
  const result = xpertWorkbook.parse(next)
  assertStructuralState(result, identities)
  return { workbook: result, axes: identities }
}
