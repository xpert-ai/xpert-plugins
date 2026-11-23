import { Injectable } from '@nestjs/common'
import { ContentEditorProvider } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { PDF_ENTRY, PDF_VIEW, PDF_VIEW_PROVIDER } from './constants.js'
import { PDF_ICON } from './icon.js'

export const PDF_RESOURCE_EDITOR = 'pdf_viewer.pdf-document'
export const PDF_MODEL = { typeId: 'xpert.pdf', modelId: 'pdf_viewer.pdf-document', schemaVersion: '1',
  editProtocol: { id: 'platform.file.cas', version: '1' } }
export const PDF_RESOURCE_TYPE = { ...PDF_MODEL, creatable: false, icon: PDF_ICON,
  title: { en_US: 'PDF', zh_Hans: 'PDF' }, implementationKey: PDF_RESOURCE_EDITOR,
  implementationTitle: { en_US: 'PDF preview', zh_Hans: 'PDF 预览' }, defaultEditorKey: PDF_RESOURCE_EDITOR }

@Injectable()
@ContentEditorProvider(PDF_RESOURCE_EDITOR)
export class PdfResourceEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: PDF_RESOURCE_EDITOR,
    protocolVersion: 2, title: 'PDF',
    view: { providerKey: PDF_VIEW_PROVIDER, viewKey: PDF_VIEW, entry: PDF_ENTRY },
    supports: [{ ...PDF_MODEL, access: ['view'] }] }
}
