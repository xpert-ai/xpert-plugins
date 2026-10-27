import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'

export const WORKBOOK_MODEL = { typeId: 'xpert.spreadsheet', modelId: 'office-editor.univer-workbook', schemaVersion: '1',
  editProtocol: { id: 'office-editor.snapshot-cas', version: '1' } }
export const WORKBOOK_PROVIDER = 'office-editor.workbooks'
export const WORKBOOK_EDITOR = 'office-editor.univer-workbook'
export const WORKBOOK_IMPLEMENTATION = 'office-editor.univer'
export const WORKBOOK_VIEW_PROVIDER = 'office.workbooks'
export const WORKBOOK_VIEW = 'office.workbook'
export const WORKBOOK_ENTRY = 'office-workbook'

// Validate the native JSON boundary without dropping optional Univer fields. No
// XLSX conversion is involved in persistence. Limits bound server/AI work.
const index = z.string().regex(/^\d+$/)
const cell = z.object({ v: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(),
  f: z.string().max(32000).nullable().optional(), t: z.number().nullable().optional() }).passthrough().nullable()
const sheet = z.object({ id: z.string().min(1), name: z.string().min(1).max(100), rowCount: z.number().int().min(1).max(1048576),
  columnCount: z.number().int().min(1).max(16384), cellData: z.record(index, z.record(index, cell)).default({}) }).passthrough()
export const workbookSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(300),
  appVersion: z.literal('0.25.0'), locale: z.string().min(1), styles: z.record(z.object({}).passthrough().nullable()),
  sheetOrder: z.array(z.string().min(1)).min(1).max(100), sheets: z.record(sheet) }).passthrough().superRefine((book, ctx) => {
  const ids = new Set(book.sheetOrder)
  if (ids.size !== book.sheetOrder.length || ids.size !== Object.keys(book.sheets).length ||
    book.sheetOrder.some(id => !book.sheets[id] || book.sheets[id].id !== id)) ctx.addIssue({ code: 'custom', message: 'office.workbook_structure' })
  const names = book.sheetOrder.map(id => book.sheets[id]?.name.toLowerCase())
  if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', message: 'office.workbook_sheet_names' })
  for (const tab of Object.values(book.sheets)) for (const [row, cells] of Object.entries(tab.cellData)) {
    if (Number(row) >= tab.rowCount || Object.keys(cells).some(col => Number(col) >= tab.columnCount))
      ctx.addIssue({ code: 'custom', message: 'office.workbook_cell_bounds' })
  }
})
export type NativeWorkbook = z.infer<typeof workbookSchema>
export function parseWorkbook(value: unknown, id?: string): NativeWorkbook {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > 20 * 1024 * 1024) throw new BadRequestException('office.workbook_size_limit')
  const parsed = workbookSchema.safeParse(value)
  if (!parsed.success || (id && parsed.data.id !== id)) throw new BadRequestException('office.workbook_invalid')
  return parsed.data
}
export function blankWorkbook(id: string, title: string): NativeWorkbook {
  return parseWorkbook({ id, name: title, appVersion: '0.25.0', locale: 'enUS', sheetOrder: ['sheet-1'],
    sheets: { 'sheet-1': { id: 'sheet-1', name: 'Sheet1', rowCount: 100, columnCount: 26, cellData: {} } }, styles: {} })
}
export const workbookSourceRoot = (id: string) => `.xpert/spreadsheets/${id}`
export function workbookText(book: NativeWorkbook) {
  let remaining = 900000
  return book.sheetOrder.map(id => { const text = [book.sheets[id].name, ...Object.values(book.sheets[id].cellData).flatMap(row => Object.values(row)
      .map(cell => cell?.f || (cell?.v == null ? '' : String(cell.v))))].join('\n').slice(0, Math.min(100000, remaining))
    remaining -= text.length
    return { anchor: { kind: 'worksheet', id }, text }
  }).filter(section => section.text.length > 0)
}
