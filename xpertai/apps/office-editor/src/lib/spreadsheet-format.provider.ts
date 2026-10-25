import { Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import type { SpreadsheetDocument, SpreadsheetPatch, SpreadsheetCell } from './spreadsheet-types.js'
import * as XLSX from 'xlsx'
import { z } from 'zod/v3'

const cell = z.object({ row: z.number().int().min(0).max(999), column: z.number().int().min(0).max(99),
  value: z.union([z.string().max(32000), z.number().finite(), z.boolean(), z.null()]), formula: z.string().max(8000).optional() }).strict()
export const spreadsheetPatchSchema = z.object({ sheetId: z.string().min(1).max(31), cells: z.array(cell).min(1).max(10000) }).strict()

/** XLSX remains authoritative; each edit starts from the exact immutable source version. */
@Injectable()
@ContentEditorProvider('office.xlsx')
export class OfficeSpreadsheetFormat implements ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration = {
    key: 'office.xlsx', protocolVersion: 2, title: 'Excel (XLSX)', kind: 'file', formatId: 'xlsx', extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', concurrency: 'versioned',
    view: { providerKey: 'office.files', viewKey: 'office.file', entry: 'office-file' }
  }
  async validateFile(buffer: Buffer) { this.decode(buffer) }

  async create() {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1')
    return this.encode(workbook)
  }
  async read(buffer: Buffer): Promise<SpreadsheetDocument> {
    const workbook = this.decode(buffer)
    return { type: 'grid', sheets: workbook.SheetNames.map((id) => {
      const sheet = workbook.Sheets[id], range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
      const rows = Math.min(1000, Math.max(20, range.e.r + 1)), columns = Math.min(100, Math.max(8, range.e.c + 1))
      const cells: SpreadsheetCell[] = []
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const value = sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined
        if (!value) continue
        const scalar = typeof value.v === 'string' || typeof value.v === 'number' || typeof value.v === 'boolean' ? value.v : null
        cells.push({ row, column, value: scalar, ...(value.f ? { formula: value.f } : {}) })
      }
      return { id, title: id, rows, columns, cells }
    }) }
  }
  async apply(buffer: Buffer, patch: SpreadsheetPatch) {
    const input = spreadsheetPatchSchema.parse(patch), workbook = this.decode(buffer)
    const sheet = workbook.Sheets[input.sheetId]
    if (!sheet) throw new Error('office.sheet_not_found')
    const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
    for (const change of input.cells) {
      const key = XLSX.utils.encode_cell({ r: change.row, c: change.column })
      if (change.value === null && !change.formula) delete sheet[key]
      else sheet[key] = { ...sheet[key], t: typeof change.value === 'number' ? 'n' : typeof change.value === 'boolean' ? 'b' : 's',
        v: change.value ?? '', f: change.formula, w: undefined }
      range.e.r = Math.max(range.e.r, change.row); range.e.c = Math.max(range.e.c, change.column)
    }
    sheet['!ref'] = XLSX.utils.encode_range(range)
    return this.encode(workbook)
  }
  private decode(buffer: Buffer) {
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('office.xlsx_size_limit')
    const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellStyles: true })
    if (!workbook.SheetNames.length || workbook.SheetNames.length > 32) throw new Error('office.xlsx_sheet_limit')
    return workbook
  }
  private encode(workbook: XLSX.WorkBook): Buffer { return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', cellStyles: true }) }
}
