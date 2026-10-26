import type { SpaceActor } from './domain.js'
import { SpaceArtifacts } from './artifacts.js'
import { ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { Space, SpaceItem } from './entities.js'
import { SpaceAccess } from './access.js'
import { denied, id, kindSchema, scoped, title } from './domain.js'
import { isInternalSpacePath, SpaceDocuments } from './documents.js'
import { coveredByContent } from './content-coverage.js'
import { SpaceKnowledge } from './knowledge.js'
import { assertFolderHasNoResources } from './resource-folders.js'

export const createItemSchema = z.object({ spaceId: id, parentId: id.nullable().default(null), title,
  kind: kindSchema, artifactId: id.optional(), artifactVersionId: id.optional(), content: z.string().max(100000).optional() }).strict()
export const editItemSchema = z.object({ itemId: id, expectedVersion: z.number().int().positive(),
  title: title.optional(), parentId: id.nullable().optional(), deleted: z.boolean().optional() }).strict()

@Injectable()
export class SpacesService {
  constructor(private readonly access: SpaceAccess, private readonly artifacts: SpaceArtifacts, private readonly documents: SpaceDocuments,
    private readonly knowledge: SpaceKnowledge, @InjectRepository(Space) private readonly spaces: Repository<Space>) {}

  /** One extension record per authorized Project, shared by all connected Assistants. */
  async workspace(actor: SpaceActor) {
    const project = await this.access.project(actor)
    const where = { ...scoped(actor), projectId: project.projectId }
    await this.spaces.createQueryBuilder().insert().values({ ...where,
      title: project.name ?? 'Space', ownerId: actor.userId, visibility: 'team'
    }).orIgnore().execute()
    const space = await this.spaces.findOneByOrFail(where)
    if (space.deleted) throw denied()
    return { ...space, title: project.name ?? space.title }
  }
  async list(actor: SpaceActor) {
    const space = await this.workspace(actor)
    return this.tree(actor, space.id)
  }

  async tree(actor: SpaceActor, resourceId: string, trash = false) {
    const principal = await this.access.principal(actor)
    const root = await this.access.resolve(principal, resourceId, trash ? 'manage' : 'read')
    const coverage = await this.documents.resourceCoverage(actor, root.space)
    if (!trash) await this.spaces.manager.transaction(async (manager) => {
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: root.space.id }, lock: { mode: 'pessimistic_write' } })
      await this.documents.discover(actor, root.space, root.canWrite, coverage)
    })
    const all = await this.access.items.find({ where: { ...scoped(actor), spaceId: root.space.id }, order: { createdAt: 'ASC' } })
    const items: Array<SpaceItem & { role: string }> = []
    const descendants = new Set([resourceId])
    // Traverse by identity, never by a path supplied by the client.
    for (let round = 0; round <= all.length; round++) {
      let changed = false
      for (const item of all) if (!descendants.has(item.id) && (resourceId === root.space.id || (item.parentId && descendants.has(item.parentId)))) {
        descendants.add(item.id); changed = true
      }
      if (!changed) break
    }
    for (const item of all) {
      if (!descendants.has(item.id) || item.deleted !== trash ||
        (!trash && item.filePath && (isInternalSpacePath(item.filePath) || coveredByContent(item.filePath, coverage)))) continue
      try {
        const result = await this.access.resolve(principal, item.id, 'read', trash)
        items.push({ ...item, role: result.role, parentId: item.id === resourceId ? null : item.parentId })
      } catch (error) { if (!(error instanceof Error) || error.message !== 'spaces.access_denied') throw error }
    }
    return { root: root.item ?? root.space, role: root.role, canWrite: root.canWrite, canManage: root.canManage, items }
  }

  async createItem(actor: SpaceActor, input: z.infer<typeof createItemSchema>) {
    const access = await this.access.resource(actor, input.parentId ?? input.spaceId, 'write')
    if (access.space.id !== input.spaceId || (access.item && access.item.kind !== 'folder')) throw denied()
    if (input.kind !== 'page' && input.content !== undefined) throw denied()
    const { content, ...fields } = input
    {
      const item = await this.access.items.save(this.access.items.create({
        ...scoped(actor), ...fields, id: randomUUID(), createdById: actor.userId
      }))
      try { await this.documents.initialize(actor, access.space, item, input.kind === 'page' ? Buffer.from(content ?? '', 'utf8') : undefined) }
      catch (error) {
        await this.access.items.update(item.id, { deleted: true })
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
          throw new ConflictException('spaces.file_name_conflict')
        throw error
      }
      if (input.kind === 'page') {
        try { item.artifactId = await this.artifacts.initializePage(actor, item.id, item.title) }
        catch (error) { await this.access.items.update(item.id, { deleted: true }); throw error }
      }
      return item
    }
  }

  async editItem(actor: SpaceActor, input: z.infer<typeof editItemSchema>) {
    const result = await this.access.resource(actor, input.itemId, input.deleted !== undefined ? 'manage' : 'write', input.deleted === false)
    if (!result.item) throw denied()
    if (result.space.projectId && result.item.filePath) {
      const source = result.item
      const sourcePath = result.item.filePath
      const descendants = await this.access.items.findBy({ ...scoped(actor), spaceId: result.space.id })
      if (source.editorKey === 'markdown.tiptap' || descendants.some((item) => item.editorKey === 'markdown.tiptap' && item.filePath?.startsWith(`${source.filePath}/`))) {
        const target = Object.assign(new SpaceItem(), source, { title: input.title ?? source.title,
          parentId: input.parentId === undefined ? source.parentId : input.parentId, deleted: input.deleted ?? source.deleted })
        const destination = input.deleted === true ? `.space-trash/${source.id}/${sourcePath.split('/').pop()}` : await this.documents.path(actor, target)
        await this.documents.content().move({ actor, assistantId: actor.assistantId, projectId: result.space.projectId,
          source: { providerKey: 'spaces', resourceId: source.id }, path: sourcePath, destination,
          title: target.title, parentResourceId: target.parentId, deleted: target.deleted, expectedSourceVersion: input.expectedVersion })
        return this.access.items.findOneByOrFail({ ...scoped(actor), id: source.id })
      }
    }
    let moved: { path: string; destination: string } | undefined
    let changed: SpaceItem[]
    let updated: SpaceItem
    try { updated = await this.spaces.manager.transaction(async (manager) => {
      changed = []
      // A single Space lock prevents concurrent moves from introducing a cycle.
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: result.space.id }, lock: { mode: 'pessimistic_write' } })
      await this.access.resource(actor, input.itemId, input.deleted !== undefined ? 'manage' : 'write', input.deleted === false)
      const repo = manager.getRepository(SpaceItem)
      const item = await repo.findOneByOrFail({ ...scoped(actor), id: input.itemId })
      if (input.deleted === true) await assertFolderHasNoResources(manager, actor, item)
      const previousPath = item.filePath
      if (item.version !== input.expectedVersion) throw new ConflictException('spaces.version_conflict')
      if (input.parentId !== undefined) {
        const parent = await this.access.resource(actor, input.parentId ?? item.spaceId, 'write')
        if (parent.space.id !== item.spaceId || (parent.item && parent.item.kind !== 'folder')) throw denied()
        let cursor = parent.item
        while (cursor) {
          if (cursor.id === item.id) throw new ConflictException('spaces.tree_cycle')
          cursor = cursor.parentId ? await repo.findOneByOrFail({ ...scoped(actor), id: cursor.parentId }) : null
        }
        item.parentId = input.parentId
      }
      if (input.title !== undefined) item.title = input.title
      if (input.deleted !== undefined) item.deleted = input.deleted
      if (result.space.projectId && previousPath) {
        const targetPath = input.deleted === true ? `.space-trash/${item.id}/${previousPath.split('/').pop()}`
          : await this.documents.path(actor, item)
        if (targetPath !== previousPath) {
          await this.documents.api().move({ ...this.documents.scope(actor, result.space), path: previousPath, destination: targetPath })
          moved = { path: targetPath, destination: previousPath }
          const children = await repo.findBy({ ...scoped(actor), spaceId: item.spaceId })
          for (const child of children) {
            if (!child.filePath?.startsWith(`${previousPath}/`)) continue
            child.filePath = `${targetPath}${child.filePath.slice(previousPath.length)}`
            if (input.deleted !== undefined) child.deleted = input.deleted
            child.version++
            await repo.save(child)
            changed.push(child)
          }
          item.filePath = targetPath
        }
      }
      item.version++
      return repo.save(item)
    }) } catch (error) {
      if (moved) {
        try { await this.documents.api().move({ ...this.documents.scope(actor, result.space), ...moved }) }
        catch { await this.access.items.update(input.itemId, { syncStatus: 'failed', syncError: 'spaces.move_recovery_required' }) }
      }
      throw error
    }
    for (const item of [updated, ...changed!]) {
      if (item.editorKey === 'markdown.tiptap' && result.space.projectId && item.filePath) {
        const scope = { actor, projectId: result.space.projectId, assistantId: actor.assistantId, resourceId: item.id }
        if (input.deleted !== undefined) await this.documents.content().setDeleted({ ...scope, deleted: input.deleted })
        if (!item.deleted) await this.documents.content().relocate({ ...scope, path: item.filePath, title: item.title })
      }
      await this.knowledge.sync(actor, result.space, item)
    }
    return updated
  }

}
