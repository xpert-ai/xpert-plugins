import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentEditorInput, type ContentFileEditorInput, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { OfficeSpreadsheetFormat } from './spreadsheet-format.provider.js'
import { fileFormatSchema, type FileChanges } from './spreadsheets/file-contract.js'

import { OfficeXlsFormat, OfficeCsvFormat, OfficeTsvFormat, hasSpreadsheetFormulas } from './spreadsheets/serialized-file-formats.js'

type FileInput = ContentEditorInput | ContentFileEditorInput

/** Office owns format semantics; the selected owner remains the only file writer. */
@Injectable()
export class OfficeFileService {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly format: OfficeSpreadsheetFormat,
    private readonly xls: OfficeXlsFormat, private readonly csv: OfficeCsvFormat, private readonly tsv: OfficeTsvFormat) {}
  private async source(input: FileInput) {
    const api = this.runtime.require(ContentEditorsRuntimeCapability)
    const file = await ('source' in input ? api.read(input) : api.readFile(input))
    const format = [this.format, this.xls, this.csv, this.tsv].find(item => item.descriptor.key === file.registration.key)
    if (!format) throw new ForbiddenException('office.editor_mismatch')
    return { api, file, format }
  }
  async read(input: FileInput) {
    const { file, format } = await this.source(input)
    const snapshot = await format.read(file.buffer, file.file.path)
    const formulaReadOnly = format.descriptor.formatId === 'xls' && hasSpreadsheetFormulas(snapshot)
    return { revision: file.revision, title: file.file.title, canWrite: file.canWrite && !formulaReadOnly,
      ...(formulaReadOnly ? { limitation: 'xls-formulas' as const } : {}),
      format: fileFormatSchema.parse(format.descriptor.formatId), snapshot }
  }
  async save(input: FileInput, expectedRevision: string, changes: FileChanges) {
    const { api, file, format } = await this.source(input)
    if (!file.canWrite) throw new ForbiddenException('office.read_only')
    if (file.revision !== expectedRevision) throw new ConflictException('office.version_conflict')
    const buffer = await format.apply(file.buffer, changes)
    // Re-checks authorization and atomically compares the resource version at publication.
    return 'source' in input ? api.write({ ...input, buffer, expectedRevision }) : api.writeFile({ ...input, buffer, expectedRevision })
  }
  async download(input: FileInput) {
    const { file } = await this.source(input)
    return { reference: file.reference,
      fileName: file.file.path.split('/').pop() ?? file.file.title, mimeType: file.registration.kind === 'file' ? file.registration.mimeType : 'application/octet-stream' }
  }
}
