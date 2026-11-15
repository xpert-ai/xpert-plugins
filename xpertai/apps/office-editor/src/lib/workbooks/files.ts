import { BadRequestException } from '@nestjs/common'
import { convertOfficeImport, OFFICE_IMPORT_MAX_BYTES } from '../office-import.converters.js'
import { exportSpreadsheetSnapshotToXlsx } from '../excel-automation.service.js'
import { blankWorkbook, parseWorkbook, type NativeWorkbook } from './model.js'
import { createWorkbookBackup, readWorkbookBackup } from './backup.js'
import { fromUniver, toUniver } from './univer-adapter.js'

export async function importWorkbookFile(id: string, title: string, fileName: string, buffer: Buffer) {
  if (buffer.length > OFFICE_IMPORT_MAX_BYTES) throw new BadRequestException('office.import_size_limit')
  if (/\.xpert-workbook\.json$/i.test(fileName)) {
    try { return parseWorkbook(toUniver(readWorkbookBackup(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)), id)), id) }
    catch { throw new BadRequestException('office.workbook_backup_invalid') }
  }
  if (/\.xlsx$/i.test(fileName)) {
    const converted = await convertOfficeImport({ importFormat: 'xlsx', documentType: 'spreadsheet', title, fileName, buffer }).catch((error: unknown) => {
      if (error instanceof Error && error.message === 'office.workbook_date_system_unsupported') throw new BadRequestException(error.message)
      throw error
    })
    return parseWorkbook({ ...(converted.snapshot as object), id, name: title, appVersion: '0.25.0', locale: 'enUS' }, id)
  }
  if (!/\.csv$/i.test(fileName)) throw new BadRequestException('office.import_format_unsupported')
  // CSV has no number types. Keep source text (including long decimals and
  // formula-looking text) intact; users can explicitly convert it in the grid.
  const book = blankWorkbook(id, title), sheet = book.sheets[book.sheetOrder[0]]
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '') }
  catch { throw new BadRequestException('office.csv_invalid') }
  let count = 0, r = 0, c = 0, value = '', quoted = false, closed = false
  const push = () => {
    if (r >= 1048576 || c >= 16384 || ++count > 100000) throw new BadRequestException('office.import_size_limit')
    sheet.rowCount = Math.max(sheet.rowCount, r + 1); sheet.columnCount = Math.max(sheet.columnCount, c + 1)
    sheet.cellData[r] ??= {}; sheet.cellData[r][c++] = { v: value, t: 1 }; value = ''; closed = false
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else value += char
    } else if (char === ',') push()
    else if (char === '\r' || char === '\n') { push(); r++; c = 0; if (char === '\r' && text[i + 1] === '\n') i++ }
    else if (char === '"' && !value && !closed) quoted = true
    else { if (closed || char === '"') throw new BadRequestException('office.csv_invalid'); value += char }
  }
  if (quoted) throw new BadRequestException('office.csv_invalid')
  if (value || closed || c > 0) push()
  return parseWorkbook(book, id)
}

export function exportWorkbookFile(book: NativeWorkbook, format: 'xlsx' | 'csv' | 'native', sheetId?: string, revision?: number) {
  if (format === 'native') {
    const buffer = Buffer.from(JSON.stringify(createWorkbookBackup(fromUniver(book), revision!)))
    if (buffer.length > 25 * 1024 * 1024) throw new BadRequestException('office.export_size_limit')
    return { buffer, mimeType: 'application/json' }
  }
  if (format === 'xlsx') return { buffer: exportSpreadsheetSnapshotToXlsx(book, book.name), mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  const sheet = book.sheets[sheetId ?? book.sheetOrder[0]]
  if (!sheet) throw new BadRequestException('office.selection_invalid')
  let maxRow = 0, maxColumn = 0
  for (const [r, cells] of Object.entries(sheet.cellData)) for (const c of Object.keys(cells)) { maxRow = Math.max(maxRow, Number(r)); maxColumn = Math.max(maxColumn, Number(c)) }
  // CSV must materialize empty coordinates; bound that expansion separately.
  if ((maxRow + 1) * (maxColumn + 1) > 1000000) throw new BadRequestException('office.export_size_limit')
  const lines: string[] = []
  for (let r = 0; r <= maxRow; r++) {
    const cells: string[] = []
    for (let c = 0; c <= maxColumn; c++) {
      const cell = sheet.cellData[r]?.[c]
      const value = String(cell?.f ?? cell?.v ?? '')
      cells.push(`"${value.replace(/"/g, '""')}"`)
    }
    lines.push(cells.join(','))
  }
  const buffer = Buffer.from('\uFEFF' + lines.join('\r\n') + '\r\n')
  if (buffer.length > 25 * 1024 * 1024) throw new BadRequestException('office.export_size_limit')
  return { buffer, mimeType: 'text/csv;charset=utf-8' }
}
