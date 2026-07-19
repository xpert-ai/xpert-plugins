import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { CANVAS_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { CanvasService } from './canvas.service.js'

@Injectable()
@CollaborationDocumentProvider(CANVAS_COLLABORATION_PROVIDER_KEY)
/** Bridges a CanvasDocument projection to the platform-owned Yjs collaboration document. */
export class CanvasCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly service: CanvasService) {}

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

export { CANVAS_COLLABORATION_PROVIDER_KEY } from './constants.js'
