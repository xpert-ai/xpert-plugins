import { createHash } from 'node:crypto'
import { authorWorkbook } from './author.mjs'
import { readXlsx, patchXlsx, position } from './xlsx.mjs'
import { checkFormula, patchSpec } from './schema.mjs'
import { calculate } from './calculate.cjs'
export { readXlsx } from './xlsx.mjs'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function recalculateWorkbook(input) {
  const data = await readXlsx(input)
  if (data.unsupported.length) throw new Error('Unsupported workbook parts; inspect is available, recalculation is disabled')
  const sheets = {}; const sheetOrder = []; let count = 0
  for (const [index, sheet] of data.sheets.entries()) {
    const id = `sheet-${index + 1}`; sheetOrder.push(id); const cellData = {}; let rows = 100, columns = 26
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const { row, column } = position(address); rows = Math.max(rows, row + 1); columns = Math.max(columns, column + 1)
      if (cell.formula) {
        if (cell.formulaType !== 'normal') throw new Error('Shared/array formulas are unsupported for v1 recalculation')
        checkFormula(cell.formula); count++
      }
      cellData[row] ??= {}; cellData[row][column] = { v: cell.value, ...(cell.formula ? { f: cell.formula } : {}),
        t: cell.error ? 4 : typeof cell.value === 'number' ? 2 : typeof cell.value === 'boolean' ? 3 : 1 }
    }
    if (rows > 10000 || columns > 256) throw new Error('V1 calculation is bounded to 10000 rows and 256 columns per sheet')
    sheets[id] = { id, name: sheet.name, cellData, rowCount: rows, columnCount: columns }
  }
  if (!count) return patchXlsx(input, [], [])
  const calculated = await calculate({ id: 'artifact', name: 'artifact', sheetOrder, sheets })
  const results = []
  for (const [i, sheet] of data.sheets.entries()) for (const [address, cell] of Object.entries(sheet.cells)) {
    if (!cell.formula) continue
    const { row, column } = position(address); const result = calculated.sheets[sheetOrder[i]].cellData[row][column]
    if (result.v == null || (typeof result.v === 'string' && /^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CYCLE!|CALC!)/.test(result.v)))
      throw new Error(`Formula failed at ${sheet.name}!${address}: ${result.v ?? 'no result'}`)
    results.push({ sheet: sheet.name, cell: address, formula: cell.formula, value: result.v })
  }
  return patchXlsx(input, [], results)
}
export async function createWorkbook(spec) { return recalculateWorkbook(await authorWorkbook(spec)) }
export async function editWorkbook(input, patch) {
  const parsed = patchSpec.parse(patch)
  if (sha256(input) !== parsed.sha256) throw new Error('Source revision mismatch; inspect the current file before editing')
  const keys = parsed.edits.map(e => e.sheet + '!' + e.cell)
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate cell edits')
  return recalculateWorkbook(await patchXlsx(input, parsed.edits))
}
export async function inspectWorkbook(input, { sheet, range, limit = 120 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Inspect limit must be 1..1000')
  const data = await readXlsx(input)
  if (sheet && !data.sheets.some(s => s.name === sheet)) throw new Error(`Unknown worksheet: ${sheet}`)
  const bounds = range?.split(':').map(position); if (bounds?.length === 1) bounds.push(bounds[0])
  if (bounds && (bounds.length !== 2 || bounds[0].row > bounds[1].row || bounds[0].column > bounds[1].column)) throw new Error('Invalid inspect range')
  const cells = []; let total = 0; const errors = []
  for (const s of data.sheets) for (const [address, cell] of Object.entries(s.cells)) {
    if (cell.error && errors.length < 100) errors.push({ sheet: s.name, cell: address, error: cell.error })
    const p = position(address)
    if ((sheet && s.name !== sheet) || (bounds && (p.row < bounds[0].row || p.row > bounds[1].row || p.column < bounds[0].column || p.column > bounds[1].column))) continue
    total++
    if (cells.length < limit) cells.push({ sheet: s.name, cell: address, value: cell.value, ...(cell.formula ? { formula: cell.formula } : {}) })
  }
  return { sha256: sha256(input), sheets: data.sheets.map(s => ({ name: s.name, hidden: s.hidden, cells: Object.keys(s.cells).length, freeze: s.freeze })),
    charts: data.charts.length, tables: data.tables.length, definedNames: data.definedNames,
    unsupported: data.unsupported, errors, cells, totalMatched: total, truncated: total > cells.length }
}
