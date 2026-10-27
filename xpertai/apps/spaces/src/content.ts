import { Inject, Injectable } from '@nestjs/common'
import type { ContentDocumentProposal } from '@xpert-ai/contracts'
import { ContentDocumentsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { SpaceAccess } from './access.js'
import { denied, type SpaceActor, type PagePatch } from './domain.js'

/** Spaces owns navigation metadata. The platform exclusively owns document state, sessions and review. */
@Injectable()
export class SpaceContent {
  constructor(private readonly access: SpaceAccess, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  api() { return this.runtime.require(ContentDocumentsRuntimeCapability) }
  scope(actor: SpaceActor, resourceId: string) {
    if (!actor.projectId) throw denied()
    return { actor, projectId: actor.projectId, assistantId: actor.assistantId, resourceId }
  }
  async open(actor: SpaceActor, resourceId: string) {
    const { item, space } = await this.access.resource(actor, resourceId, 'read')
    if (item?.kind !== 'page' || !item.filePath || item.editorKey !== 'markdown.tiptap') throw denied()
    return this.api().get(this.scope({ ...actor, projectId: space.projectId }, resourceId))
  }
  async propose(actor: SpaceActor, patch: PagePatch): Promise<ContentDocumentProposal> {
    const state = await this.open(actor, patch.itemId)
    return this.api().propose({ ...this.scope(actor, patch.itemId), ...patch, epoch: state.document.epoch })
  }
}
