import { Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import { patchXlsx, readXlsx, position } from '@xpert-ai/artifact-tool/xlsx'
import * as XLSX from 'xlsx'
import { importSpreadsheetFile } from './spreadsheets/file-codec.js'
import { hydrateXlsxSnapshot } from './spreadsheets/xlsx-preservation.js'
import { xlsxChangesSchema, type FileChanges } from './spreadsheets/file-contract.js'

/** Original XLSX bytes remain authoritative; the Univer snapshot is edit state. */
@Injectable()
@ContentEditorProvider('office.xlsx')
export class OfficeSpreadsheetFormat implements ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration = {
    key: 'office.xlsx', protocolVersion: 2, title: 'Excel (XLSX)', kind: 'file', formatId: 'xlsx', extension: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', concurrency: 'versioned',
    view: { providerKey: 'office.files', viewKey: 'office.file', entry: 'office-file' }
  }
  async validateFile(buffer: Buffer) { await readXlsx(buffer) }
  async create() {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1')
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  }
  async read(buffer: Buffer, name = 'workbook.xlsx') {
    // Enforce package and expanded-size limits before SheetJS decodes cells.
    await this.validateFile(buffer)
    const blob = new Blob([new Uint8Array(buffer)])
    const snapshot = await importSpreadsheetFile(blob, name)
    await hydrateXlsxSnapshot(blob, snapshot)
    return snapshot
  }
  async apply(buffer: Buffer, changes: FileChanges) {
    const { edits, results } = xlsxChangesSchema.parse(changes)
    const original = await readXlsx(buffer)
    const formulas = new Map<string, string>()
    const key = (sheet: string, cell: string) => JSON.stringify([sheet, cell])
    const normalize = (formula: string) => formula.replace(/^=/, '')
    for (const sheet of original.sheets) for (const [cell, value] of Object.entries(sheet.cells))
      if (value.formula) formulas.set(key(sheet.name, cell), normalize(value.formula))
    const edited = new Set<string>()
    for (const edit of edits) {
      position(edit.cell)
      const id = key(edit.sheet, edit.cell)
      if (edited.has(id)) throw new Error('office.duplicate_cell')
      edited.add(id)
      if (edit.value !== null && typeof edit.value === 'object') formulas.set(id, normalize(edit.value.formula))
      else formulas.delete(id)
    }
    const calculated = new Set<string>()
    for (const result of results) {
      position(result.cell)
      const id = key(result.sheet, result.cell)
      if (calculated.has(id) || formulas.get(id) !== normalize(result.formula)) throw new Error('office.stale_formula_result')
      if (result.value === null || (typeof result.value === 'string' && /^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CYCLE!|CALC!)/.test(result.value)))
        throw new Error('office.formula_error')
      calculated.add(id)
    }
    if (edits.length && calculated.size !== formulas.size) throw new Error('office.missing_formula_result')
    // Preserve all package parts outside supported cell and formula-cache edits.
    return edits.length ? Buffer.from(await patchXlsx(buffer, edits.map(edit => ({ sheet: edit.sheet, cell: edit.cell, value: typeof edit.value === 'object' ? (edit.value ? { formula: edit.value.formula } : null) : edit.value })), results.map(result => ({ sheet: result.sheet, cell: result.cell, formula: result.formula, value: result.value })))) : buffer
  }
}
