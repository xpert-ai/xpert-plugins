import { BadRequestException } from '@nestjs/common'

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
export { workbookSchema, type NativeWorkbook } from './native-schema.js'
import { workbookSchema, type NativeWorkbook } from './native-schema.js'
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
