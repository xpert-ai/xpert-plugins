import { BadRequestException } from '@nestjs/common'
import type { XpertSheetMapping, OfficeReadResult, RecognizedLine, WorkbookCell } from './types.js'

export type XpertWorkbookInspection = {
  template: 'ai_mapped_v1'
  lines: RecognizedLine[]
  warnings: string[]
  recognizedSheets: string[]
}

export function inspectXpertWorkbook(
  mappings: XpertSheetMapping[],
  sheets: Map<string, OfficeReadResult>
): XpertWorkbookInspection {
  const lines: RecognizedLine[] = []
  const warnings: string[] = []
  for (const mapping of mappings) {
    const rows = sheets.get(mapping.sheetName)?.workbook.rows
    if (!rows) throw new BadRequestException(`Workbook data for ${mapping.sheetName} was not loaded.`)
    const mappedLines = parseMappedRows(mapping, rows)
    lines.push(...mappedLines)
    if (!mappedLines.length) {
      warnings.push(`${mapping.sheetName}: AI 映射已通过校验，但没有识别到可报价且目标单元格为空的明细行。`)
    }
  }
  return {
    template: 'ai_mapped_v1',
    lines,
    warnings,
    recognizedSheets: mappings.map((mapping) => mapping.sheetName)
  }
}

export function columnToIndex(column: string) {
  let result = 0
  for (const character of column.toUpperCase()) {
    result = result * 26 + character.charCodeAt(0) - 64
  }
  return result - 1
}

function parseMappedRows(mapping: XpertSheetMapping, rows: WorkbookCell[][]) {
  const result: RecognizedLine[] = []
  for (let rowNumber = mapping.dataStartRow; rowNumber <= mapping.dataEndRow; rowNumber += 1) {
    const row = rows[rowNumber - 1] ?? []
    const name = textAt(row, mapping.columns.name)
    if (!name || isSummaryLabel(name)) continue
    const code = mapping.columns.code ? textAt(row, mapping.columns.code) : undefined
    if (mapping.columns.code && !code) continue
    const quantity = mapping.columns.quantity ? numberAt(row, mapping.columns.quantity) : undefined
    if ((mapping.kind === 'bill' || mapping.kind === 'material') && quantity === undefined) continue
    if (!isEmpty(valueAt(row, mapping.columns.unitPrice))) continue
    if (mapping.columns.amount && !isEmpty(valueAt(row, mapping.columns.amount))) continue
    result.push({
      sheetName: mapping.sheetName,
      rowNumber,
      discipline: mapping.discipline,
      kind: mapping.kind,
      ...(code ? { code } : {}),
      name,
      specification: joinedText(row, mapping.columns.specification ?? []),
      unit: mapping.columns.unit ? textAt(row, mapping.columns.unit) : undefined,
      quantity,
      quantityAddress: mapping.columns.quantity ? `${mapping.columns.quantity}${rowNumber}` : undefined,
      targetPriceAddress: `${mapping.columns.unitPrice}${rowNumber}`,
      targetAmountAddress: mapping.columns.amount ? `${mapping.columns.amount}${rowNumber}` : undefined
    })
  }
  return result
}

function valueAt(row: WorkbookCell[], column: string) {
  return row[columnToIndex(column)]?.value
}

function textAt(row: WorkbookCell[], column: string) {
  const value = valueAt(row, column)
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : undefined
}

function joinedText(row: WorkbookCell[], columns: string[]) {
  const values: string[] = []
  for (const column of columns) {
    const value = textAt(row, column)
    if (value && !values.includes(value)) values.push(value)
  }
  return values.join(' ').trim() || undefined
}

function numberAt(row: WorkbookCell[], column: string) {
  const value = valueAt(row, column)
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return String(value)
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '')
    if (/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(normalized)) return normalized
  }
  return undefined
}

function isSummaryLabel(value: string) {
  return /^(?:本页)?(?:小计|合计|总计)|^(?:其中|Xpert编制)$/.test(value.replace(/\s+/g, ''))
}

function isEmpty(value: WorkbookCell['value'] | undefined) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}
