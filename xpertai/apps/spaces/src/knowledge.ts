import { ForbiddenException, Inject, Injectable } from '@nestjs/common'
import {
  ProjectKnowledgeRuntimeCapability, KnowledgebaseDocumentsRuntimeCapability, KnowledgebaseRuntimeCapability,
  ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { KBDocumentStatusEnum } from '@xpert-ai/contracts'
import { SpaceContentKnowledge } from './content-knowledge.js'
import { SpaceAccess } from './access.js'
import { denied, scoped, type SpaceActor } from './domain.js'
import { Space, SpaceItem } from './entities.js'

const metadata = z.object({ spaceItemId: z.string().uuid(), spaceFileHash: z.string() }).passthrough()
const documentMetadata = z.object({ documentId: z.string().uuid() }).passthrough()

@Injectable()
export class SpaceKnowledge {
  constructor(private readonly access: SpaceAccess, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry, private readonly content: SpaceContentKnowledge) {}
  async enable(actor: SpaceActor, spaceId: string) {
    const { space } = await this.access.resource(actor, spaceId, 'manage')
    if (!space.projectId) throw denied()
    const result = await this.runtime.require(ProjectKnowledgeRuntimeCapability).ensureBinding({
      actor, title: space.title, projectId: space.projectId
    })
    await this.access.spaces.update(space.id, { knowledgebaseId: result.knowledgebaseId })
    return result
  }
  async sync(actor: SpaceActor, space: Space, item: SpaceItem) {
    if (!space.knowledgebaseId || !space.projectId || item.kind === 'folder' || !item.filePath) return
    try {
      item = await this.access.items.findOneByOrFail({ ...scoped(actor), id: item.id, spaceId: space.id })
      if (!item.filePath || item.kind === 'folder') return
      const documents = this.runtime.require(KnowledgebaseDocumentsRuntimeCapability)
      await this.access.project(actor, space.projectId, 'write')
      if (item.deleted) {
        if (item.knowledgeDocumentId) await documents.deleteDocuments({ knowledgebaseId: space.knowledgebaseId, documentIds: [item.knowledgeDocumentId] })
        await this.access.items.update(item.id, { knowledgeDocumentId: null, indexedHash: null, indexStatus: 'pending', indexError: null })
        return
      }
      const source = await this.runtime.require(ProjectFilesRuntimeCapability).read({ actor, projectId: space.projectId, path: item.filePath })
      // External changes must be reconciled before indexing a collaborative page.
      // A superseded sync must never replace the index pointer of a newer edit.
      if (item.fileHash !== source.sha256) return
      if (item.indexedHash === source.sha256 && item.knowledgeDocumentId) {
        const current = await documents.getDocumentStatus({ knowledgebaseId: space.knowledgebaseId, documentIds: [item.knowledgeDocumentId] })
        if (current.documents[0]?.status === KBDocumentStatusEnum.ERROR)
          await documents.startProcessing({ knowledgebaseId: space.knowledgebaseId, documentIds: [item.knowledgeDocumentId] })
        return
      }
      const file = await documents.uploadFile({ knowledgebaseId: space.knowledgebaseId,
        path: `${item.id}/${source.sha256}`, file: { buffer: source.buffer, originalname: item.filePath.split('/').pop() } })
      const result = await documents.createDocuments({
        knowledgebaseId: space.knowledgebaseId, idempotencyKey: `space:${item.id}:${source.sha256}`,
        documents: [{ name: item.title, filePath: file.filePath, fileUrl: file.fileUrl, mimeType: file.mimeType?.split(';')[0], size: file.size,
          metadata: { spaceItemId: item.id, spaceFileHash: source.sha256, projectId: space.projectId, projectPath: item.filePath } }],
        process: true
      })
      const created = result.documents[0]
      if (!created) throw new Error('spaces.index_document_missing')
      const updated = await this.access.items.update({ id: item.id, deleted: false, fileHash: source.sha256 },
        { knowledgeDocumentId: created.id, indexedHash: source.sha256, indexStatus: 'processing', indexError: null })
      if (!updated.affected) return
      if (item.knowledgeDocumentId && item.knowledgeDocumentId !== created.id)
        await documents.deleteDocuments({ knowledgebaseId: space.knowledgebaseId, documentIds: [item.knowledgeDocumentId] })
    } catch (error) {
      if (item.fileHash) await this.access.items.update({ id: item.id, fileHash: item.fileHash, deleted: item.deleted },
        { indexStatus: 'failed', indexError: error instanceof Error ? error.message.slice(0, 1000) : 'spaces.index_failed' })
    }
  }
  async refresh(actor: SpaceActor, spaceId: string) {
    const { space } = await this.access.resource(actor, spaceId, 'write')
    const items = await this.access.items.findBy({ ...scoped(actor), spaceId })
    for (const item of items) await this.sync(actor, space, item)
    await this.content.refresh(actor, space)
    return this.status(actor, spaceId)
  }
  async status(actor: SpaceActor, spaceId: string) {
    const { space } = await this.access.resource(actor, spaceId, 'read')
    const items = await this.access.items.findBy({ ...scoped(actor), spaceId })
    const documents = space.knowledgebaseId && items.some((item) => item.knowledgeDocumentId)
      ? await this.runtime.require(KnowledgebaseDocumentsRuntimeCapability).getDocumentStatus({
        knowledgebaseId: space.knowledgebaseId, documentIds: items.flatMap((item) => item.knowledgeDocumentId ? [item.knowledgeDocumentId] : [])
      }) : { documents: [] }
    for (const item of items) {
      const document = documents.documents.find((doc) => doc.id === item.knowledgeDocumentId)
      if (!document) continue
      const status = document.status === KBDocumentStatusEnum.FINISH ? 'ready' : document.status === KBDocumentStatusEnum.ERROR ? 'failed' : 'processing'
      const error = status === 'failed' ? document.processMsg ?? 'spaces.index_failed' : null
      if (item.indexStatus !== status || item.indexError !== error) await this.access.items.update(item.id, { indexStatus: status, indexError: error })
      item.indexStatus = status; item.indexError = error
    }
    return { knowledgebaseId: space.knowledgebaseId, mode: 'keyword', items: [...await this.content.status(actor, space), ...items.filter((item) => item.kind !== 'folder' && !item.deleted).map((item) => ({
      itemId: item.id, title: item.title, status: item.indexStatus, error: item.indexError,
      document: documents.documents.find((doc) => doc.id === item.knowledgeDocumentId) ?? null
    }))] }
  }
  async search(actor: SpaceActor, spaceId: string, query: string) {
    const { space } = await this.access.resource(actor, spaceId, 'read')
    if (!space.knowledgebaseId) return []
    const result = await this.runtime.require(KnowledgebaseRuntimeCapability).search({
      knowledgebaseIds: [space.knowledgebaseId], query, k: 20, source: 'spaces', retrieval: { mode: 'keyword' }
    })
    const matches: Array<{ itemId: string; title: string; text: string; filePath: string; hash: string }> = []
    for (const document of result.documents) {
      const data = metadata.safeParse(document.metadata)
      const source = documentMetadata.safeParse(document.metadata)
      // Platform parsers retain documentId on chunks; custom import metadata lives on the document.
      const indexedItem = source.success ? await this.access.items.findOneBy({
        ...scoped(actor), spaceId, knowledgeDocumentId: source.data.documentId, deleted: false
      }) : null
      const itemId = data.success ? data.data.spaceItemId : indexedItem?.id
      const hash = data.success ? data.data.spaceFileHash : indexedItem?.indexedHash
      if (!itemId || !hash) continue
      let item: SpaceItem | null
      try { ({ item } = await this.access.resource(actor, itemId, 'read')) }
      catch (error) { if (error instanceof ForbiddenException) continue; throw error }
      if (!item?.filePath || item.deleted || item.spaceId !== spaceId || !space.projectId) continue
      const file = await this.runtime.require(ProjectFilesRuntimeCapability).read({ actor, projectId: space.projectId, path: item.filePath })
      if (file.sha256 !== hash) continue
      matches.push({ itemId: item.id, title: item.title, text: document.pageContent, filePath: item.filePath, hash })
    }
    return [...matches, ...await this.content.matches(actor, space, result.documents)]
  }
  async verify(actor: SpaceActor, itemId: string, hash: string, contentId?: string) {
    if (contentId) return this.content.verify(actor, contentId, hash)
    const { item, space } = await this.access.resource(actor, itemId, 'read')
    if (!item?.filePath || !space.projectId) return false
    const file = await this.runtime.require(ProjectFilesRuntimeCapability).read({ actor, projectId: space.projectId, path: item.filePath })
    return file.sha256 === hash
  }
}
