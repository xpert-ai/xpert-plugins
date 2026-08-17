jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, tableKey: string) => `plugin_${namespace}_${tableKey}`
}))

import { inspectXpertWorkbook } from './xpert-workbook.parser.js'
import type { XpertSheetMapping, OfficeReadResult, WorkbookCell } from './types.js'

describe('inspectXpertWorkbook dynamic mappings', () => {
  it('extracts a renamed bill sheet from mapped columns without fixed coordinates', () => {
    const mapping: XpertSheetMapping = {
      sheetName: '报价明细-自定义名称', discipline: 'building', kind: 'bill', headerRow: 2, dataStartRow: 4, dataEndRow: 4,
      columns: { code: 'A', name: 'D', specification: ['E'], unit: 'F', quantity: 'J', unitPrice: 'K', amount: 'M' },
      confidence: 0.95, rationale: '表头与数据语义一致。', evidence: ['D2=项目名称', 'J2=工程量', 'K2=综合单价', 'M2=合价']
    }
    const rows = blankRows(4, 13)
    set(rows, 'A4', 'Q-001')
    set(rows, 'D4', '混凝土工程')
    set(rows, 'E4', 'C30')
    set(rows, 'F4', 'm3')
    set(rows, 'J4', 12.5)

    const result = inspectXpertWorkbook([mapping], new Map([[mapping.sheetName, read(mapping.sheetName, rows)]]))

    expect(result).toEqual(expect.objectContaining({ template: 'ai_mapped_v1', recognizedSheets: [mapping.sheetName] }))
    expect(result.lines).toEqual([expect.objectContaining({
      sheetName: mapping.sheetName,
      code: 'Q-001',
      name: '混凝土工程',
      quantity: '12.5',
      quantityAddress: 'J4',
      targetPriceAddress: 'K4',
      targetAmountAddress: 'M4'
    })])
  })

  it('does not recognize rows whose mapped target price is already populated', () => {
    const mapping: XpertSheetMapping = {
      sheetName: '材料页', discipline: 'installation', kind: 'material', headerRow: 1, dataStartRow: 2, dataEndRow: 2,
      columns: { name: 'B', quantity: 'E', unitPrice: 'F', amount: 'H' },
      confidence: 0.9, rationale: '材料表头证据。', evidence: ['B1=材料名称']
    }
    const rows = blankRows(2, 8)
    set(rows, 'B2', '镀锌钢管')
    set(rows, 'E2', 3)
    set(rows, 'F2', 20)

    const result = inspectXpertWorkbook([mapping], new Map([[mapping.sheetName, read(mapping.sheetName, rows)]]))

    expect(result.lines).toHaveLength(0)
    expect(result.warnings[0]).toContain('没有识别到')
  })

  it('joins multiple 项目特征描述 columns without losing multiline specifications', () => {
    const mapping: XpertSheetMapping = {
      sheetName: '材料价格页', discipline: 'building', kind: 'material', headerRow: 1, dataStartRow: 2, dataEndRow: 2,
      columns: { name: 'B', specification: ['C', 'D'], unit: 'E', quantity: 'F', unitPrice: 'G', amount: 'H' },
      confidence: 0.95, rationale: '材料名称、项目特征描述和规格型号表头明确。', evidence: ['C1=项目特征描述', 'D1=规格型号']
    }
    const rows = blankRows(2, 8)
    set(rows, 'B2', '镀锌钢管')
    set(rows, 'C2', '安装方式：螺纹连接\n材质：热镀锌')
    set(rows, 'D2', 'DN50')
    set(rows, 'E2', 'm')
    set(rows, 'F2', 12)

    const result = inspectXpertWorkbook([mapping], new Map([[mapping.sheetName, read(mapping.sheetName, rows)]]))

    expect(result.lines[0]).toEqual(expect.objectContaining({
      name: '镀锌钢管',
      specification: '安装方式：螺纹连接\n材质：热镀锌 DN50',
      unit: 'm'
    }))
  })
})

function blankRows(rowCount: number, columnCount: number): WorkbookCell[][] {
  return Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => ({
    address: `${column(columnIndex)}${rowIndex + 1}`,
    value: null
  })))
}

function set(rows: WorkbookCell[][], address: string, value: WorkbookCell['value']) {
  const match = address.match(/^([A-Z]+)(\d+)$/)
  if (!match) throw new Error(`Invalid test address ${address}`)
  let columnIndex = 0
  for (const character of match[1]) columnIndex = columnIndex * 26 + character.charCodeAt(0) - 64
  rows[Number(match[2]) - 1][columnIndex - 1].value = value
}

function column(index: number) {
  let value = index + 1
  let result = ''
  while (value) {
    result = String.fromCharCode(65 + (value - 1) % 26) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function read(sheetName: string, rows: WorkbookCell[][]): OfficeReadResult {
  return {
    documentId: 'document', fileVersionId: 'version', versionNumber: 1, fileName: 'test.xlsx',
    workbook: { sheets: [{ name: sheetName }], sheetName, rows }
  }
}
