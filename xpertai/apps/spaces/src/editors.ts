import { Inject, Injectable } from '@nestjs/common'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { SpaceAccess } from './access.js'
import { SpaceFiles } from './files.js'
import { SpacesService } from './spaces.js'
import { denied, scoped, type SpaceActor } from './domain.js'

/** Spaces creates navigation/resources; concrete models and editing belong to editor plugins. */
@Injectable()
export class SpaceEditors {
  constructor(private readonly access: SpaceAccess, private readonly files: SpaceFiles, private readonly spaces: SpacesService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private scope(actor: SpaceActor) {
    if (!actor.projectId) throw denied()
    return { actor, projectId: actor.projectId, assistantId: actor.assistantId }
  }
  async list(actor: SpaceActor) {
    await this.access.project(actor)
    return (await this.runtime.require(ContentEditorsRuntimeCapability).list(this.scope(actor))).filter(editor => editor.kind === 'file')
  }
  async create(actor: SpaceActor, spaceId: string, parentId: string | null, title: string, editorKey: string, buffer?: Buffer) {
    const access = await this.access.resource(actor, parentId ?? spaceId, 'write')
    if (access.space.id !== spaceId) throw denied()
    const { registration, buffer: bytes } = await this.runtime.require(ContentEditorsRuntimeCapability).prepare({ ...this.scope(actor), editorKey, buffer })
    const fileName = title.toLowerCase().endsWith(`.${registration.extension}`) ? title : `${title}.${registration.extension}`
    const item = await this.spaces.createItem(actor, { spaceId, parentId, title: fileName, kind: 'file' })
    try {
      await this.access.items.update({ ...scoped(actor), id: item.id }, { editorKey })
      await this.files.put(actor, item.id, bytes, fileName, registration.mimeType)
      return await this.access.items.findOneByOrFail({ ...scoped(actor), id: item.id })
    } catch (error) { await this.access.items.update({ ...scoped(actor), id: item.id }, { deleted: true }); throw error }
  }
}
