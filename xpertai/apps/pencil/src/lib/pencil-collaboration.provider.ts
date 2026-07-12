import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { PENCIL_COLLABORATION_PROVIDER_KEY } from './pencil-collaboration.js'
import { PencilService } from './pencil.service.js'

@Injectable()
@CollaborationDocumentProvider(PENCIL_COLLABORATION_PROVIDER_KEY)
/** Connects the plugin-owned PencilDocument aggregate to the platform Yjs authority. */
export class PencilCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly service: PencilService) {}

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
