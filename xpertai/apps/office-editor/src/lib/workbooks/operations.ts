import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import * as XLSX from 'xlsx'
import type { ExcelAutomationOperation } from '../types.js'
import type { NativeWorkbook } from './model.js'

/** Reuse the existing Office AI operation vocabulary, applied directly to native
 * cells. Round-tripping through XLSX here would silently lose Univer metadata. */
export function editWorkbook(book: NativeWorkbook, operations: ExcelAutomationOperation[]) {
  const next = structuredClone(book)
  for (const op of operations) {
    const id = next.sheetOrder.find(id => next.sheets[id].name === op.sheetName)
    if (op.type === 'create_sheet') {
      if (id || next.sheetOrder.length >= 100) throw new BadRequestException('office.workbook_sheet_names')
      const sheetId = randomUUID()
      next.sheetOrder.push(sheetId)
      next.sheets[sheetId] = { id: sheetId, name: op.sheetName, rowCount: 100, columnCount: 26, cellData: {} }
      continue
    }
    if (!id) throw new BadRequestException('office.sheet_not_found')
    const sheet = next.sheets[id]
    // Structural renaming/deletion may require rewriting formulas, defined names,
    // charts and other opaque native resources. Leave those to Univer's UI.
    if (op.type === 'rename_sheet' || op.type === 'delete_sheet') throw new BadRequestException('office.workbook_structure_use_editor')
    // Shared/array formulas may span cells beyond the requested range. Without
    // Univer's formula mutation pipeline, reject the sheet instead of corrupting
    // its groups or discarding opaque formula metadata.
    if (Object.values(sheet.cellData).some(row => Object.values(row).some(cell => cell?.si != null || cell?.ref != null)))
      throw new BadRequestException('office.workbook_formula_use_editor')
    const range = boundedRange(op.range)
    const rows = range.e.r - range.s.r + 1, cols = range.e.c - range.s.c + 1
    const values = op.type === 'set_range_values' ? op.values : op.type === 'set_range_formulas' ? op.formulas : null
    if (values && (values.length !== rows || values.some(row => row.length !== cols))) throw new BadRequestException('office.workbook_range_size')
    sheet.rowCount = Math.max(sheet.rowCount, range.e.r + 1); sheet.columnCount = Math.max(sheet.columnCount, range.e.c + 1)
    for (let r = range.s.r; r <= range.e.r; r++) for (let c = range.s.c; c <= range.e.c; c++) {
      const row = sheet.cellData[String(r)] ??= {}, key = String(c)
      const prior = row[key] ?? {}
      const value = values?.[r - range.s.r][c - range.s.c]
      // Preserve styling and unrelated fields. Remove rich text when explicitly
      // replacing a value; cached formula values must not masquerade as recalculation.
      const { v: _v, f: _f, t: _t, p: _p, si: _si, ...style } = prior
      if (op.type === 'set_range_formulas' && typeof value === 'string') row[key] = { ...style, f: value.startsWith('=') ? value : `=${value}` }
      else if (op.type === 'set_range_values' && value != null) row[key] = { ...style, v: value,
        t: typeof value === 'number' ? 2 : typeof value === 'boolean' ? 3 : 1 }
      else row[key] = Object.keys(style).length ? style : null
    }
  }
  return next
}
export function boundedRange(value: string) {
  if (!/^\$?[A-Za-z]{1,3}\$?[1-9]\d*(?::\$?[A-Za-z]{1,3}\$?[1-9]\d*)?$/.test(value)) throw new BadRequestException('office.workbook_invalid_range')
  const range = XLSX.utils.decode_range(value.replaceAll('$', '').toUpperCase())
  if (range.s.r > range.e.r || range.s.c > range.e.c || range.e.r >= 1048576 || range.e.c >= 16384 ||
    (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > 10000) throw new BadRequestException('office.workbook_range_limit')
  return range
}
export function readWorkbookRange(book: NativeWorkbook, sheetName?: string | null, inputRange?: string | null) {
  if (!sheetName && !inputRange) return { sheets: book.sheetOrder.map(id => ({ id, name: book.sheets[id].name,
    rowCount: book.sheets[id].rowCount, columnCount: book.sheets[id].columnCount })) }
  const id = sheetName ? book.sheetOrder.find(id => book.sheets[id].name === sheetName) : book.sheetOrder[0]
  if (!id) throw new BadRequestException('office.sheet_not_found')
  const sheet = book.sheets[id], range = boundedRange(inputRange ?? 'A1:J20')
  return { sheetId: id, sheetName: sheet.name, range: inputRange ?? 'A1:J20',
    rows: Array.from({ length: range.e.r - range.s.r + 1 }, (_, r) => Array.from({ length: range.e.c - range.s.c + 1 }, (_, c) => {
      const cell = sheet.cellData[String(range.s.r + r)]?.[String(range.s.c + c)]
      return { value: cell?.v ?? null, formula: cell?.f ?? null }
    })) }
}
