import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { ConnectorDocumentsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SpaceAccess } from './access.js'
import { SpaceDocuments, contentHash, safeName } from './documents.js'
import { SpaceArtifacts } from './artifacts.js'
import { Space, SpaceItem } from './entities.js'
import { denied, id, scoped, type SpaceActor } from './domain.js'

export const sourceSelection = z.object({ bindingId: id, locator: z.string().trim().min(1).max(2000) }).strict()
export const importSelection = sourceSelection.extend({ spaceId: id, parentId: id.nullable().default(null), requestId: id,
  expectedRevision: z.string().min(1).max(200), expectedHash: z.string().regex(/^[a-f0-9]{64}$/u), confirmed: z.literal(true) }).strict()
const missing = (error: unknown) => error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
/** Encode remote plain text as literal Markdown paragraphs, never executable HTML. Encode colons to prevent autolinks from consuming Markdown escapes. */
export const literalMarkdown = (text: string) => text.replace(/\r\n?/gu, '\n').replace(/\u0000/gu, '')
  .replace(/[&:\\`*_{}\[\]()#+.!<>|$~-]/gu, (char) => char === '&' || char === ':' ? `&#${char.codePointAt(0)};` : `\\${char}`).split('\n').join('\n\n')

@Injectable()
export class SpaceImports {
  constructor(private readonly access: SpaceAccess, private readonly documents: SpaceDocuments, private readonly artifacts: SpaceArtifacts,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private context(actor: SpaceActor) {
    if (!actor.assistantId || !actor.projectId) throw denied()
    return { actor, assistantId: actor.assistantId, projectId: actor.projectId }
  }
  private api() { return this.runtime.require(ConnectorDocumentsRuntimeCapability) }
  async sources(actor: SpaceActor) {
    await this.access.project(actor, actor.projectId, 'write')
    return this.api().sources(this.context(actor))
  }
  async search(actor: SpaceActor, input: { bindingId: string; query: string; cursor?: string; pageSize: number }) {
    await this.access.project(actor, actor.projectId, 'write')
    return this.api().search({ ...this.context(actor), ...input })
  }
  async preview(actor: SpaceActor, input: z.infer<typeof sourceSelection>) {
    const sources = await this.sources(actor), source = sources.items.find((entry) => entry.bindingId === input.bindingId && entry.available)
    if (!source) throw denied()
    const snapshot = await this.api().read({ ...this.context(actor), ...input })
    if (snapshot.format !== 'text/plain') throw new BadRequestException('spaces.import_format_unsupported')
    return { ...snapshot, provider: source.provider }
  }
  async apply(actor: SpaceActor, input: z.infer<typeof importSelection>) {
    if (!input.confirmed) throw new BadRequestException('spaces.import_confirmation_required')
    const context = this.context(actor)
    const target = async () => {
      const result = await this.access.resource(actor, input.parentId ?? input.spaceId, 'write')
      if (result.space.id !== input.spaceId || result.space.projectId !== context.projectId || (result.item && result.item.kind !== 'folder')) throw denied()
      return result
    }
    const { space } = await target()
    // A stable request binds all preview/target fields, but stores no credentials or raw pasted URL.
    const requestHash = contentHash(Buffer.from(JSON.stringify({ ...input, confirmed: undefined, requestId: undefined })))
    const existing = await this.access.items.findOneBy({ id: input.requestId })
    const check = (item: SpaceItem) => {
      if (item.tenantId !== actor.tenantId || item.organizationId !== actor.organizationId || item.spaceId !== input.spaceId ||
        item.createdById !== actor.userId || item.deleted || item.importOrigin?.requestHash !== requestHash)
        throw new ConflictException('spaces.import_request_conflict')
    }
    if (existing) {
      check(existing)
      // A completed copy is a project resource: remote revocation never deletes it or prevents retry receipts.
      await this.access.resource(actor, existing.id, 'write')
      if (existing.editorKey === 'markdown.tiptap') return { resourceId: existing.id }
    }
    const snapshot = await this.preview(actor, input)
    if (snapshot.revision !== input.expectedRevision || snapshot.contentHash !== input.expectedHash)
      throw new ConflictException('spaces.import_source_changed')
    const text = `# ${literalMarkdown(snapshot.title)}\n\n${literalMarkdown(snapshot.content)}\n`
    await this.documents.content().validateImport({ ...context, modelKey: 'markdown.tiptap', markdown: text })
    const buffer = Buffer.from(text), hash = contentHash(buffer)
    // Serialize with discovery/moves. Persist the intent outside the lock transaction so an interrupted
    // file/register step resumes the same ID and CAS-protected file rather than creating another copy.
    return this.access.items.manager.transaction(async (manager) => {
      await manager.getRepository(Space).findOneOrFail({ where: { ...scoped(actor), id: space.id }, lock: { mode: 'pessimistic_write' } })
      const destination = await target()
      let item = await this.access.items.findOneBy({ id: input.requestId })
      if (item) { check(item); if (item.editorKey === 'markdown.tiptap') return { resourceId: item.id } }
      else {
        const prefix = destination.item?.filePath ? `${destination.item.filePath}/` : ''
        item = await this.access.items.save(this.access.items.create({ ...scoped(actor), id: input.requestId, spaceId: space.id,
          parentId: input.parentId, createdById: actor.userId, kind: 'page', title: snapshot.title,
          filePath: `${prefix}${safeName(snapshot.title).slice(0, 100)}--${input.requestId}.md`, syncStatus: 'pending',
          importOrigin: { provider: snapshot.provider, documentId: snapshot.id, url: snapshot.url, revision: snapshot.revision,
            contentHash: snapshot.contentHash, format: snapshot.format, importedAt: new Date().toISOString(),
            warnings: snapshot.warnings, bindingId: input.bindingId, requestHash } }))
      }
      const fileScope = { actor, projectId: context.projectId, path: item.filePath! }
      const disk = await this.documents.api().read(fileScope).catch((error: unknown) => { if (missing(error)) return null; throw error })
      if (disk && disk.sha256 !== (item.fileHash ?? hash)) throw new ConflictException('spaces.file_conflict')
      if (!disk) {
        if (item.fileHash) throw new ConflictException('spaces.file_conflict')
        await this.documents.api().write({ ...fileScope, buffer, expectedHash: null })
      }
      await this.access.items.update(item.id, { fileHash: disk?.sha256 ?? hash, syncStatus: 'ready' })
      await this.documents.content().register({ ...context, resourceId: item.id, path: item.filePath!, title: item.title,
        modelKey: 'markdown.tiptap', source: { providerKey: 'spaces', resourceId: item.id } })
      if (!item.artifactId) await this.artifacts.initializePage(actor, item.id, item.title)
      await this.access.items.update(item.id, { editorKey: 'markdown.tiptap' })
      return { resourceId: item.id }
    })
  }
}
