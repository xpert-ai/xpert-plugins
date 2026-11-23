import { BadRequestException, Injectable, MethodNotAllowedException } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import { PDF_EDITOR, PDF_ENTRY, PDF_MAX_BYTES, PDF_MIME, PDF_VIEW, PDF_VIEW_PROVIDER } from './constants.js'
import { PDF_RESOURCE_TYPE } from './resource-editor.js'

@Injectable()
@ContentEditorProvider(PDF_EDITOR)
export class PdfFormat implements ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration = {
    kind: 'file', protocolVersion: 2, key: PDF_EDITOR, title: 'PDF',
    formatId: 'pdf', extension: 'pdf', mimeType: PDF_MIME, concurrency: 'versioned', resourceType: PDF_RESOURCE_TYPE,
    view: { providerKey: PDF_VIEW_PROVIDER, viewKey: PDF_VIEW, entry: PDF_ENTRY }
  }
  async create(): Promise<Buffer> { throw new MethodNotAllowedException('pdf.preview_only') }
  async validateFile(buffer: Buffer): Promise<void> {
    if (!buffer.length || buffer.length > PDF_MAX_BYTES) throw new BadRequestException('pdf.file_size_limit')
    if (!/^%PDF-\d\.\d/.test(buffer.subarray(0, 16).toString('ascii')))
      throw new BadRequestException('pdf.invalid_file')
  }
}
