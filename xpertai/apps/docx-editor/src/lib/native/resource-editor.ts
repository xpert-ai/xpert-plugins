import { DOCX_EDITOR_ICON } from '../constants.js'
import { Injectable } from '@nestjs/common'
import { ContentEditorProvider } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { DOCX_ENTRY, DOCX_VIEW, DOCX_VIEW_PROVIDER } from './constants.js'

export const DOCX_RESOURCE_EDITOR = 'docx_editor.ooxml'
// Share the document category with Office while keeping the native OOXML model and protocol.
export const DOCX_MODEL = { typeId: 'document', modelId: 'docx_editor.ooxml', schemaVersion: '1',
  editProtocol: { id: 'platform.file.cas', version: '1' } }
export const DOCX_RESOURCE_TYPE = { ...DOCX_MODEL, creatable: false, icon: { type: 'svg' as const, value: DOCX_EDITOR_ICON },
  title: { en_US: 'Document', zh_Hans: '文档' }, implementationKey: DOCX_RESOURCE_EDITOR,
  implementationTitle: { en_US: 'Native Word (DOCX)', zh_Hans: '原生 Word（DOCX）' }, defaultEditorKey: DOCX_RESOURCE_EDITOR }

@Injectable()
@ContentEditorProvider(DOCX_RESOURCE_EDITOR)
export class DocxResourceEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: DOCX_RESOURCE_EDITOR,
    protocolVersion: 2, title: 'Word (DOCX)',
    view: { providerKey: DOCX_VIEW_PROVIDER, viewKey: DOCX_VIEW, entry: DOCX_ENTRY },
    supports: [{ ...DOCX_MODEL, access: ['view','edit'] },
      // Previously resolved descriptors can still open until their catalog entry refreshes.
      { ...DOCX_MODEL, typeId: 'xpert.document', access: ['view','edit'] }] }
}
