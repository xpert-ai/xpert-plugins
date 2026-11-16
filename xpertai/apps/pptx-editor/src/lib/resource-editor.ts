import { Injectable } from '@nestjs/common'
import { ContentEditorProvider } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { PPTX_ENTRY, PPTX_VIEW, PPTX_VIEW_PROVIDER } from './constants.js'

export const PPTX_RESOURCE_EDITOR = 'pptx_editor.ooxml'
export const PPTX_MODEL = { typeId: 'xpert.presentation', modelId: 'pptx_editor.ooxml', schemaVersion: '1',
  editProtocol: { id: 'platform.file.cas', version: '1' } }
export const PPTX_RESOURCE_TYPE = { ...PPTX_MODEL, creatable: false,
  title: { en_US: 'Presentation', zh_Hans: '演示文稿' }, implementationKey: PPTX_RESOURCE_EDITOR,
  implementationTitle: { en_US: 'Native PowerPoint (PPTX)', zh_Hans: '原生 PowerPoint（PPTX）' }, defaultEditorKey: PPTX_RESOURCE_EDITOR }

@Injectable()
@ContentEditorProvider(PPTX_RESOURCE_EDITOR)
export class PptxResourceEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: PPTX_RESOURCE_EDITOR,
    protocolVersion: 2, title: 'PowerPoint (PPTX)',
    view: { providerKey: PPTX_VIEW_PROVIDER, viewKey: PPTX_VIEW, entry: PPTX_ENTRY },
    supports: [{ ...PPTX_MODEL, access: ['view','edit'] }] }
}
