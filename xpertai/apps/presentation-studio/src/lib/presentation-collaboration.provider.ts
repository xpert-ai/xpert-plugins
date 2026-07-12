import { Injectable } from '@nestjs/common'
import {
  CollaborationDocumentProvider,
  type CollaborationMaterializationEvent,
  type CollaborationProviderContext,
  type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import { PRESENTATION_COLLABORATION_PROVIDER_KEY } from './constants.js'
import { PresentationStudioService } from './presentation-studio.service.js'

@Injectable()
@CollaborationDocumentProvider(PRESENTATION_COLLABORATION_PROVIDER_KEY)
/** Bridges the plugin's Deck model to the platform-owned collaboration document. */
export class PresentationCollaborationProvider implements ICollaborationDocumentProvider {
  constructor(private readonly service: PresentationStudioService) {}

  /** Delegate every platform operation to the Deck's tenant/organization authorization. */
  authorize(context: CollaborationProviderContext) {
    return this.service.authorizeCollaborationDocument(context)
  }

  /** Import the legacy Deck snapshot idempotently without creating a Presentation version. */
  initializeDocument(context: CollaborationProviderContext) {
    return this.service.initializeCollaborationDocument(context)
  }

  /** Project the latest authoritative Yjs state into DeckSpec and editor query fields. */
  materializeDocument(event: CollaborationMaterializationEvent) {
    return this.service.materializeCollaborationDocument(event)
  }
}

export { PRESENTATION_COLLABORATION_PROVIDER_KEY } from './constants.js'
