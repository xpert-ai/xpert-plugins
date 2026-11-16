import { Inject, Injectable } from '@nestjs/common'
import { In } from 'typeorm'
import { ContentEditorsRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry, type ContentCatalogProvider, type ContentSourceInput, type ContentDocumentScope } from '@xpert-ai/plugin-sdk'
import type { ContentResourceSnapshot } from '@xpert-ai/contracts'
import { SpaceAccess } from './access.js'
import { scoped, denied } from './domain.js'
import { SpaceContentKnowledge } from './content-knowledge.js'
import { fileFormat } from './file-format.js'
import type { SpaceItem } from './entities.js'

const models = {
  page: { typeId: 'xpert.markdown', modelId: 'markdown.tiptap', schemaVersion: '1', editProtocol: { id: 'platform.text-document', version: '1' } },
  file: { typeId: 'xpert.file', modelId: 'platform.file', schemaVersion: '1', editProtocol: { id: 'platform.file.cas', version: '1' } }
}
/** Exposes native SpaceItems to the platform content catalog without copying content.
 * Pages/files retain their identities, file paths and editing protocols. Creation
 * uses the page/upload workflows; discovery rebuilds only derived catalog entries. */
@Injectable()
export class SpaceItemCatalog {
  constructor(private readonly access: SpaceAccess, private readonly knowledge: SpaceContentKnowledge,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private async formats(scope: ContentDocumentScope) {
    return (await this.runtime.require(ContentEditorsRuntimeCapability).list(scope))
      .filter(editor => editor.kind === 'file')
  }
  async fileFormat(scope: ContentDocumentScope, item: SpaceItem) {
    return fileFormat(item, await this.formats(scope))
  }
  readonly catalog: ContentCatalogProvider = {
    resolveFile: async input => {
      const space = await this.access.spaces.findOneBy({ ...scoped(input.actor), projectId: input.projectId })
      if (!space) return null
      await this.access.project({ ...input.actor, assistantId: input.assistantId }, input.projectId)
      const item = await this.access.items.findOneBy({ ...scoped(input.actor), spaceId: space.id, filePath: input.path })
      if (!item || item.kind === 'folder') return null
      return item.kind === 'page' || item.editorKey || await this.fileFormat(input, item) ? item.id : null
    },
    types: [
      { ...models.page, creatable: false, title: { en_US: 'Pages', zh_Hans: '页面' }, implementationKey: 'spaces.page', implementationTitle: { en_US: 'Markdown', zh_Hans: 'Markdown' }, defaultEditorKey: 'markdown.tiptap' },
      { ...models.file, creatable: false, title: { en_US: 'Files', zh_Hans: '文件' }, implementationKey: 'spaces.file', implementationTitle: { en_US: 'File', zh_Hans: '文件' }, defaultEditorKey: 'platform.file' }
    ],
    // File codecs declare their model; Spaces remains format-agnostic and owns the same item/file/version.
    listTypes: async scope => (await this.formats(scope)).flatMap(editor => editor.resourceType ? [{ ...editor.resourceType, creatable: false }] : []),
    discover: async input => {
      const space = await this.access.spaces.findOneBy({ ...scoped(input.actor), projectId: input.projectId, deleted: false })
      if (!space) return { resourceIds: [] }
      await this.access.project({ ...input.actor, assistantId: input.assistantId }, input.projectId)
      const offset = Number(input.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw denied()
      const items = await this.access.items.find({ where: { ...scoped(input.actor), spaceId: space.id, kind: In(['page', 'file', 'artifact']), deleted: false }, order: { id: 'ASC' }, skip: offset, take: 100 })
      return { resourceIds: items.filter(item => item.filePath).map(item => item.id), ...(items.length === 100 ? { nextCursor: String(offset + 100) } : {}) }
    },
    describe: input => this.describe(input),
    onResourceReconciled: async input => {
      if (input.item.resourceRef.providerKey === 'spaces') return
      const space = await this.access.spaces.findOneBy({ ...scoped(input.actor), projectId: input.projectId, deleted: false })
      if (!space?.knowledgebaseId) return
      const actor = { ...input.actor, projectId: input.projectId, assistantId: input.assistantId }
      await this.access.project(actor, input.projectId, 'write')
      await this.knowledge.refreshItem(actor, space, input.item)
    },
    create: async () => { throw denied() }
  }
  private async describe(input: ContentSourceInput): Promise<ContentResourceSnapshot> {
    const { item, space } = await this.access.resource({ ...input.actor, projectId: input.projectId, assistantId: input.assistantId }, input.sourceResourceId, 'read')
    if (!item?.filePath || item.kind === 'folder') throw denied()
    const format = await this.fileFormat(input, item)
    const model = item.kind === 'page' ? models.page : format?.resourceType ?? models.file
    // Ordinary portable files keep their Workspace save path. An explicit editor binding
    // remains protected even when its plugin is unavailable.
    const managed = item.kind === 'page' || !!item.editorKey || !!format
    return { typeId: model.typeId, modelId: model.modelId, schemaVersion: model.schemaVersion, editProtocol: model.editProtocol, projectId: space.projectId, title: item.title,
      revision: `${item.version}:${item.projectedSequence}:${item.fileHash ?? ''}`, updatedAt: item.updatedAt.toISOString(),
      deleted: item.deleted, ...(managed ? { writeOwnership: 'provider' as const } : {}), source: { kind: 'file', path: item.filePath }, defaultEditorKey: format?.resourceType?.defaultEditorKey ?? item.editorKey ?? 'platform.file', allowedActions: [] }
  }
}
