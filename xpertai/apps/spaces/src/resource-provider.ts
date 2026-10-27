import { ConflictException, Injectable } from '@nestjs/common'
import { ContentResourceProvider, type ContentResourceEditor, type ContentResourceRequest, type ContentPrincipal, type ContentPageProvider, type ContentLocationProvider, type ContentPublicationObserver, type ContentReferenceProvider, type IContentResourceProvider } from '@xpert-ai/plugin-sdk'
import { SpaceItemCatalog } from './item-catalog.js'
import { Space, SpaceItem } from './entities.js'
import { SpaceAccess } from './access.js'
import { SpaceFiles } from './files.js'
import { SpaceDocuments } from './documents.js'
import { SpaceKnowledge } from './knowledge.js'
import { denied, scoped } from './domain.js'
import { SpaceReferences } from './references.js'
import { SpaceSubpages } from './subpages.js'
import { assertFolderHasNoResources } from './resource-folders.js'
@Injectable()
@ContentResourceProvider('spaces')
export class SpacesResourceProvider implements IContentResourceProvider {
  readonly title = 'Spaces'
  constructor(private readonly access: SpaceAccess, private readonly documents: SpaceDocuments, private readonly knowledge: SpaceKnowledge, private readonly subpages: SpaceSubpages, private readonly referenceService: SpaceReferences, private readonly files: SpaceFiles, private readonly itemCatalog: SpaceItemCatalog) {}
  get catalog() { return this.itemCatalog.catalog }
  readonly editor: ContentResourceEditor = {
    describe: async (input) => {
      const actor = { ...input.actor, projectId: input.projectId, assistantId: input.assistantId }
      const { item, space } = await this.access.resource(actor, input.sourceResourceId, 'read')
      if (!space.projectId || !item?.editorKey || !item.filePath || item.deleted) throw denied()
      return { editorKey: item.editorKey, projectId: space.projectId, path: item.filePath, title: item.title }
    },
    files: {
      read: (input) => this.files.editorRead({ ...input.actor, projectId: input.projectId, assistantId: input.assistantId }, input.sourceResourceId),
      write: (input) => this.files.editorWrite({ ...input.actor, projectId: input.projectId, assistantId: input.assistantId }, input.sourceResourceId, input.expectedRevision, input.buffer)
    }
  }
  readonly references: ContentReferenceProvider = {
    listReferences: (input) => this.referenceService.listReferences(input),
    uploadReference: (input) => this.referenceService.uploadReference(input),
    resolveReference: (input) => this.referenceService.resolveReference(input)
  }
  readonly pages: ContentPageProvider = {
    pageHierarchy: (input) => this.subpages.hierarchy(input),
    createChildPage: (input) => this.subpages.createChild(input)
  }
  readonly publication: ContentPublicationObserver = { onDocumentPublished: (input) => this.onDocumentPublished(input) }
  readonly locations: ContentLocationProvider = {
    validateLocationChange: (input) => this.validateLocationChange(input),
    onLocationPrepared: (input) => this.onLocationPrepared(input),
    onLocationChanged: (input) => this.onLocationChanged(input)
  }
  async validateLocationChange(input: Parameters<NonNullable<ContentLocationProvider['validateLocationChange']>>[0]) {
    const actor = { ...input.actor, projectId: input.projectId, assistantId: input.assistantId }
    const { item, space } = await this.access.resource(actor, input.source.resourceId, 'write', !input.deleted)
    if (!item || space.projectId !== input.projectId || item.filePath !== input.path || item.version !== input.expectedSourceVersion)
      throw new ConflictException('spaces.version_conflict')
    if (item.deleted !== input.deleted) await this.access.resource(actor, item.id, 'manage', !input.deleted)
    if (input.deleted) await assertFolderHasNoResources(this.access.items.manager, actor, item)
    const parent = await this.access.resource(actor, input.parentResourceId ?? item.spaceId, 'write')
    if (parent.space.id !== item.spaceId || (parent.item && parent.item.kind !== 'folder')) throw denied()
    let cursor = parent.item
    while (cursor) {
      if (cursor.id === item.id) throw new ConflictException('spaces.tree_cycle')
      cursor = cursor.parentId ? await this.access.items.findOneByOrFail({ ...scoped(actor), id: cursor.parentId }) : null
    }
  }
  async onLocationPrepared(input: Parameters<NonNullable<ContentLocationProvider['onLocationPrepared']>>[0]) {
    await this.access.items.manager.transaction(async manager => {
      const repo = manager.getRepository(SpaceItem)
      const item = await repo.findOneByOrFail({ ...scoped(input.actor), id: input.source.resourceId })
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(input.actor), id: item.spaceId }, lock: { mode: 'pessimistic_write' } })
      if (input.deleted) await assertFolderHasNoResources(manager, input.actor, item)
      // Resource placement takes the same Space lock and rejects a pending ancestor.
      // Once prepared, no resource can enter a folder while its durable move finishes.
      await repo.update({ ...scoped(input.actor), id: item.id, version: input.expectedSourceVersion },
        { syncStatus: 'pending', syncError: 'spaces.location_pending' })
    })
  }
  async onLocationChanged(input: Parameters<NonNullable<ContentLocationProvider['onLocationChanged']>>[0]) {
    // Projection of a durable authorized operation: it must still finish if the initiating user leaves.
    await this.access.items.manager.transaction(async (manager) => {
      const repo = manager.getRepository(SpaceItem)
      const item = await repo.findOneByOrFail({ ...scoped(input.actor), id: input.source.resourceId })
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(input.actor), id: item.spaceId, projectId: input.projectId }, lock: { mode: 'pessimistic_write' } })
      const current = await repo.findOneByOrFail({ ...scoped(input.actor), id: item.id })
      if (current.version === input.expectedSourceVersion + 1 && current.filePath === input.destination && current.deleted === input.deleted) return
      if (current.version !== input.expectedSourceVersion || current.filePath !== input.path) throw new ConflictException('spaces.version_conflict')
      const descendants = await repo.findBy({ ...scoped(input.actor), spaceId: current.spaceId })
      for (const child of descendants) {
        if (!child.filePath?.startsWith(`${input.path}/`)) continue
        child.filePath = input.destination + child.filePath.slice(input.path.length)
        child.deleted = input.deleted; child.version++
        await repo.save(child)
      }
      current.filePath = input.destination; current.title = input.title; current.parentId = input.parentResourceId
      current.deleted = input.deleted; current.version++
      current.syncStatus = 'ready'; current.syncError = null
      await repo.save(current)
    })
  }
  async onDocumentPublished(input: Parameters<NonNullable<ContentPublicationObserver['onDocumentPublished']>>[0]) {
    const actor = { ...input.actor, projectId: input.projectId }
    const { item, space } = await this.access.resource(actor, input.sourceResourceId, 'write')
    if (!item || item.deleted || space.projectId !== input.projectId || item.filePath !== input.path) return
    const disk = await this.documents.read(actor, space, item)
    if (!disk || disk.sha256 !== input.hash) return
    await this.access.items.update(item.id, { fileHash: input.hash, projectedSequence: input.sequence,
      markdown: disk.buffer.toString('utf8'), syncStatus: 'ready', syncError: null })
    await this.knowledge.sync(actor, space, item)
    const indexed = await this.access.items.findOneByOrFail({ ...scoped(actor), id: item.id })
    if (indexed.indexStatus === 'failed') throw new Error('spaces.index_retry_required')
  }
  async authorize(input: ContentResourceRequest & { principal: ContentPrincipal }) {
    const resourceId = input.resourceId
    const result = await this.access.resolve(input.principal, resourceId, input.operation)
    // Resource IDs identify items. File paths only constrain that item's Project location.
    if (input.filePath && input.filePath !== result.item?.filePath) throw denied()
    return { providerKey: 'spaces', resourceId, title: result.item?.title ?? result.space.title,
      role: result.role, canWrite: result.canWrite, canManage: result.canManage }
  }
}
