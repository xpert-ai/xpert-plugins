import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { OFFICE_EDITOR_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { OfficeEditorService } from './office-editor.service.js'

@Injectable()
@CollaborationDocumentProvider(OFFICE_EDITOR_COLLABORATION_PROVIDER_KEY)
export class OfficeEditorCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly service: OfficeEditorService) {}

  authorize(context: CollaborationProviderContext) {
    return this.service.authorizeCollaborationDocument(context)
  }

  initializeDocument(context: CollaborationProviderContext) {
    return this.service.initializeCollaborationDocument(context)
  }

  materializeDocument(event: CollaborationMaterializationEvent) {
    return this.service.materializeCollaborationDocument(event)
  }
}
