import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { EXCALIDRAW_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { ExcalidrawService } from './excalidraw.service.js'

@Injectable()
@CollaborationDocumentProvider(EXCALIDRAW_COLLABORATION_PROVIDER_KEY)
export class ExcalidrawCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly service: ExcalidrawService) {}

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
