import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import {
  ContentDocumentsRuntimeCapability, ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { createHash, randomUUID } from 'node:crypto'
import { SpaceAccess } from './access.js'
import { Space, SpaceItem } from './entities.js'
import { denied, scoped, type SpaceActor } from './domain.js'

export const contentHash = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
export const safeName = (name: string) => name.replace(/[\\/\u0000-\u001f]/gu, '_').replace(/^\.+/u, '_').slice(0, 180) || 'Untitled'
/** Runtime memory and Space checkpoints are infrastructure, not library content. */
export const isInternalSpacePath = (filePath: string) =>
  ['.xpert', '.space-history', '.space-trash'].includes(filePath.split('/')[0])

/** Project files are the portable content; Space rows retain collaboration and presentation metadata. */
@Injectable()
export class SpaceDocuments {
  constructor(readonly access: SpaceAccess, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  content() { return this.runtime.require(ContentDocumentsRuntimeCapability) }
  api() { return this.runtime.require(ProjectFilesRuntimeCapability) }
  scope(actor: SpaceActor, space: Space) {
    if (!space.projectId) throw denied()
    return { actor, projectId: space.projectId }
  }
  async path(actor: SpaceActor, item: SpaceItem) {
    const parent = item.parentId ? await this.access.items.findOneByOrFail({ ...scoped(actor), id: item.parentId }) : null
    if (parent && (parent.kind !== 'folder' || !parent.filePath)) throw denied()
    const name = safeName(item.title)
    return `${parent?.filePath ? `${parent.filePath}/` : ''}${item.kind === 'page' && !name.endsWith('.md') ? `${name}.md` : name}`
  }
  async initialize(actor: SpaceActor, space: Space, item: SpaceItem, content?: Buffer) {
    if (!space.projectId) throw denied()
    if (item.kind === 'page') await this.content().validateImport({ ...this.scope(actor, space),
      assistantId: actor.assistantId, modelKey: 'markdown.tiptap', markdown: content?.toString('utf8') ?? '' })
    const filePath = await this.path(actor, item)
    await this.access.items.update(item.id, { filePath })
    let sha256: string | null = null
    if (item.kind === 'folder') await this.api().mkdir({ ...this.scope(actor, space), path: filePath })
    else if (content) ({ sha256 } = await this.api().write({ ...this.scope(actor, space), path: filePath, buffer: content, expectedHash: null }))
    await this.access.items.update(item.id, { filePath, fileHash: sha256, syncStatus: content || item.kind === 'folder' ? 'ready' : 'pending' })
    Object.assign(item, { filePath, fileHash: sha256 })
    if (item.kind === 'page') await this.registerPage(actor, space, item)
    return item
  }
  /** Register the file on creation/discovery; opening a page never migrates or mutates its model. */
  async registerPage(actor: SpaceActor, space: Space, item: SpaceItem) {
    if (!item.filePath) throw denied()
    await this.content().register({ ...this.scope(actor, space), assistantId: actor.assistantId,
      resourceId: item.id, path: item.filePath, title: item.title, modelKey: 'markdown.tiptap',
      source: { providerKey: 'spaces', resourceId: item.id } })
    await this.access.items.update(item.id, { editorKey: 'markdown.tiptap' })
    item.editorKey = 'markdown.tiptap'
  }
  async write(actor: SpaceActor, itemId: string, buffer: Buffer) {
    const { space, item } = await this.access.resource(actor, itemId, 'write')
    if (!space.projectId || !item?.filePath) throw denied()
    if (item.editorKey === 'markdown.tiptap') throw new ConflictException('spaces.editor_api_required')
    const { sha256 } = await this.api().write({ ...this.scope(actor, space), path: item.filePath, buffer, expectedHash: item.fileHash })
    await this.access.items.update(item.id, { fileHash: sha256, syncStatus: 'ready', syncError: null })
    return { sha256, filePath: item.filePath, projectId: space.projectId }
  }
  async read(actor: SpaceActor, space: Space, item: SpaceItem) {
    if (!space.projectId) throw denied()
    if (!item.filePath) return null
    return this.api().read({ ...this.scope(actor, space), path: item.filePath })
  }
  private async editableMarkdown(actor: SpaceActor, space: Space, buffer: Buffer) {
    try {
      await this.content().validateImport({ ...this.scope(actor, space), assistantId: actor.assistantId,
        modelKey: 'markdown.tiptap', markdown: buffer.toString('utf8') })
      return true
    } catch (error) {
      // Unsupported portable Markdown remains a downloadable file; permission/infrastructure errors propagate.
      if (error instanceof BadRequestException) return false
      throw error
    }
  }
  /** Discover files created by other Assistants without importing hidden version/trash storage. */
  async discover(actor: SpaceActor, space: Space, canWrite: boolean) {
    if (!space.projectId) throw denied()
    const files = await this.api().list({ ...this.scope(actor, space), depth: 12 })
    const existing = await this.access.items.findBy({ ...scoped(actor), spaceId: space.id })
    if (existing.some((item) => item.syncError === 'spaces.location_pending')) return
    const byPath = new Map(existing.filter((item) => item.filePath && !item.deleted).map((item) => [item.filePath!, item]))
    for (const file of files.sort((a, b) => a.path.split('/').length - b.path.split('/').length)) {
      if (isInternalSpacePath(file.path)) continue
      const known = byPath.get(file.path)
      if (known) {
        // Resume a first registration interrupted after inserting the navigation row.
        // Readers can discover portable files; only editors may initialize collaborative state.
        if (canWrite && !known.editorKey && (known.kind === 'page' ||
          (known.kind === 'file' && file.path.endsWith('.md') && file.size <= 100000))) {
          const source = await this.api().read({ ...this.scope(actor, space), path: file.path })
          if (await this.editableMarkdown(actor, space, source.buffer)) {
            await this.registerPage(actor, space, known)
            await this.access.items.update(known.id, { kind: 'page' })
          }
        }
        continue
      }
      const parentPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''
      const parentId = parentPath ? byPath.get(parentPath)?.id : null
      if (parentPath && !parentId) continue
      const name = file.path.split('/').pop()!
      let kind: SpaceItem['kind'] = file.kind === 'directory' ? 'folder' : canWrite && name.endsWith('.md') && file.size <= 100000 ? 'page' : 'file'
      const content = kind === 'page' ? await this.api().read({ ...this.scope(actor, space), path: file.path }) : null
      if (content && !(await this.editableMarkdown(actor, space, content.buffer))) kind = 'file'
      {
        await this.access.items.createQueryBuilder().insert().values({
          ...scoped(actor), spaceId: space.id, id: randomUUID(), parentId: parentId ?? null,
          createdById: actor.userId, title: kind === 'page' ? name.slice(0, -3) : name, kind,
          filePath: file.path, fileHash: content?.sha256 ?? null,
          markdown: content?.buffer.toString('utf8') ?? '', syncStatus: 'ready'
        }).orIgnore().execute()
        const item = await this.access.items.findOneByOrFail({ ...scoped(actor), spaceId: space.id, filePath: file.path, deleted: false })
        if (kind === 'page') await this.registerPage(actor, space, item)
        byPath.set(file.path, item)
      }
    }
  }
}
