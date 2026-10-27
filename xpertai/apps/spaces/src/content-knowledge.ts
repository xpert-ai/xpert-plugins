import { Injectable, Inject, ForbiddenException, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'node:crypto'
import { KBDocumentStatusEnum, type ContentCatalogItem } from '@xpert-ai/contracts'
import { ContentResourcesRuntimeCapability, KnowledgebaseDocumentsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SpaceContentIndex, Space } from './entities.js'
import { scoped, type SpaceActor } from './domain.js'

const documentMetadata = z.object({ documentId: z.string().uuid() }).passthrough()
/** Every result rechecks the live ACL, binding and source revision before returning
 * cached text, a title or an anchor. Interrupted projections remain retryable. */
@Injectable()
export class SpaceContentKnowledge {
  constructor(@InjectRepository(SpaceContentIndex) private readonly rows: Repository<SpaceContentIndex>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private get catalog() { return this.runtime.require(ContentResourcesRuntimeCapability).catalog }
  private scope(actor: SpaceActor, space: Space) { return { actor, projectId: space.projectId, assistantId: actor.assistantId } }
  private async all(actor: SpaceActor, space: Space, deleted = false) {
    const items: ContentCatalogItem[] = []
    for (let offset = 0; ; offset += 100) {
      const page = await this.catalog.list({ ...this.scope(actor, space), offset, limit: 100, deleted, excludedProviderKeys: ['spaces'] })
      items.push(...page.items)
      if (!page.hasMore) return items
    }
  }
  async refresh(actor: SpaceActor, space: Space) {
    if (!space.knowledgebaseId) return
    for (const item of [...await this.all(actor, space), ...await this.all(actor, space, true)]) await this.refreshItem(actor, space, item)
  }
  async refreshItem(actor: SpaceActor, space: Space, item: ContentCatalogItem) {
    if (!space.knowledgebaseId || item.resourceRef.providerKey === 'spaces') return
    const documents = this.runtime.require(KnowledgebaseDocumentsRuntimeCapability)
      const where = { ...scoped(actor), spaceId: space.id, contentId: item.contentId }
      await this.rows.createQueryBuilder().insert().values({ ...where }).orIgnore().execute()
      // Serialize only this projection; the durable pending row survives an interruption.
      await this.rows.manager.transaction(async manager => {
        const repo = manager.getRepository(SpaceContentIndex)
        const row = await repo.findOneOrFail({ where, lock: { mode: 'pessimistic_write' } })
        try {
          if (item.deleted) {
            if (row.documents.length) await documents.deleteDocuments({ knowledgebaseId: space.knowledgebaseId!, documentIds: row.documents.map(doc => doc.id) })
            await repo.update(row.id, { documents: [], revision: item.revision, bindingRevision: item.bindingRevision, status: 'ready' }); return
          }
          if (row.revision === item.revision && row.bindingRevision === item.bindingRevision && row.documents.length) {
            const status = await documents.getDocumentStatus({ knowledgebaseId: space.knowledgebaseId!, documentIds: row.documents.map(doc => doc.id) })
            const failed = status.documents.filter(doc => doc.status === KBDocumentStatusEnum.ERROR).map(doc => doc.id)
            if (failed.length) await documents.startProcessing({ knowledgebaseId: space.knowledgebaseId!, documentIds: failed })
            return
          }
          const projection = await this.catalog.projectText({ ...this.scope(actor, space), contentId: item.contentId, expectedRevision: item.revision })
          if (!projection) return
          const next: SpaceContentIndex['documents'] = []
          for (const section of projection.sections.filter(section => section.text.trim())) {
            const hash = createHash('sha256').update(JSON.stringify([item.bindingRevision, projection.revision, section])).digest('hex')
            const file = await documents.uploadFile({ knowledgebaseId: space.knowledgebaseId!, path: `content/${item.contentId}/${hash}`,
              file: { buffer: Buffer.from(section.text), originalname: `${hash}.txt` } })
            const created = await documents.createDocuments({ knowledgebaseId: space.knowledgebaseId!, idempotencyKey: `content:${item.contentId}:${hash}`,
              documents: [{ name: item.title, filePath: file.filePath, fileUrl: file.fileUrl, mimeType: 'text/plain', size: file.size,
                metadata: { contentId: item.contentId, sourceRevision: item.revision, bindingRevision: item.bindingRevision, anchor: section.anchor } }], process: true })
            if (!created.documents[0]) throw new Error('spaces.index_document_missing')
            next.push({ id: created.documents[0].id, anchor: section.anchor })
          }
          const current = await this.catalog.get({ ...this.scope(actor, space), contentId: item.contentId })
          if (current.deleted || current.revision !== item.revision || current.bindingRevision !== item.bindingRevision) {
            if (next.length) await documents.deleteDocuments({ knowledgebaseId: space.knowledgebaseId!, documentIds: next.map(doc => doc.id) })
            await repo.update(row.id, { status: 'pending' }); return
          }
          await repo.update(row.id, { documents: next, revision: item.revision, bindingRevision: item.bindingRevision, status: next.length ? 'processing' : 'ready' })
          const obsolete = row.documents.filter(doc => !next.some(candidate => candidate.id === doc.id))
          if (obsolete.length) await documents.deleteDocuments({ knowledgebaseId: space.knowledgebaseId!, documentIds: obsolete.map(doc => doc.id) })
        } catch { await repo.update(row.id, { status: 'failed' }) }
      })
  }
  async status(actor: SpaceActor, space: Space) {
    const result: Array<{ itemId: string; title: string; status: string; error: string | null; document: null }> = []
    for (const row of await this.rows.findBy({ ...scoped(actor), spaceId: space.id })) {
      let item: ContentCatalogItem
      try { item = await this.catalog.get({ ...this.scope(actor, space), contentId: row.contentId }) }
      catch (error) { if (error instanceof ForbiddenException || error instanceof NotFoundException) continue; throw error }
      if (item.deleted || item.availability === 'provider-unavailable') continue
      let status = row.revision === item.revision && row.bindingRevision === item.bindingRevision ? row.status : 'pending'
      if (status === 'processing' && space.knowledgebaseId) {
        const processing = await this.runtime.require(KnowledgebaseDocumentsRuntimeCapability).getDocumentStatus({ knowledgebaseId: space.knowledgebaseId, documentIds: row.documents.map(doc => doc.id) })
        status = processing.documents.some(doc => doc.status === KBDocumentStatusEnum.ERROR) ? 'failed'
          : processing.documents.length === row.documents.length && processing.documents.every(doc => doc.status === KBDocumentStatusEnum.FINISH) ? 'ready' : 'processing'
      }
      result.push({ itemId: row.contentId, title: item.title, status, error: status === 'failed' ? 'spaces.index_failed' : null, document: null })
    }
    return result
  }
  async matches(actor: SpaceActor, space: Space, hits: Array<{ metadata?: unknown; pageContent: string }>) {
    const rows = await this.rows.findBy({ ...scoped(actor), spaceId: space.id })
    const result: Array<{ itemId: string; contentId: string; title: string; text: string; filePath: string; hash: string; anchor: { kind: string; id: string } }> = []
    for (const hit of hits) {
      const meta = documentMetadata.safeParse(hit.metadata)
      if (!meta.success) continue
      const row = rows.find(row => row.documents.some(doc => doc.id === meta.data.documentId))
      if (!row) continue
      let item: ContentCatalogItem
      try { item = await this.catalog.get({ ...this.scope(actor, space), contentId: row.contentId }) }
      catch (error) { if (error instanceof ForbiddenException || error instanceof NotFoundException) continue; throw error }
      if (item.deleted || item.availability === 'provider-unavailable' || item.revision !== row.revision || item.bindingRevision !== row.bindingRevision) continue
      result.push({ itemId: item.contentId, contentId: item.contentId, title: item.title, text: hit.pageContent, filePath: '',
        hash: `${item.bindingRevision}:${item.revision}`, anchor: row.documents.find(doc => doc.id === meta.data.documentId)!.anchor })
    }
    return result
  }
  async verify(actor: SpaceActor, contentId: string, hash: string) {
    if (!actor.projectId) return false
    const item = await this.catalog.get({ actor, projectId: actor.projectId, assistantId: actor.assistantId, contentId })
    return !item.deleted && `${item.bindingRevision}:${item.revision}` === hash
  }
}
