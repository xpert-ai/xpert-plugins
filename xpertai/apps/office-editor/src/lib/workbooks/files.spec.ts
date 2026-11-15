import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { importWorkbookFile, exportWorkbookFile } from './files.js'
import { blankWorkbook } from './model.js'

const XLSX = createRequire(import.meta.url)('xlsx') as typeof import('xlsx')
it('round-trips quoted UTF-8 CSV without rounding or executing formula-looking text', async () => {
  const id = randomUUID(), csv = Buffer.from('\uFEFF"金额","说明"\r\n"9007199254740993.0001","含,逗号\n和""引号"""\r\n"=1+2",""\r\n')
  const book = await importWorkbookFile(id, 'Data', 'data.csv', csv)
  const cells = book.sheets[book.sheetOrder[0]].cellData
  expect(cells[1][0]?.v).toBe('9007199254740993.0001')
  expect(cells[1][1]?.v).toBe('含,逗号\n和"引号"')
  expect(cells[2][0]).toEqual({ v: '=1+2', t: 1 })
  expect(exportWorkbookFile(book, 'csv').buffer).toEqual(csv)
  await expect(importWorkbookFile(id, 'Data', 'data.csv', Buffer.from('"unterminated'))).rejects.toThrow('office.csv_invalid')
  await expect(importWorkbookFile(id, 'Data', 'data.csv', Buffer.from([0xc3, 0x28]))).rejects.toThrow('office.csv_invalid')
  await expect(importWorkbookFile(id, 'Data', 'data.xlsm', csv)).rejects.toThrow('office.import_format_unsupported')
})
it('preserves supported XLSX formulas, exact text, merges and worksheet names', async () => {
  const id = randomUUID(), book = blankWorkbook(id, 'Report'), sheet = book.sheets[book.sheetOrder[0]]
  sheet.name = '季度'
  sheet.cellData = { 0: { 0: { v: '9007199254740993.0001', t: 1 }, 1: { v: 12, t: 2 }, 2: { v: 30, t: 2 }, 3: { f: '=B1+C1', v: 42, t: 2 } } }
  sheet.mergeData = [{ startRow: 2, endRow: 2, startColumn: 0, endColumn: 1 }]
  const exported = exportWorkbookFile(book, 'xlsx')
  const imported = await importWorkbookFile(id, 'Report', 'report.xlsx', exported.buffer)
  const result = imported.sheets[imported.sheetOrder[0]]
  expect(result.name).toBe('季度')
  expect(result.cellData[0][0]?.v).toBe('9007199254740993.0001')
  expect(result.cellData[0][3]?.f).toBe('=B1+C1')
  expect(result.mergeData).toEqual(sheet.mergeData)
})
it('handles sparse full-grid XLSX references without scanning empty coordinates', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, { A1: { t: 's', v: 'only cell' }, '!ref': 'A1' }, 'Sparse')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const JSZip = createRequire(import.meta.url)('jszip') as typeof import('jszip')
  const zip = await JSZip.loadAsync(bytes)
  const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  zip.file('xl/worksheets/sheet1.xml', xml.replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:XFD1048576"/>'))
  const imported = await importWorkbookFile(randomUUID(), 'Sparse', 'sparse.xlsx', await zip.generateAsync({ type: 'nodebuffer' }))
  expect(imported.sheets[imported.sheetOrder[0]].cellData).toEqual({ 0: { 0: { v: 'only cell' } } })
})
it('rejects CSV cell and dense export limits before unbounded allocation', async () => {
  await expect(importWorkbookFile(randomUUID(), 'Limit', 'limit.csv', Buffer.from('a\n'.repeat(100001)))).rejects.toThrow('office.import_size_limit')
  const book = blankWorkbook(randomUUID(), 'Limit'), sheet = book.sheets[book.sheetOrder[0]]
  sheet.rowCount = 1048576; sheet.columnCount = 16384
  sheet.cellData = { 1048575: { 16383: { v: 'edge' } } }
  expect(() => exportWorkbookFile(book, 'csv')).toThrow('office.export_size_limit')
})

it('preserves XLSX date serials, time fractions and number formats for formula arithmetic', async () => {
  const source = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(source, { A1: { t: 'n', v: 46338.75, z: 'yyyy-mm-dd hh:mm' },
    B1: { t: 'n', f: 'A1+1', v: 46339.75, z: 'yyyy-mm-dd hh:mm' }, '!ref': 'A1:B1' }, '时间')
  const book = await importWorkbookFile(randomUUID(), 'Dates', 'dates.xlsx', XLSX.write(source, { type: 'buffer', bookType: 'xlsx' }))
  const cells = book.sheets[book.sheetOrder[0]].cellData
  expect(cells[0][0]?.v).toBe(46338.75)
  expect(cells[0][0]?.s).toEqual({ n: { pattern: 'yyyy-mm-dd hh:mm' } })
  expect(cells[0][1]?.f).toBe('=A1+1')
  const roundTrip = XLSX.read(exportWorkbookFile(book, 'xlsx').buffer, { type: 'buffer', cellNF: true, cellDates: false })
  expect(roundTrip.Sheets['时间'].A1.v).toBe(46338.75)
  expect(roundTrip.Sheets['时间'].A1.z).toBe('yyyy-mm-dd hh:mm')
  expect(roundTrip.Sheets['时间'].B1.f).toBe('A1+1')
  source.Workbook = { WBProps: { date1904: true } }
  await expect(importWorkbookFile(randomUUID(), '1904', 'dates.xlsx', XLSX.write(source, { type: 'buffer', bookType: 'xlsx' })))
    .rejects.toThrow('office.workbook_date_system_unsupported')
})

it('round-trips multiple sheets, hidden state, style-table formats, booleans and cross-sheet formulas', async () => {
  const id = randomUUID(), book = blankWorkbook(id, '复杂格式'), first = book.sheets[book.sheetOrder[0]]
  first.name = "销售 '华东'"
  book.styles.money = { n: { pattern: '#,##0.0000' } }
  first.cellData = { 0: { 0: { v: 12.3456, t: 2, s: 'money' }, 1: { v: true, t: 3 } } }
  book.sheetOrder.push('summary')
  book.sheets.summary = { id: 'summary', name: '汇总', rowCount: 100, columnCount: 26, hidden: 1,
    cellData: { 0: { 0: { f: "='销售 ''华东'''!$A$1*2", t: 2 } } } }
  const xlsx = exportWorkbookFile(book, 'xlsx').buffer
  const excel = XLSX.read(xlsx, { type: 'buffer', cellNF: true })
  expect(excel.Sheets[first.name].A1.z).toBe('#,##0.0000')
  expect(excel.Workbook?.Sheets?.[1].Hidden).toBe(1)
  const imported = await importWorkbookFile(id, book.name, 'complex.xlsx', xlsx)
  expect(imported.sheetOrder.map(key => imported.sheets[key].name)).toEqual([first.name, '汇总'])
  expect(imported.sheets[imported.sheetOrder[0]].cellData[0][1]?.v).toBe(true)
  expect(imported.sheets[imported.sheetOrder[1]].hidden).toBe(1)
  expect(imported.sheets[imported.sheetOrder[1]].cellData[0][0]?.f).toBe("='销售 ''华东'''!$A$1*2")
})
