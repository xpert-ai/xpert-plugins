import { ConflictException, Injectable } from '@nestjs/common'
import type { ContentSourceInput } from '@xpert-ai/plugin-sdk'
import type { ContentPageHierarchy } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { SpaceAccess } from './access.js'
import { Space, SpaceItem } from './entities.js'
import { SpaceDocuments, contentHash, safeName } from './documents.js'
import { SpaceArtifacts } from './artifacts.js'
import { denied, scoped } from './domain.js'

const create = z.object({ requestId: z.string().uuid(), title: z.string().trim().min(1).max(180) })
const missing = (error: unknown) => error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
const entry = (item: SpaceItem) => ({ resourceId: item.id, title: item.title, path: item.filePath! })

/** Logical hierarchy is metadata, never an ACL or a disguised file folder.
 * Each create owns one stable resource/path. Retry resumes publication instead of duplicating a child.
 * Parent rename/move/trash does not mutate independent child files; a restored parent reconnects them.
 */
@Injectable()
export class SpaceSubpages {
  constructor(private readonly access: SpaceAccess, private readonly documents: SpaceDocuments, private readonly artifacts: SpaceArtifacts) {}
  private actor(input: ContentSourceInput) { return { ...input.actor, projectId: input.projectId, assistantId: input.assistantId } }
  private async parent(input: ContentSourceInput, write = false) {
    const result = await this.access.resource(this.actor(input), input.sourceResourceId, write ? 'write' : 'read')
    if (!result.item || result.item.kind !== 'page' || !result.item.filePath || result.space.projectId !== input.projectId) throw denied()
    return { ...result, item: result.item }
  }
  async hierarchy(input: ContentSourceInput): Promise<ContentPageHierarchy> {
    const { item, space, canWrite } = await this.parent(input)
    const actor = this.actor(input)
    const visible = async (candidate: SpaceItem | null) => {
      if (!candidate || candidate.deleted || candidate.editorKey !== 'markdown.tiptap' || !candidate.filePath) return null
      try { await this.access.resource(actor, candidate.id, 'read'); return entry(candidate) }
      catch (error) { if (error instanceof Error && error.message === 'spaces.access_denied') return null; throw error }
    }
    const parent = item.parentPageId ? await visible(await this.access.items.findOneBy({ ...scoped(actor), spaceId: space.id, id: item.parentPageId })) : null
    const rows = await this.access.items.find({ where: { ...scoped(actor), spaceId: space.id, parentPageId: item.id, deleted: false },
      order: { createdAt: 'ASC' }, take: 101 })
    const children = (await Promise.all(rows.slice(0, 100).map(visible))).filter((value) => value !== null)
    return { supported: true, canCreate: canWrite, parent, children, hasMore: rows.length > 100 }
  }
  async createChild(input: ContentSourceInput & { title: string; requestId: string }) {
    const request = create.parse(input), actor = this.actor(input)
    const { space } = await this.parent(input, true)
    // Use the same Space lock as folder moves/discovery. Only the lock uses this transaction;
    // publication is a retryable saga and its intent must survive process failure.
    return this.access.items.manager.transaction(async (manager) => {
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: space.id }, lock: { mode: 'pessimistic_write' } })
      const { item: parent } = await this.parent(input, true)
      let item = await this.access.items.findOneBy({ id: request.requestId })
      if (item && (item.tenantId !== actor.tenantId || item.organizationId !== actor.organizationId || item.spaceId !== space.id ||
        item.parentPageId !== parent.id || item.childRequestTitle !== request.title || item.createdById !== actor.userId || item.deleted))
        throw new ConflictException('spaces.child_request_conflict')
      if (!item) {
        // New IDs cannot make cycles. Bound depth so corrupt legacy metadata cannot loop forever.
        // Count the child itself as level one, then count its ancestors.
        let cursor: SpaceItem | null = parent, depth = 1
        while (cursor) {
          if (++depth > 32 || cursor.id === request.requestId) throw new ConflictException('spaces.page_depth')
          cursor = cursor.parentPageId ? await this.access.items.findOneBy({ ...scoped(actor), spaceId: space.id, id: cursor.parentPageId }) : null
        }
        const directory = parent.filePath!.slice(0, parent.filePath!.lastIndexOf('/') + 1)
        // Resource suffix avoids collisions between equally named children and unrelated files.
        const filePath = `${directory}${safeName(request.title).slice(0, 100)}--${request.requestId}.md`
        item = await this.access.items.save(this.access.items.create({ ...scoped(actor), id: request.requestId,
          spaceId: space.id, parentId: parent.parentId, parentPageId: parent.id, childRequestTitle: request.title,
          createdById: actor.userId, kind: 'page', title: request.title, filePath, syncStatus: 'pending' }))
      }
      if (item.editorKey === 'markdown.tiptap') return { documentId: item.id }
      const fileScope = { actor, projectId: input.projectId, path: item.filePath! }
      const markdown = `# ${request.title.replace(/[\\`*_{}\[\]()#+.!<>|$]/gu, '\\$&')}\n\n`
      const buffer = Buffer.from(markdown), hash = contentHash(buffer)
      const disk = await this.documents.api().read(fileScope).catch((error: unknown) => { if (missing(error)) return null; throw error })
      if (disk && disk.sha256 !== (item.fileHash ?? hash)) throw new ConflictException('spaces.file_conflict')
      if (!disk) {
        if (item.fileHash) throw new ConflictException('spaces.file_conflict')
        await this.documents.api().write({ ...fileScope, buffer, expectedHash: null })
      }
      await this.access.items.update(item.id, { fileHash: disk?.sha256 ?? hash, syncStatus: 'ready' })
      await this.documents.content().register({ actor, assistantId: input.assistantId, projectId: input.projectId,
        resourceId: item.id, path: item.filePath!, title: item.title, modelKey: 'markdown.tiptap', source: { providerKey: 'spaces', resourceId: item.id } })
      if (!item.artifactId) await this.artifacts.initializePage(actor, item.id, item.title)
      await this.access.items.update(item.id, { editorKey: 'markdown.tiptap' })
      return { documentId: item.id }
    })
  }
}
