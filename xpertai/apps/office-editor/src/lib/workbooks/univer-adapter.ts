import { same, xpertWorkbook, type XpertWorkbook, type Json } from './core.js'
import { workbookSchema } from './native-schema.js'
import { assertStructuralState, createStructuralState, type StructuralState } from './structure/model.js'

// Univer 0.25 materializes these defaults on createUnit/save. Omitted and
// explicitly default metadata have the same meaning; initialization must not
// turn an ordinary cell edit into a whole-workbook structural replacement.
const sheetDefaults = {
  tabColor: '', hidden: 0, zoomRatio: 1,
  freeze: { xSplit: 0, ySplit: 0, startRow: -1, startColumn: -1 },
  scrollTop: 0, scrollLeft: 0, defaultColumnWidth: 88, defaultRowHeight: 24,
  mergeData: [], rowData: {}, columnData: {}, showGridlines: 1,
  rowHeader: { width: 46, hidden: 0 }, columnHeader: { height: 20, hidden: 0 }, rightToLeft: 0
}
function omitDefaults(value: object, defaults: object) {
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) =>
    !(key in defaults) || !same(entry, (defaults as Record<string, unknown>)[key])))
}

/** The only compatibility mapping. Canonical cells carry values/formulas;
 * opaque engine formatting/resources survive round trips without interpretation. */
export function fromUniver(input: unknown): XpertWorkbook {
  const book = workbookSchema.parse(input)
  const { id, name, sheetOrder, sheets, xpertStructure, ...extensions } = book
  return xpertWorkbook.parse({ format: 'xpert.workbook', schemaVersion: xpertStructure ? 2 : 1, ...(xpertStructure ? { axes: xpertStructure } : {}), id, title: name, order: sheetOrder,
    extensions: JSON.parse(JSON.stringify(omitDefaults(extensions, { resources: [] }))), sheets: Object.fromEntries(Object.entries(sheets).map(([id, sheet]) => {
      const { id: _id, name, rowCount, columnCount, cellData, ...extra } = sheet
      const cells: XpertWorkbook['sheets'][string]['cells'] = {}
      for (const [r, row] of Object.entries(cellData)) for (const [c, cell] of Object.entries(row)) {
        if (!cell) continue
        const { v, f, ...metadata } = cell
        // Computed value/type are derived, not user edits. Never persist stale
        // formula caches as authoritative inputs or generate conflicts for them.
        if (f) delete metadata.t
        cells[`${r}:${c}`] = { value: f ? null : v ?? null, ...(f ? { formula: f } : {}),
          extensions: JSON.parse(JSON.stringify(metadata)) }
      }
      return [id, { id, title: name, rows: rowCount, columns: columnCount, cells, extensions: JSON.parse(JSON.stringify(omitDefaults(extra, sheetDefaults))) }]
    })) })
}
export function toUniver(book: XpertWorkbook) {
  return { ...book.extensions, ...(book.axes ? { xpertStructure: book.axes } : {}), id: book.id, name: book.title, sheetOrder: book.order,
    sheets: Object.fromEntries(Object.entries(book.sheets).map(([id, sheet]) => {
      const cellData: { [row: string]: { [column: string]: Json } } = {}
      for (const [key, cell] of Object.entries(sheet.cells)) {
        const [r, c] = key.split(':'); cellData[r] ??= {}
        cellData[r][c] = { ...cell.extensions, ...(cell.formula ? { f: cell.formula } : { v: cell.value }) }
      }
      return [id, { ...sheet.extensions, id, name: sheet.title, rowCount: sheet.rows, columnCount: sheet.columns, cellData }]
    })) }
}

/** Keep identities for ordinary input changes. An untracked native structural
 * command starts a new epoch and is saved through the existing CAS barrier. */
export function reconcileSnapshotAxes(input: unknown, basis: StructuralState | undefined, epoch: string, reset = false) {
  if (!basis) return undefined
  const native = workbookSchema.parse(input), book = fromUniver({ ...native, xpertStructure: undefined })
  if (!reset) {
    try { assertStructuralState(book, basis); return basis }
    catch { /* New sheets/dimensions require a barrier, not guessed identities. */ }
  }
  return createStructuralState(book, epoch)
}
