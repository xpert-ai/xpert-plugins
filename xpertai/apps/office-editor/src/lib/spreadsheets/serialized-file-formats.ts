import { Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import { exportSpreadsheetFile, importSpreadsheetFile } from './file-codec.js'
import { snapshotChangesSchema, type FileChanges } from './file-contract.js'
import { sheetJsWorkbookToUniver } from './file-codec.js'
import * as XLSX from 'xlsx'

/** These formats serialize the workbook; XLSX keeps its separate preserving writer. */
class SpreadsheetFileFormat implements ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration
  constructor(readonly format: 'xls' | 'csv' | 'tsv', title: string, mimeType: string) {
    this.descriptor = { key: `office.${format}`, kind: 'file', protocolVersion: 2,
      title, formatId: format, extension: format, mimeType, concurrency: 'versioned',
      view: { providerKey: 'office.files', viewKey: 'office.file', entry: 'office-file' } }
  }
  async read(buffer: Buffer, name = `workbook.${this.format}`) {
    if (buffer.length > 20 * 1024 * 1024) throw new Error('office.file_too_large')
    const snapshot = await importSpreadsheetFile(new Blob([new Uint8Array(buffer)]), name)
    let cells = 0
    for (const sheet of Object.values(snapshot.sheets)) for (const row of Object.values(sheet.cellData ?? {})) {
      cells += Object.keys(row).length
      if (cells > 100000) throw new Error('office.cell_limit')
    }
    return snapshot
  }
  async validateFile(buffer: Buffer) { await this.read(buffer) }
  async create() {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['']]), 'Sheet1')
    return this.serialize(sheetJsWorkbookToUniver(book, `workbook.${this.format}`))
  }
  private async serialize(snapshot: Parameters<typeof exportSpreadsheetFile>[0]) {
    const result = await exportSpreadsheetFile(snapshot, `workbook.${this.format}`)
    const buffer = Buffer.from(await result.arrayBuffer())
    await this.validateFile(buffer)
    return buffer
  }
  async apply(buffer: Buffer, raw: FileChanges) {
    const { format, snapshot } = snapshotChangesSchema.parse(raw)
    if (format !== this.format) throw new Error('office.editor_mismatch')
    if (format === 'xls' && (hasSpreadsheetFormulas(snapshot) || (buffer.length && hasSpreadsheetFormulas(await this.read(buffer)))))
      throw new Error('office.xls_formula_read_only')
    return this.serialize(snapshot)
  }
}

@Injectable()
@ContentEditorProvider('office.xls')
export class OfficeXlsFormat extends SpreadsheetFileFormat {
  constructor() { super('xls', 'Excel (XLS)', 'application/vnd.ms-excel') }
}
@Injectable()
@ContentEditorProvider('office.csv')
export class OfficeCsvFormat extends SpreadsheetFileFormat {
  constructor() { super('csv', 'CSV', 'text/csv') }
}
@Injectable()
@ContentEditorProvider('office.tsv')
export class OfficeTsvFormat extends SpreadsheetFileFormat {
  constructor() { super('tsv', 'TSV', 'text/tab-separated-values') }
}

export function hasSpreadsheetFormulas(snapshot: Parameters<typeof exportSpreadsheetFile>[0]) {
  return Object.values(snapshot.sheets).some(sheet => Object.values(sheet.cellData ?? {}).some(row =>
    Object.values(row).some(cell => !!cell && typeof cell === 'object' && 'f' in cell && !!cell.f)))
}
