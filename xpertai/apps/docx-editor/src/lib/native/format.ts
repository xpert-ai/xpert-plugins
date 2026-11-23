import { BadRequestException, Injectable } from '@nestjs/common'
import { ContentEditorProvider, type ContentFileEditor } from '@xpert-ai/plugin-sdk'
import type { FileContentEditorRegistration } from '@xpert-ai/contracts'
import JSZip from 'jszip'
import { XMLValidator } from 'fast-xml-parser'
import { blankDocumentBytes } from '@docx-editor.dev/core'
import { validateZipBudget } from './zip-budget.js'
import { DOCX_EDITOR, DOCX_ENTRY, DOCX_MAX_BYTES, DOCX_MIME, DOCX_VIEW, DOCX_VIEW_PROVIDER } from './constants.js'
import { DOCX_RESOURCE_TYPE } from './resource-editor.js'

@Injectable()
@ContentEditorProvider(DOCX_EDITOR)
export class DocxFormat implements ContentFileEditor {
  readonly descriptor: FileContentEditorRegistration = {
    kind: 'file', protocolVersion: 2, key: DOCX_EDITOR, title: 'Word (DOCX)',
    formatId: 'docx', extension: 'docx', mimeType: DOCX_MIME, concurrency: 'versioned', resourceType: DOCX_RESOURCE_TYPE,
    view: { providerKey: DOCX_VIEW_PROVIDER, viewKey: DOCX_VIEW, entry: DOCX_ENTRY }
  }
  async create() { return Buffer.from(blankDocumentBytes()) }
  async validateFile(buffer: Buffer): Promise<void> {
    if (!buffer.length || buffer.length > DOCX_MAX_BYTES) throw new BadRequestException('docx.file_size_limit')
    try {
      validateZipBudget(buffer)
      const zip = await JSZip.loadAsync(buffer)
      for (const name of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) {
        const xml = await zip.file(name)?.async('string')
        if (!xml || XMLValidator.validate(xml) !== true || /<!DOCTYPE/i.test(xml)) throw new Error('invalid_part')
        if (name === '[Content_Types].xml' && (!xml.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml') || /macroEnabled|vbaProject/i.test(xml))) throw new Error('not_docx')
      }
      if (Object.keys(zip.files).some(name => /(?:vbaProject|activeX)\b/i.test(name))) throw new Error('active_content')
    } catch { throw new BadRequestException('docx.invalid_package') }
  }
}
