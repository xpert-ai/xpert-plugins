import { BadRequestException } from '@nestjs/common'
import { createRequire } from 'node:module'
import type {
  ExcelAutomationOperation,
  OfficeCellValue
} from './types.js'

const requireFromHere = createRequire(import.meta.url)
const MAX_EXCEL_READ_CELLS = 10_000
const MAX_EXCEL_EDIT_CELLS = 100_000
const INVALID_SHEET_NAME = /[\\/?*[\]:]/

export interface ExcelWorkbookReadRequest {
  sheetName?: string | null
  range?: string | null
}

export function readExcelWorkbook(buffer: Buffer, input: ExcelWorkbookReadRequest = {}) {
  const { XLSX, workbook } = parseWorkbook(buffer)
  const sheets = workbook.SheetNames.map((sheetName: string) => {
    const worksheet = workbook.Sheets[sheetName]
    return {
      name: sheetName,
      range: typeof worksheet?.['!ref'] === 'string' ? worksheet['!ref'] : null,
      hidden: Boolean(
        workbook.Workbook?.Sheets?.find((sheet: any) => sheet?.name === sheetName)?.Hidden
      )
    }
  })

  if (!input.sheetName) {
    return { sheets }
  }

  const worksheet = requireSheet(workbook, input.sheetName)
  const rangeText = normalizeRange(input.range) ?? worksheet['!ref'] ?? 'A1:A1'
  const range = decodeRange(XLSX, rangeText)
  const cellCount = rangeSize(range)
  if (cellCount > MAX_EXCEL_READ_CELLS) {
    throw new BadRequestException(
      `Excel read range contains ${cellCount} cells; request at most ${MAX_EXCEL_READ_CELLS} cells.`
    )
  }

  const rows: Array<Array<{
    address: string
    value: OfficeCellValue
    formula?: string
    numberFormat?: string
  }>> = []
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row = []
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
      const cell = worksheet[address]
      row.push({
        address,
        value: normalizeCellValue(cell?.v),
        ...(typeof cell?.f === 'string' ? { formula: `=${cell.f}` } : {}),
        ...(typeof cell?.z === 'string' ? { numberFormat: cell.z } : {})
      })
    }
    rows.push(row)
  }

  return {
    sheets,
    sheetName: input.sheetName,
    range: XLSX.utils.encode_range(range),
    rows
  }
}

export function applyExcelOperations(buffer: Buffer, operations: ExcelAutomationOperation[]) {
  if (!Array.isArray(operations) || !operations.length) {
    throw new BadRequestException('At least one Excel operation is required.')
  }

  const { XLSX, workbook } = parseWorkbook(buffer)
  let editedCellCount = 0
  const summaries: string[] = []

  for (const operation of operations) {
    if (operation.type === 'set_range_values') {
      const worksheet = requireSheet(workbook, operation.sheetName)
      const range = decodeRange(XLSX, operation.range)
      validateMatrixShape(range, operation.values, 'values')
      editedCellCount += rangeSize(range)
      assertEditCellLimit(editedCellCount)
      writeMatrix(XLSX, worksheet, range, operation.values, setCellValue)
      expandSheetRange(XLSX, worksheet, range)
      summaries.push(`Set values in ${operation.sheetName}!${XLSX.utils.encode_range(range)}.`)
      continue
    }

    if (operation.type === 'set_range_formulas') {
      const worksheet = requireSheet(workbook, operation.sheetName)
      const range = decodeRange(XLSX, operation.range)
      validateMatrixShape(range, operation.formulas, 'formulas')
      editedCellCount += rangeSize(range)
      assertEditCellLimit(editedCellCount)
      writeMatrix(XLSX, worksheet, range, operation.formulas, setCellFormula)
      expandSheetRange(XLSX, worksheet, range)
      summaries.push(`Set formulas in ${operation.sheetName}!${XLSX.utils.encode_range(range)}.`)
      continue
    }

    if (operation.type === 'clear_range') {
      const worksheet = requireSheet(workbook, operation.sheetName)
      const range = decodeRange(XLSX, operation.range)
      editedCellCount += rangeSize(range)
      assertEditCellLimit(editedCellCount)
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          delete worksheet[XLSX.utils.encode_cell({ r: row, c: column })]
        }
      }
      summaries.push(`Cleared ${operation.sheetName}!${XLSX.utils.encode_range(range)}.`)
      continue
    }

    if (operation.type === 'create_sheet') {
      const sheetName = validateSheetName(operation.sheetName)
      if (workbook.Sheets[sheetName]) {
        throw new BadRequestException(`Excel sheet "${sheetName}" already exists.`)
      }
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), sheetName)
      summaries.push(`Created sheet ${sheetName}.`)
      continue
    }

    if (operation.type === 'rename_sheet') {
      const currentName = validateSheetName(operation.sheetName)
      const nextName = validateSheetName(operation.newSheetName)
      const worksheet = requireSheet(workbook, currentName)
      if (currentName !== nextName && workbook.Sheets[nextName]) {
        throw new BadRequestException(`Excel sheet "${nextName}" already exists.`)
      }
      rewriteWorkbookSheetReferences(workbook, currentName, nextName)
      const index = workbook.SheetNames.indexOf(currentName)
      workbook.SheetNames[index] = nextName
      delete workbook.Sheets[currentName]
      workbook.Sheets[nextName] = worksheet
      const metadata = workbook.Workbook?.Sheets?.find((sheet: any) => sheet?.name === currentName)
      if (metadata) {
        metadata.name = nextName
      }
      summaries.push(`Renamed sheet ${currentName} to ${nextName}.`)
      continue
    }

    if (operation.type === 'delete_sheet') {
      const sheetName = validateSheetName(operation.sheetName)
      requireSheet(workbook, sheetName)
      if (workbook.SheetNames.length <= 1) {
        throw new BadRequestException('The last Excel sheet cannot be deleted.')
      }
      workbook.SheetNames = workbook.SheetNames.filter((name: string) => name !== sheetName)
      delete workbook.Sheets[sheetName]
      if (Array.isArray(workbook.Workbook?.Sheets)) {
        workbook.Workbook.Sheets = workbook.Workbook.Sheets.filter((sheet: any) => sheet?.name !== sheetName)
      }
      summaries.push(`Deleted sheet ${sheetName}.`)
      continue
    }

    const exhaustiveCheck: never = operation
    throw new BadRequestException(`Unsupported Excel operation: ${String((exhaustiveCheck as any)?.type)}`)
  }

  markWorkbookForRecalculation(workbook)
  const output = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  })
  return {
    buffer: Buffer.isBuffer(output) ? output : Buffer.from(output),
    editedCellCount,
    summaries
  }
}

export function exportSpreadsheetSnapshotToXlsx(snapshot: unknown, title: string) {
  const XLSX = requireFromHere('xlsx') as any
  const workbook = XLSX.utils.book_new()
  const source = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, any> : {}
  const sheets = source.sheets && typeof source.sheets === 'object'
    ? source.sheets as Record<string, any>
    : {}
  const sheetOrder = Array.isArray(source.sheetOrder) ? source.sheetOrder : Object.keys(sheets)

  for (const sheetId of sheetOrder) {
    const sheet = sheets[sheetId]
    if (!sheet) {
      continue
    }
    const worksheet: Record<string, any> = {}
    let maxRow = 0
    let maxColumn = 0
    let hasCells = false
    for (const [rowKey, rowValue] of Object.entries(sheet.cellData ?? {})) {
      const rowIndex = Number(rowKey)
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || !rowValue || typeof rowValue !== 'object') {
        continue
      }
      for (const [columnKey, cellValue] of Object.entries(rowValue as Record<string, any>)) {
        const columnIndex = Number(columnKey)
        if (!Number.isInteger(columnIndex) || columnIndex < 0 || !cellValue || typeof cellValue !== 'object') {
          continue
        }
        const cell = cellValue as Record<string, any>
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })
        const converted: Record<string, any> = {}
        if (typeof cell.f === 'string' && cell.f.trim()) {
          converted.f = cell.f.trim().replace(/^=/, '')
        }
        if (cell.v !== undefined && cell.v !== null) {
          converted.v = cell.v
          converted.t = typeof cell.v === 'number' ? 'n' : typeof cell.v === 'boolean' ? 'b' : 's'
        } else if (converted.f) {
          converted.t = 'n'
        }
        const numberFormat = cell.s?.n?.pattern
        if (typeof numberFormat === 'string' && numberFormat.trim()) {
          converted.z = numberFormat
        }
        if (Object.keys(converted).length) {
          worksheet[address] = converted
          hasCells = true
          maxRow = Math.max(maxRow, rowIndex)
          maxColumn = Math.max(maxColumn, columnIndex)
        }
      }
    }
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: hasCells ? maxRow : 0, c: hasCells ? maxColumn : 0 }
    })
    if (Array.isArray(sheet.mergeData)) {
      worksheet['!merges'] = sheet.mergeData.map((merge: any) => ({
        s: { r: merge.startRow, c: merge.startColumn },
        e: { r: merge.endRow, c: merge.endColumn }
      }))
    }
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      validateSheetName(typeof sheet.name === 'string' ? sheet.name : `Sheet${workbook.SheetNames.length + 1}`)
    )
  }

  if (!workbook.SheetNames.length) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Sheet1')
  }
  workbook.Props = {
    ...(workbook.Props ?? {}),
    Title: title
  }
  const output = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
    compression: true
  })
  return Buffer.isBuffer(output) ? output : Buffer.from(output)
}

function parseWorkbook(buffer: Buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.byteLength) {
    throw new BadRequestException('Excel file is empty.')
  }
  const XLSX = requireFromHere('xlsx') as any
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellFormula: true,
      cellNF: true,
      cellStyles: true,
      bookVBA: true
    })
    if (!Array.isArray(workbook.SheetNames) || !workbook.SheetNames.length) {
      throw new Error('Workbook contains no sheets.')
    }
    return { XLSX, workbook }
  } catch (error) {
    throw new BadRequestException(
      `Unable to read XLSX workbook: ${error instanceof Error ? error.message : 'invalid workbook'}`
    )
  }
}

function requireSheet(workbook: any, sheetName: string) {
  const normalized = validateSheetName(sheetName)
  const worksheet = workbook.Sheets?.[normalized]
  if (!worksheet) {
    throw new BadRequestException(`Excel sheet "${normalized}" was not found.`)
  }
  return worksheet
}

function validateSheetName(value: string) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name.length > 31 || INVALID_SHEET_NAME.test(name)) {
    throw new BadRequestException(`Invalid Excel sheet name: ${String(value)}`)
  }
  return name
}

function normalizeRange(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function decodeRange(XLSX: any, value: string) {
  try {
    const range = XLSX.utils.decode_range(value)
    if (
      !Number.isInteger(range?.s?.r) ||
      !Number.isInteger(range?.s?.c) ||
      !Number.isInteger(range?.e?.r) ||
      !Number.isInteger(range?.e?.c) ||
      range.s.r < 0 ||
      range.s.c < 0 ||
      range.e.r < range.s.r ||
      range.e.c < range.s.c
    ) {
      throw new Error('invalid range')
    }
    return range
  } catch {
    throw new BadRequestException(`Invalid Excel A1 range: ${value}`)
  }
}

function rangeSize(range: any) {
  return (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1)
}

function validateMatrixShape(range: any, matrix: unknown[][], label: string) {
  const expectedRows = range.e.r - range.s.r + 1
  const expectedColumns = range.e.c - range.s.c + 1
  if (
    !Array.isArray(matrix) ||
    matrix.length !== expectedRows ||
    matrix.some((row) => !Array.isArray(row) || row.length !== expectedColumns)
  ) {
    throw new BadRequestException(
      `Excel ${label} must match the target range shape ${expectedRows}x${expectedColumns}.`
    )
  }
}

function assertEditCellLimit(cellCount: number) {
  if (cellCount > MAX_EXCEL_EDIT_CELLS) {
    throw new BadRequestException(
      `Excel edit contains ${cellCount} cells; edit at most ${MAX_EXCEL_EDIT_CELLS} cells per request.`
    )
  }
}

function writeMatrix(
  XLSX: any,
  worksheet: any,
  range: any,
  matrix: unknown[][],
  writeCell: (worksheet: any, address: string, value: any) => void
) {
  for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < matrix[rowOffset].length; columnOffset += 1) {
      const address = XLSX.utils.encode_cell({
        r: range.s.r + rowOffset,
        c: range.s.c + columnOffset
      })
      writeCell(worksheet, address, matrix[rowOffset][columnOffset])
    }
  }
}

function setCellValue(worksheet: any, address: string, value: OfficeCellValue) {
  if (value === null) {
    delete worksheet[address]
    return
  }
  const previous = worksheet[address] ?? {}
  const preserved = preserveCellPresentation(previous)
  if (typeof value === 'number') {
    worksheet[address] = { ...preserved, t: 'n', v: value }
  } else if (typeof value === 'boolean') {
    worksheet[address] = { ...preserved, t: 'b', v: value }
  } else {
    worksheet[address] = { ...preserved, t: 's', v: value }
  }
}

function setCellFormula(worksheet: any, address: string, formula: string | null) {
  if (formula === null || !formula.trim()) {
    delete worksheet[address]
    return
  }
  const previous = worksheet[address] ?? {}
  worksheet[address] = {
    ...preserveCellPresentation(previous),
    t: previous.t && previous.t !== 'z' ? previous.t : 'n',
    f: formula.trim().replace(/^=/, ''),
    v: typeof previous.v === 'number' ? previous.v : 0
  }
}

function preserveCellPresentation(cell: any) {
  return {
    ...(cell.s !== undefined ? { s: cell.s } : {}),
    ...(cell.z !== undefined ? { z: cell.z } : {})
  }
}

function rewriteWorkbookSheetReferences(
  workbook: {
    SheetNames: string[]
    Sheets: Record<string, Record<string, unknown>>
    Workbook?: {
      Names?: Array<{ Ref?: unknown }>
    }
  },
  currentName: string,
  nextName: string
) {
  if (currentName === nextName) {
    return
  }

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    for (const [address, cell] of Object.entries(worksheet ?? {})) {
      if (address.startsWith('!') || !isUnknownRecord(cell) || typeof cell.f !== 'string') {
        continue
      }
      cell.f = rewriteSheetReferenceExpression(cell.f, currentName, nextName)
    }
  }

  for (const definedName of workbook.Workbook?.Names ?? []) {
    if (typeof definedName.Ref === 'string') {
      definedName.Ref = rewriteSheetReferenceExpression(definedName.Ref, currentName, nextName)
    }
  }
}

function rewriteSheetReferenceExpression(expression: string, currentName: string, nextName: string) {
  const currentNameLower = currentName.toLowerCase()
  const quotedNextName = quoteExcelSheetName(nextName)
  let output = ''
  let index = 0

  while (index < expression.length) {
    const character = expression[index]

    if (character === '"') {
      const end = copyExcelStringLiteral(expression, index)
      output += expression.slice(index, end)
      index = end
      continue
    }

    if (character === "'") {
      const quotedReference = readQuotedSheetReference(expression, index)
      if (quotedReference) {
        const previous = index > 0 ? expression[index - 1] : ''
        if (
          isThreeDimensionalSheetReference(quotedReference.sheetName, currentNameLower) ||
          (
            quotedReference.sheetName.toLowerCase() === currentNameLower &&
            (previous === ':' || quotedReference.separator === ':')
          )
        ) {
          throw unsupportedThreeDimensionalRename(currentName)
        }
        output +=
          quotedReference.separator === '!' &&
          quotedReference.sheetName.toLowerCase() === currentNameLower
          ? `${quotedNextName}!`
          : expression.slice(index, quotedReference.end)
        index = quotedReference.end
        continue
      }
    }

    if (matchesUnquotedSheetName(expression, index, currentName)) {
      const previous = index > 0 ? expression[index - 1] : ''
      const next = expression[index + currentName.length] ?? ''
      if (previous === ':' || next === ':') {
        throw unsupportedThreeDimensionalRename(currentName)
      }
      if (next === '!') {
        output += `${quotedNextName}!`
        index += currentName.length + 1
        continue
      }
    }

    output += character
    index += 1
  }

  return output
}

function copyExcelStringLiteral(expression: string, start: number) {
  let index = start + 1
  while (index < expression.length) {
    if (expression[index] !== '"') {
      index += 1
      continue
    }
    if (expression[index + 1] === '"') {
      index += 2
      continue
    }
    return index + 1
  }
  return expression.length
}

function readQuotedSheetReference(expression: string, start: number) {
  let sheetName = ''
  let index = start + 1
  while (index < expression.length) {
    if (expression[index] !== "'") {
      sheetName += expression[index]
      index += 1
      continue
    }
    if (expression[index + 1] === "'") {
      sheetName += "'"
      index += 2
      continue
    }
    const separator = expression[index + 1]
    if (separator !== '!' && separator !== ':') {
      return null
    }
    return {
      sheetName,
      separator,
      end: index + 2
    }
  }
  return null
}

function matchesUnquotedSheetName(expression: string, index: number, sheetName: string) {
  if (expression.slice(index, index + sheetName.length).toLowerCase() !== sheetName.toLowerCase()) {
    return false
  }
  const previous = index > 0 ? expression[index - 1] : ''
  if (previous && /[A-Za-z0-9_.\]'"]/.test(previous)) {
    return false
  }
  const next = expression[index + sheetName.length] ?? ''
  return next === '!' || next === ':'
}

function isThreeDimensionalSheetReference(sheetReference: string, currentNameLower: string) {
  const separatorIndex = sheetReference.indexOf(':')
  if (separatorIndex < 0) {
    return false
  }
  const startName = sheetReference.slice(0, separatorIndex).toLowerCase()
  const endName = sheetReference.slice(separatorIndex + 1).toLowerCase()
  return startName === currentNameLower || endName === currentNameLower
}

function quoteExcelSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`
}

function unsupportedThreeDimensionalRename(sheetName: string) {
  return new BadRequestException(
    `Excel sheet "${sheetName}" is used in a 3D formula reference. Rename the dependent formulas before renaming the sheet.`
  )
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function expandSheetRange(XLSX: any, worksheet: any, editedRange: any) {
  if (!worksheet['!ref']) {
    worksheet['!ref'] = XLSX.utils.encode_range(editedRange)
    return
  }
  const current = decodeRange(XLSX, worksheet['!ref'])
  worksheet['!ref'] = XLSX.utils.encode_range({
    s: {
      r: Math.min(current.s.r, editedRange.s.r),
      c: Math.min(current.s.c, editedRange.s.c)
    },
    e: {
      r: Math.max(current.e.r, editedRange.e.r),
      c: Math.max(current.e.c, editedRange.e.c)
    }
  })
}

function markWorkbookForRecalculation(workbook: any) {
  workbook.CalcPr = {
    ...(workbook.CalcPr ?? {}),
    calcMode: 'auto',
    fullCalcOnLoad: true,
    forceFullCalc: true
  }
}

function normalizeCellValue(value: unknown): OfficeCellValue {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return null
}
