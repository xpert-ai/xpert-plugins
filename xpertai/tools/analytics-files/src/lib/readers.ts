import { parse } from 'csv-parse/sync'
import { Workbook, type CellValue } from 'exceljs'
import type { AnalyticsValue } from '@xpert-ai/contracts'
import { MAX_BYTES, MAX_ROWS, forbidden, readPath, type FileDataset } from './schema'
import { cell } from './cells'
import { validateXlsxArchive } from './xlsx-archive'

function matrixRows(matrix: unknown[][], definition: FileDataset) {
  const headers = matrix.shift()
  if (!headers || !headers.length || headers.length > 200 || headers.some(h => typeof h !== 'string' || !h || forbidden.has(h)) || new Set(headers).size !== headers.length)
    throw new Error('FILE_DATASET_HEADERS_INVALID')
  for (const column of definition.columns) if (!headers.includes(column.path[0])) throw new Error('FILE_DATASET_SCHEMA_CHANGED')
  return matrix.map(row => {
    if (row.length !== headers.length) throw new Error('FILE_DATASET_ROW_WIDTH_INVALID')
    return Object.fromEntries(headers.map((header, i) => [String(header), row[i]]))
  })
}

function excelValue(value: CellValue, policy: 'reject' | 'cached'): unknown {
  if (value === undefined) return null
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  if ('formula' in value || 'sharedFormula' in value) {
    if (policy !== 'cached') throw new Error('FILE_DATASET_FORMULA_DENIED')
    if (value.result === undefined) throw new Error('FILE_DATASET_FORMULA_CACHE_MISSING')
    return excelValue(value.result, policy)
  }
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  if ('hyperlink' in value) return value.text // Never dereference links.
  throw new Error('FILE_DATASET_EXCEL_CELL_ERROR')
}

async function xlsxRows(bytes: Buffer, definition: FileDataset) {
  const reader = definition.reader
  if (reader.format !== 'xlsx') throw new Error('FILE_DATASET_FORMAT_INVALID')
  validateXlsxArchive(bytes)
  const workbook = new Workbook()
  await workbook.xlsx.load(new Uint8Array(bytes).buffer)
  const sheet = workbook.getWorksheet(reader.sheet)
  if (!sheet || sheet.state !== 'visible') throw new Error('FILE_DATASET_SHEET_UNAVAILABLE')
  if (sheet.rowCount > MAX_ROWS + reader.headerRow || sheet.columnCount > 200) throw new Error('FILE_DATASET_INPUT_LIMIT')
  const header = sheet.getRow(reader.headerRow), width = header.cellCount
  const matrix: unknown[][] = [Array.from({ length: width }, (_, i) => excelValue(header.getCell(i + 1).value, 'reject'))]
  for (let i = reader.headerRow + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    if (!row.hasValues) continue
    if (row.cellCount > width) throw new Error('FILE_DATASET_ROW_WIDTH_INVALID')
    matrix.push(Array.from({ length: width }, (_, c) => {
      const value = row.getCell(c + 1)
      if (value.isMerged) throw new Error('FILE_DATASET_MERGED_CELL_DENIED')
      return excelValue(value.value, reader.formulaPolicy)
    }))
  }
  return matrixRows(matrix, definition)
}

export async function readRows(bytes: Buffer, definition: FileDataset): Promise<Array<Record<string, AnalyticsValue>>> {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('FILE_DATASET_SIZE_LIMIT')
  const reader = definition.reader
  let records: unknown
  if (reader.format === 'xlsx') records = await xlsxRows(bytes, definition)
  else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (reader.format === 'json') records = readPath(JSON.parse(text.replace(/^\uFEFF/, '')), reader.rowsPath)
    else {
      const parsed: unknown = parse(text, { bom: true, delimiter: reader.delimiter, from_line: reader.headerRow,
        skip_empty_lines: true, max_record_size: 100_000, to: MAX_ROWS + 2 })
      if (!Array.isArray(parsed) || !parsed.every(Array.isArray)) throw new Error('FILE_DATASET_CSV_INVALID')
      records = matrixRows(parsed, definition)
    }
  }
  if (!Array.isArray(records)) throw new Error('FILE_DATASET_ROWS_INVALID')
  if (records.length > MAX_ROWS) throw new Error('FILE_DATASET_INPUT_LIMIT')
  return records.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('FILE_DATASET_ROW_INVALID')
    return Object.fromEntries(definition.columns.map(column => [column.key, cell(readPath(row, column.path), column, reader.format)]))
  })
}
