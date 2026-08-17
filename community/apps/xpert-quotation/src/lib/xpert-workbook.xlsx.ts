import { BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import {
  XPERT_WORKBOOK_SNAPSHOT_IMPORTER,
  readXpertOoxmlWorkbookLayout
} from './xpert-workbook.ooxml.js'
import type { WorkbookCell } from './types.js'

const requireFromHere = createRequire(import.meta.url)
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_ZIP_ENTRIES = 2_000
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
const MAX_READ_CELLS = 10_000

type CellValue = string | number | boolean | Date
type XlsxCell = { v?: CellValue; w?: string; f?: string; z?: string; t?: string }
type XlsxMerge = { s: { r: number; c: number }; e: { r: number; c: number } }
type XlsxWorksheet = Record<string, XlsxCell | string | XlsxMerge[] | undefined>
type XlsxWorkbook = {
  SheetNames: string[]
  Sheets: Record<string, XlsxWorksheet>
  Workbook?: { Sheets?: Array<{ name?: string; Hidden?: number }> }
  Props?: Record<string, string>
}
type XlsxRange = { s: { r: number; c: number }; e: { r: number; c: number } }
type XlsxModule = {
  read(buffer: Buffer, options: Record<string, boolean | string>): XlsxWorkbook
  write(workbook: XlsxWorkbook, options: Record<string, boolean | string>): Buffer | Uint8Array
  utils: {
    decode_range(value: string): XlsxRange
    encode_range(value: XlsxRange): string
    encode_cell(value: { r: number; c: number }): string
    book_new(): XlsxWorkbook
    book_append_sheet(workbook: XlsxWorkbook, sheet: XlsxWorksheet, name: string): void
    aoa_to_sheet(values: CellValue[][]): XlsxWorksheet
  }
}

type SnapshotCell = {
  v?: string | number | boolean
  f?: string
  s?: string | { n?: { pattern?: string } }
}
type SnapshotSheet = {
  id: string
  name: string
  hidden: number
  rowCount: number
  columnCount: number
  cellData: Record<number, Record<number, SnapshotCell>>
  mergeData: Array<{ startRow: number; endRow: number; startColumn: number; endColumn: number }>
  [key: string]: object | string | number
}
export type XpertWorkbookSnapshot = {
  id: string
  name: string
  sheetOrder: string[]
  sheets: Record<string, SnapshotSheet>
  styles: Record<string, object>
  resources: object[]
  custom: { importer: typeof XPERT_WORKBOOK_SNAPSHOT_IMPORTER }
}

export function normalizeImportedExcelWorkbook(buffer: Buffer, fileName: string) {
  if (!/\.xls$/i.test(fileName) || /\.xlsx$/i.test(fileName)) {
    return { buffer, fileName, convertedFromLegacyXls: false }
  }
  const { XLSX, workbook } = parseWorkbook(buffer)
  let output: Buffer | Uint8Array
  try {
    output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true })
  } catch (error) {
    throw new BadRequestException(`Unable to convert legacy XLS workbook: ${errorMessage(error)}`)
  }
  return {
    buffer: Buffer.isBuffer(output) ? output : Buffer.from(output),
    fileName: fileName.replace(/\.xls$/i, '.xlsx'),
    convertedFromLegacyXls: true
  }
}

export async function convertXlsxToSnapshot(buffer: Buffer, title: string): Promise<XpertWorkbookSnapshot> {
  await validateArchive(buffer)
  const { XLSX, workbook } = parseWorkbook(buffer)
  const layout = await readXpertOoxmlWorkbookLayout(buffer)
  const unitId = randomUUID()
  const sheetOrder: string[] = []
  const sheets: Record<string, SnapshotSheet> = {}

  workbook.SheetNames.forEach((sheetName, index) => {
    const sheetId = randomUUID()
    const worksheet = workbook.Sheets[sheetName] ?? {}
    const sheetLayout = layout.sheets.get(sheetName)
    const ref = readWorksheetRef(worksheet) ?? 'A1:A1'
    const range = XLSX.utils.decode_range(ref)
    const cellData: Record<number, Record<number, SnapshotCell>> = {}
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const source = readCell(worksheet, XLSX.utils.encode_cell({ r: row, c: column }))
        const address = XLSX.utils.encode_cell({ r: row, c: column })
        const cell = toSnapshotCell(source, sheetLayout?.cellStyles.get(address))
        if (!cell) continue
        cellData[row] ??= {}
        cellData[row][column] = cell
      }
    }
    const metadata = workbook.Workbook?.Sheets?.[index]
    sheetOrder.push(sheetId)
    sheets[sheetId] = {
      id: sheetId,
      name: sheetName || `Sheet${index + 1}`,
      tabColor: sheetLayout?.tabColor ?? '',
      hidden: metadata?.Hidden ? 1 : 0,
      freeze: sheetLayout?.freeze ?? { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
      rowCount: Math.max(range.e.r + 1, 100),
      columnCount: Math.max(range.e.c + 1, 26),
      zoomRatio: 1,
      scrollTop: 0,
      scrollLeft: 0,
      defaultColumnWidth: sheetLayout?.defaultColumnWidth ?? 88,
      defaultRowHeight: sheetLayout?.defaultRowHeight ?? 24,
      mergeData: readWorksheetMerges(worksheet).map((merge) => ({
        startRow: merge.s.r,
        endRow: merge.e.r,
        startColumn: merge.s.c,
        endColumn: merge.e.c
      })),
      cellData,
      rowData: sheetLayout?.rowData ?? {},
      columnData: sheetLayout?.columnData ?? {},
      rowHeader: { width: 46 },
      columnHeader: { height: 20 },
      showGridlines: sheetLayout?.showGridlines ?? 1,
      rightToLeft: sheetLayout?.rightToLeft ?? 0
    }
  })
  return {
    id: unitId,
    name: title,
    sheetOrder,
    sheets,
    styles: layout.styles,
    resources: [],
    custom: { importer: XPERT_WORKBOOK_SNAPSHOT_IMPORTER }
  }
}

export function isCurrentXpertWorkbookSnapshot(value: unknown): value is XpertWorkbookSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const custom = (value as { custom?: unknown }).custom
  return Boolean(
    custom &&
    typeof custom === 'object' &&
    !Array.isArray(custom) &&
    (custom as { importer?: unknown }).importer === XPERT_WORKBOOK_SNAPSHOT_IMPORTER
  )
}

export function readXlsxWorkbook(buffer: Buffer, input: { sheetName?: string | null; range?: string | null } = {}) {
  const { XLSX, workbook } = parseWorkbook(buffer)
  const sheets = workbook.SheetNames.map((name, index) => ({
    name,
    range: readWorksheetRef(workbook.Sheets[name] ?? {}) ?? null,
    hidden: Boolean(workbook.Workbook?.Sheets?.[index]?.Hidden)
  }))
  if (!input.sheetName) return { sheets }
  const worksheet = workbook.Sheets[input.sheetName]
  if (!worksheet) throw new BadRequestException(`Excel sheet "${input.sheetName}" was not found.`)
  const range = decodeReadRange(XLSX, input.range ?? readWorksheetRef(worksheet) ?? 'A1:A1')
  const rows: WorkbookCell[][] = []
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const cells: WorkbookCell[] = []
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column })
      const cell = readCell(worksheet, address)
      cells.push({
        address,
        value: normalizeCellValue(cell?.v),
        ...(cell?.f ? { formula: cell.f.startsWith('=') ? cell.f : `=${cell.f}` } : {}),
        ...(cell?.z ? { numberFormat: cell.z } : {})
      })
    }
    rows.push(cells)
  }
  return { sheets, sheetName: input.sheetName, range: XLSX.utils.encode_range(range), rows }
}

export function exportSnapshotToXlsx(snapshot: object, title: string) {
  const XLSX = xlsx()
  const workbook = XLSX.utils.book_new()
  const source = snapshot as Partial<XpertWorkbookSnapshot>
  const sheets = source.sheets ?? {}
  const order = Array.isArray(source.sheetOrder) ? source.sheetOrder : Object.keys(sheets)
  for (const sheetId of order) {
    const sheet = sheets[sheetId]
    if (!sheet) continue
    const worksheet: XlsxWorksheet = {}
    let maxRow = 0
    let maxColumn = 0
    let hasCells = false
    for (const [rowKey, rowValue] of Object.entries(sheet.cellData ?? {})) {
      const row = Number(rowKey)
      if (!Number.isInteger(row) || row < 0) continue
      for (const [columnKey, sourceCell] of Object.entries(rowValue ?? {})) {
        const column = Number(columnKey)
        if (!Number.isInteger(column) || column < 0 || !sourceCell) continue
        const cell: XlsxCell = {}
        if (sourceCell.f?.trim()) cell.f = sourceCell.f.trim().replace(/^=/, '')
        if (sourceCell.v !== undefined && sourceCell.v !== null) {
          cell.v = sourceCell.v
          cell.t = typeof sourceCell.v === 'number' ? 'n' : typeof sourceCell.v === 'boolean' ? 'b' : 's'
        } else if (cell.f) {
          cell.t = 'n'
        }
        const numberFormat = typeof sourceCell.s === 'object' ? sourceCell.s.n?.pattern?.trim() : undefined
        if (numberFormat) cell.z = numberFormat
        if (!Object.keys(cell).length) continue
        worksheet[XLSX.utils.encode_cell({ r: row, c: column })] = cell
        hasCells = true
        maxRow = Math.max(maxRow, row)
        maxColumn = Math.max(maxColumn, column)
      }
    }
    worksheet['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: hasCells ? maxRow : 0, c: hasCells ? maxColumn : 0 } })
    worksheet['!merges'] = (sheet.mergeData ?? []).map((merge) => ({
      s: { r: merge.startRow, c: merge.startColumn },
      e: { r: merge.endRow, c: merge.endColumn }
    }))
    XLSX.utils.book_append_sheet(workbook, worksheet, validSheetName(sheet.name, workbook.SheetNames.length + 1))
  }
  if (!workbook.SheetNames.length) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
  workbook.Props = { ...(workbook.Props ?? {}), Title: title }
  const output = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true })
  return Buffer.isBuffer(output) ? output : Buffer.from(output)
}

async function validateArchive(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.byteLength) throw new BadRequestException('Excel file is empty.')
  if (buffer.byteLength > MAX_FILE_BYTES) throw new BadRequestException('XLSX file exceeds the 25MB size limit.')
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
  } catch (error) {
    throw new BadRequestException(`Unable to open XLSX archive: ${errorMessage(error)}`)
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length > MAX_ZIP_ENTRIES) throw new BadRequestException('XLSX archive contains too many entries.')
  let total = 0
  for (const entry of entries) {
    const data = await entry.async('uint8array')
    total += data.byteLength
    if (total > MAX_UNCOMPRESSED_BYTES) throw new BadRequestException('XLSX archive expands beyond the 100MB safety limit.')
  }
}

function parseWorkbook(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.byteLength) throw new BadRequestException('Excel file is empty.')
  if (buffer.byteLength > MAX_FILE_BYTES) throw new BadRequestException('Excel file exceeds the 25MB size limit.')
  const XLSX = xlsx()
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: true, cellNF: true, cellStyles: true, bookVBA: true })
    if (!workbook.SheetNames.length) throw new Error('Workbook contains no sheets.')
    return { XLSX, workbook }
  } catch (error) {
    throw new BadRequestException(`Unable to read Excel workbook: ${errorMessage(error)}`)
  }
}

function decodeReadRange(XLSX: XlsxModule, value: string) {
  let range: XlsxRange
  try { range = XLSX.utils.decode_range(value) } catch { throw new BadRequestException(`Invalid Excel range: ${value}`) }
  const count = (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1)
  if (count > MAX_READ_CELLS) throw new BadRequestException(`Excel read range contains ${count} cells; request at most ${MAX_READ_CELLS} cells.`)
  return range
}

function toSnapshotCell(source?: XlsxCell, styleId?: string) {
  const cell: SnapshotCell = {}
  const value = normalizeSnapshotValue(source?.v, source?.w)
  if (value !== undefined) cell.v = value
  if (source?.f?.trim()) cell.f = source.f.startsWith('=') ? source.f : `=${source.f}`
  if (styleId) cell.s = styleId
  else if (source?.z?.trim() && source.z !== 'General') cell.s = { n: { pattern: source.z } }
  return Object.keys(cell).length ? cell : null
}

function normalizeSnapshotValue(value?: CellValue, formatted?: string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return formatted
}

function normalizeCellValue(value?: CellValue): WorkbookCell['value'] {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value ?? null
}

function readCell(sheet: XlsxWorksheet, address: string) {
  const value = sheet[address]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as XlsxCell : undefined
}

function readWorksheetRef(sheet: XlsxWorksheet) { return typeof sheet['!ref'] === 'string' ? sheet['!ref'] : undefined }
function readWorksheetMerges(sheet: XlsxWorksheet) { return Array.isArray(sheet['!merges']) ? sheet['!merges'] as XlsxMerge[] : [] }
function validSheetName(value: string, index: number) { const name = value?.trim() || `Sheet${index}`; if (name.length > 31 || /[\\/?*[\]:]/.test(name)) throw new BadRequestException(`Invalid Excel sheet name: ${name}`); return name }
function xlsx() { return requireFromHere('xlsx') as XlsxModule }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'invalid workbook' }
