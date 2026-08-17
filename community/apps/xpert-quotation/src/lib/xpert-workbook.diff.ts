import { BadRequestException } from '@nestjs/common'
import type { WorkbookOoxmlEdit } from './xpert-excel-ooxml-patch.service.js'
import { isCurrentXpertWorkbookSnapshot } from './xpert-workbook.xlsx.js'

const MAX_WORKBOOK_EDITS = 10_000
const MAX_EXCEL_ROW = 1_048_576
const MAX_EXCEL_COLUMN = 16_384

type JsonRecord = Record<string, unknown>
type CellValue = string | number | boolean | null

type SnapshotCell = {
  formula: string | null
  value: CellValue
}

export function diffXpertWorkbookSnapshots(
  original: object,
  edited: object
): WorkbookOoxmlEdit[] {
  if (!isCurrentXpertWorkbookSnapshot(original)) {
    throw new BadRequestException('The stored workbook snapshot must be refreshed from the source XLSX before saving edits.')
  }
  if (!isCurrentXpertWorkbookSnapshot(edited)) {
    throw new BadRequestException('The edited workbook is stale. Reopen it before saving changes.')
  }

  const before = workbookStructure(original, 'stored')
  const after = workbookStructure(edited, 'edited')
  assertSameStringArray(before.order, after.order, 'Workbook sheet order cannot be changed in the quotation editor.')
  assertSameStringArray(
    Object.keys(before.sheets).sort(),
    Object.keys(after.sheets).sort(),
    'Worksheets cannot be added or removed in the quotation editor.'
  )

  const edits: WorkbookOoxmlEdit[] = []
  for (const sheetId of before.order) {
    const beforeSheet = requireRecord(before.sheets[sheetId], `Stored worksheet ${sheetId}`)
    const afterSheet = requireRecord(after.sheets[sheetId], `Edited worksheet ${sheetId}`)
    const beforeName = requireString(beforeSheet.name, `Stored worksheet ${sheetId} name`)
    const afterName = requireString(afterSheet.name, `Edited worksheet ${sheetId} name`)
    if (beforeName !== afterName) {
      throw new BadRequestException('Worksheets cannot be renamed in the quotation editor.')
    }
    if (normalizedMerges(beforeSheet.mergeData) !== normalizedMerges(afterSheet.mergeData)) {
      throw new BadRequestException(`Merged cells cannot be changed in worksheet "${beforeName}".`)
    }

    const beforeCells = readCells(beforeSheet.cellData, `Stored worksheet "${beforeName}"`)
    const afterCells = readCells(afterSheet.cellData, `Edited worksheet "${beforeName}"`)
    const cellKeys = new Set([...beforeCells.keys(), ...afterCells.keys()])
    for (const key of cellKeys) {
      const beforeCell = beforeCells.get(key) ?? EMPTY_CELL
      const afterCell = afterCells.get(key) ?? EMPTY_CELL
      const edit = diffCell(beforeName, key, beforeCell, afterCell)
      if (!edit) continue
      edits.push(edit)
      if (edits.length > MAX_WORKBOOK_EDITS) {
        throw new BadRequestException(`Workbook edits exceed the ${MAX_WORKBOOK_EDITS} cell limit.`)
      }
    }
  }
  return edits
}

function diffCell(
  sheetName: string,
  key: string,
  before: SnapshotCell,
  after: SnapshotCell
): WorkbookOoxmlEdit | null {
  if (before.formula === after.formula) {
    if (after.formula !== null || sameValue(before.value, after.value)) return null
  } else if (after.formula !== null) {
    return { sheetName, address: keyToAddress(key), kind: 'formula', value: after.formula }
  }

  const address = keyToAddress(key)
  if (after.value === null) return { sheetName, address, kind: 'clear' }
  if (typeof after.value === 'number') return { sheetName, address, kind: 'number', value: after.value }
  if (typeof after.value === 'boolean') return { sheetName, address, kind: 'boolean', value: after.value }
  return { sheetName, address, kind: 'string', value: after.value }
}

function workbookStructure(value: object, label: string) {
  const workbook = requireRecord(value, `${label} workbook`)
  const order = requireStringArray(workbook.sheetOrder, `${label} workbook sheetOrder`)
  const sheets = requireRecord(workbook.sheets, `${label} workbook sheets`)
  return { order, sheets }
}

function readCells(value: unknown, label: string) {
  const result = new Map<string, SnapshotCell>()
  const rows = requireRecord(value ?? {}, `${label} cellData`)
  for (const [rowKey, rowValue] of Object.entries(rows)) {
    const row = parseIndex(rowKey, MAX_EXCEL_ROW, `${label} row`)
    const columns = requireRecord(rowValue, `${label} row ${row + 1}`)
    for (const [columnKey, cellValue] of Object.entries(columns)) {
      const column = parseIndex(columnKey, MAX_EXCEL_COLUMN, `${label} column`)
      const cell = requireRecord(cellValue, `${label} cell ${encodeAddress(row, column)}`)
      result.set(`${row}:${column}`, {
        formula: normalizeFormula(cell.f),
        value: normalizeCellValue(cell.v, `${label} cell ${encodeAddress(row, column)}`)
      })
    }
  }
  return result
}

function normalizeFormula(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw new BadRequestException('Workbook formulas must be strings.')
  const normalized = value.trim().replace(/^=/, '')
  return normalized || null
}

function normalizeCellValue(value: unknown, label: string): CellValue {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new BadRequestException(`${label} contains an unsupported value.`)
}

function normalizedMerges(value: unknown) {
  if (value == null) return '[]'
  if (!Array.isArray(value)) throw new BadRequestException('Workbook mergeData must be an array.')
  const merges = value.map((entry, index) => {
    const merge = requireRecord(entry, `Workbook merge ${index + 1}`)
    return [
      requireNonNegativeInteger(merge.startRow, 'Merge startRow'),
      requireNonNegativeInteger(merge.endRow, 'Merge endRow'),
      requireNonNegativeInteger(merge.startColumn, 'Merge startColumn'),
      requireNonNegativeInteger(merge.endColumn, 'Merge endColumn')
    ]
  })
  return JSON.stringify(merges)
}

function keyToAddress(key: string) {
  const [rowText, columnText] = key.split(':')
  return encodeAddress(Number(rowText), Number(columnText))
}

function encodeAddress(row: number, column: number) {
  let index = column + 1
  let letters = ''
  while (index > 0) {
    const remainder = (index - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    index = Math.floor((index - 1) / 26)
  }
  return `${letters}${row + 1}`
}

function parseIndex(value: string, maximum: number, label: string) {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new BadRequestException(`${label} index is invalid.`)
  const index = Number(value)
  if (!Number.isSafeInteger(index) || index < 0 || index >= maximum) {
    throw new BadRequestException(`${label} index is outside the XLSX limit.`)
  }
  return index
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} is invalid.`)
  }
  return value as JsonRecord
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) throw new BadRequestException(`${label} is invalid.`)
  return value
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    throw new BadRequestException(`${label} is invalid.`)
  }
  return value as string[]
}

function requireNonNegativeInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${label} is invalid.`)
  }
  return value
}

function assertSameStringArray(before: string[], after: string[], message: string) {
  if (before.length !== after.length || before.some((value, index) => value !== after[index])) {
    throw new BadRequestException(message)
  }
}

function sameValue(before: CellValue, after: CellValue) {
  return before === after
}

const EMPTY_CELL: SnapshotCell = { formula: null, value: null }
