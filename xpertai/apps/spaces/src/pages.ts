import { Injectable } from '@nestjs/common'
import { SpaceAccess } from './access.js'
import { SpaceContent } from './content.js'
import type { SpaceActor, PagePatch } from './domain.js'

/** Thin application facade for search/export. No plugin-owned collaboration room or revision tables. */
@Injectable()
export class SpacePages {
  constructor(readonly access: SpaceAccess, private readonly content: SpaceContent) {}
  async read(actor: SpaceActor, itemId: string) {
    const access = await this.access.resource(actor, itemId, 'read')
    const state = await this.content.open(actor, itemId)
    return { item: access.item, role: access.role, documentId: state.document.id, sequence: state.document.sequence,
      blocks: state.blocks, markdown: state.markdown, syncStatus: state.document.status, externalChange: state.externalChange,
      citation: { itemId, sequence: state.document.sequence, projectId: access.space.projectId, path: state.document.path } }
  }
  async checkpoint(actor: SpaceActor, itemId: string, label: string) {
    const scope = this.content.scope(actor, itemId)
    const revision = await this.content.api().checkpoint({ ...scope, label })
    // Export the immutable revision, not a head that another editor may already have changed.
    const preview = await this.content.api().preview({ ...scope, revisionId: revision.id })
    return { ...revision, markdown: preview.markdown }
  }
  propose(actor: SpaceActor, patch: PagePatch) { return this.content.propose(actor, patch) }
}
