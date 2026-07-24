import { createRequire } from 'node:module'
import {
  applyExcelOperations,
  exportSpreadsheetSnapshotToXlsx,
  readExcelWorkbook
} from './excel-automation.service.js'

const requireFromHere = createRequire(import.meta.url)

describe('Excel automation engine', () => {
  it('applies typed value, formula, clear, and sheet operations to a real XLSX buffer', () => {
    const source = createWorkbook([['Name', 'Value'], ['Revenue', 100]])
    const edited = applyExcelOperations(source, [
      { type: 'set_range_values', sheetName: 'Data', range: 'B2', values: [[250]] },
      { type: 'set_range_formulas', sheetName: 'Data', range: 'C2', formulas: [['=B2*2']] },
      { type: 'create_sheet', sheetName: 'Notes' },
      { type: 'set_range_values', sheetName: 'Notes', range: 'A1', values: [['Generated']] },
      { type: 'rename_sheet', sheetName: 'Notes', newSheetName: 'Summary' },
      { type: 'clear_range', sheetName: 'Data', range: 'A2' }
    ])

    const data = readExcelWorkbook(edited.buffer, { sheetName: 'Data', range: 'A1:C2' })
    expect(data.rows[1][0].value).toBeNull()
    expect(data.rows[1][1].value).toBe(250)
    expect(data.rows[1][2].formula).toBe('=B2*2')
    expect(data.sheets.map((sheet) => sheet.name)).toEqual(['Data', 'Summary'])

    const summary = readExcelWorkbook(edited.buffer, { sheetName: 'Summary', range: 'A1' })
    expect(summary.rows[0][0].value).toBe('Generated')
  })

  it('rejects matrix/range mismatches and protects the final sheet', () => {
    const source = createWorkbook([['A']])
    expect(() => applyExcelOperations(source, [{
      type: 'set_range_values',
      sheetName: 'Data',
      range: 'A1:B2',
      values: [['only one cell']]
    }])).toThrow(/match the target range shape/i)
    expect(() => applyExcelOperations(source, [{
      type: 'delete_sheet',
      sheetName: 'Data'
    }])).toThrow(/last Excel sheet/i)
  })

  it('rewrites cell formulas and defined names when a referenced sheet is renamed', () => {
    const XLSX = requireFromHere('xlsx') as any
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[10]]), 'OldName')
    const summary = XLSX.utils.aoa_to_sheet([[]])
    summary.A1 = { t: 'n', f: 'SUM(OldName!A1, 1)', v: 11 }
    summary.A2 = { t: 's', f: '="OldName!A1"', v: 'OldName!A1' }
    summary.A3 = { t: 'n', f: "SUM('OldName'!A1, 2)", v: 12 }
    summary['!ref'] = 'A1:A3'
    XLSX.utils.book_append_sheet(workbook, summary, 'Summary')
    workbook.Workbook = {
      ...(workbook.Workbook ?? {}),
      Names: [
        { Name: 'InputValue', Ref: 'OldName!$A$1' },
        { Name: 'ExternalValue', Ref: "'[Other.xlsx]OldName'!$A$1" }
      ]
    }
    const source = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

    const edited = applyExcelOperations(source, [{
      type: 'rename_sheet',
      sheetName: 'OldName',
      newSheetName: "New 'Name"
    }])
    const result = XLSX.read(edited.buffer, { type: 'buffer', cellFormula: true })

    expect(result.Sheets.Summary.A1.f).toBe("SUM('New ''Name'!A1, 1)")
    expect(result.Sheets.Summary.A2.f).toBe('="OldName!A1"')
    expect(result.Sheets.Summary.A3.f).toBe("SUM('New ''Name'!A1, 2)")
    expect(result.Workbook.Names).toEqual(expect.arrayContaining([
      expect.objectContaining({ Name: 'InputValue', Ref: "'New ''Name'!$A$1" }),
      expect.objectContaining({ Name: 'ExternalValue', Ref: "'[Other.xlsx]OldName'!$A$1" })
    ]))
  })

  it('rejects sheet renames used by unsupported 3D formula references', () => {
    const XLSX = requireFromHere('xlsx') as any
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[1]]), 'Data')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[2]]), 'Other')
    const summary = XLSX.utils.aoa_to_sheet([[]])
    summary.A1 = { t: 'n', f: "SUM('Data':Other!A1)", v: 3 }
    summary['!ref'] = 'A1'
    XLSX.utils.book_append_sheet(workbook, summary, 'Summary')
    const source = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

    expect(() => applyExcelOperations(source, [{
      type: 'rename_sheet',
      sheetName: 'Data',
      newSheetName: 'Inputs'
    }])).toThrow(/3D formula reference/i)
  })

  it('exports a Univer spreadsheet snapshot to a downloadable XLSX buffer', () => {
    const buffer = exportSpreadsheetSnapshotToXlsx({
      sheetOrder: ['sheet-1'],
      sheets: {
        'sheet-1': {
          id: 'sheet-1',
          name: 'Model',
          cellData: {
            0: {
              0: { v: 'Revenue' },
              1: { v: 42 },
              2: { f: '=B1*2', v: 84 }
            }
          },
          mergeData: []
        }
      }
    }, 'Model')
    const workbook = readExcelWorkbook(buffer, { sheetName: 'Model', range: 'A1:C1' })
    expect(workbook.rows[0].map((cell) => cell.value)).toEqual(['Revenue', 42, 84])
    expect(workbook.rows[0][2].formula).toBe('=B1*2')
  })
})

function createWorkbook(rows: unknown[][]) {
  const XLSX = requireFromHere('xlsx') as any
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Data')
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))
}
