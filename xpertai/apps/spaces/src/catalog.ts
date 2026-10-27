import { contentBackup } from './content-backup.js'
import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Space, SpaceResourcePlacement } from './entities.js'
import { SpaceAccess } from './access.js'
import { SpacesService } from './spaces.js'
import { scoped } from './domain.js'
import { z } from 'zod/v3'
import { ContentResourcesRuntimeCapability, ContentEditorsRuntimeCapability, supportsContentModel, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { denied, type SpaceActor } from './domain.js'

export const catalogQuery = z.object({ parentId: z.string().uuid().optional(), typeId: z.string().min(1).max(200).optional(), search: z.string().max(200).optional(), deleted: z.boolean().optional(), offset: z.number().int().min(0).default(0) }).strict()
export const catalogCreate = z.object({ parentId: z.string().uuid().nullable().optional(), providerKey: z.string().min(1).max(200), implementationKey: z.string().min(1).max(200), templateId: z.string().min(1).max(200).optional(), requestId: z.string().uuid(), title: z.string().trim().min(1).max(200) }).strict()

export const catalogLifecycle = z.object({ contentId: z.string().uuid(), expectedRevision: z.string().min(1), action: z.enum(['trash', 'restore']) }).strict()

export const catalogMove = z.object({ contentId: z.string().uuid(), parentId: z.string().uuid().nullable(), expectedVersion: z.number().int().nonnegative() }).strict()

export const catalogRename = z.object({ contentId: z.string().uuid(), expectedRevision: z.string().min(1), title: z.string().trim().min(1).max(200) }).strict()
export const catalogDuplicate = catalogRename.extend({ requestId: z.string().uuid(), parentId: z.string().uuid().nullable().optional() })

/** Spaces owns discovery UI only. Resource creation, state and permissions belong to providers. */
@Injectable()
export class SpaceCatalog {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    @InjectRepository(SpaceResourcePlacement) private readonly placements: Repository<SpaceResourcePlacement>,
    private readonly spaces: SpacesService, private readonly access: SpaceAccess) {}
  private scope(actor: SpaceActor) {
    if (!actor.projectId) throw denied()
    return { actor, projectId: actor.projectId, assistantId: actor.assistantId }
  }
  private get api() { return this.runtime.require(ContentResourcesRuntimeCapability).catalog }
  backup(actor: SpaceActor, contentId: string) { return contentBackup(this.runtime, this.scope(actor), contentId) }
  preferences(actor: SpaceActor, contentId: string) { return this.runtime.require(ContentEditorsRuntimeCapability).preferences({ ...this.scope(actor), contentId }) }
  setPreference(actor: SpaceActor, input: { contentId: string; scope: 'resource' | 'project' | 'organization'; editorKey: string | null; expectedRevision: number }) {
    return this.runtime.require(ContentEditorsRuntimeCapability).setPreference({ ...this.scope(actor), ...input })
  }
  async types(actor: SpaceActor) { return (await this.api.types(this.scope(actor))).filter(type => type.creatable !== false) }
  async list(actor: SpaceActor, input: z.infer<typeof catalogQuery>) {
    const scope = this.scope(actor)
    const space = await this.spaces.workspace(actor)
    if (input.parentId) await this.parent(actor, space.id, input.parentId)
    const placements = await this.placements.findBy({ ...scoped(actor), spaceId: space.id })
    const page = await this.api.list({ ...scope, ...input, limit: 50, excludedProviderKeys: ['spaces'],
      ...(input.parentId ? { contentIds: placements.filter(p => p.parentId === input.parentId).map(p => p.contentId) } : {}) })
    const editors = await this.runtime.require(ContentEditorsRuntimeCapability).list(scope)
    // Choices are derived from the same compatibility predicate as the platform resolver.
    // Opening still reauthorizes and resolves; this list is not an access grant.
    return { ...page, items: page.items.map(item => ({ ...item,
      parentId: placements.find(p => p.contentId === item.contentId)?.parentId ?? null,
      placementVersion: placements.find(p => p.contentId === item.contentId)?.version ?? 0,
      compatibleEditors: editors.filter(editor => editor.kind === 'resource' && supportsContentModel(editor, item, 'view'))
        .map(editor => ({ key: editor.key, title: editor.title })).sort((a, b) => a.key.localeCompare(b.key))
    })) }
  }
  lifecycle(actor: SpaceActor, input: z.infer<typeof catalogLifecycle>) {
    return this.api.mutate({ ...this.scope(actor), contentId: input.contentId, expectedRevision: input.expectedRevision, change: { action: input.action } })
  }
  rename(actor: SpaceActor, input: z.infer<typeof catalogRename>) {
    return this.api.mutate({ ...this.scope(actor), contentId: input.contentId, expectedRevision: input.expectedRevision, change: { action: 'rename', title: input.title } })
  }
  async duplicate(actor: SpaceActor, input: z.infer<typeof catalogDuplicate>) {
    const space = await this.spaces.workspace(actor)
    await this.parent(actor, space.id, input.parentId ?? null, true)
    const item = await this.api.mutate({ ...this.scope(actor), contentId: input.contentId, expectedRevision: input.expectedRevision,
      change: { action: 'duplicate', requestId: input.requestId, title: input.title } })
    await this.place(actor, space.id, item.contentId, input.parentId ?? null)
    return item
  }
  async create(actor: SpaceActor, input: z.infer<typeof catalogCreate>) {
    const space = await this.spaces.workspace(actor)
    await this.parent(actor, space.id, input.parentId ?? null, true)
    const item = await this.api.create({ ...this.scope(actor), ...input })
    await this.place(actor, space.id, item.contentId, input.parentId ?? null)
    return item
  }
  private async place(actor: SpaceActor, spaceId: string, contentId: string, parentId: string | null) {
    // Idempotent creation/copy does not reset a resource that someone has already moved.
    await this.placements.manager.transaction(async manager => {
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: spaceId }, lock: { mode: 'pessimistic_write' } })
      await this.parent(actor, spaceId, parentId, true)
      await manager.getRepository(SpaceResourcePlacement).createQueryBuilder().insert().values({ ...scoped(actor), spaceId,
        contentId, parentId }).orIgnore().execute()
    })
  }
  private async parent(actor: SpaceActor, spaceId: string, parentId: string | null, write = false) {
    const parent = await this.access.resource(actor, parentId ?? spaceId, write ? 'write' : 'read')
    if (parent.space.id !== spaceId || (parent.item && parent.item.kind !== 'folder')) throw denied()
    if (write) {
      let cursor = parent.item
      const seen = new Set<string>()
      while (cursor) {
        if (cursor.syncStatus === 'pending' || cursor.deleted || seen.has(cursor.id)) throw new ConflictException('spaces.version_conflict')
        seen.add(cursor.id)
        cursor = cursor.parentId ? await this.access.items.findOneByOrFail({ ...scoped(actor), id: cursor.parentId, spaceId }) : null
      }
    }
  }
  async move(actor: SpaceActor, input: z.infer<typeof catalogMove>) {
    const space = await this.spaces.workspace(actor)
    const item = await this.api.get({ ...this.scope(actor), contentId: input.contentId })
    if (!item.canWrite) throw denied()
    return this.placements.manager.transaction(async manager => {
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: space.id }, lock: { mode: 'pessimistic_write' } })
      await this.parent(actor, space.id, input.parentId, true)
      const repo = manager.getRepository(SpaceResourcePlacement), where = { ...scoped(actor), spaceId: space.id, contentId: input.contentId }
      const current = await repo.findOneBy(where)
      if ((current?.version ?? 0) !== input.expectedVersion) throw new ConflictException('spaces.version_conflict')
      return repo.save({ ...current, ...where, parentId: input.parentId, version: (current?.version ?? 0) + 1 })
    })
  }
}
