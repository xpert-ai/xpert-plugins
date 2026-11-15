import { isCanvasSnapshot } from './canvas-snapshot.validation.js'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ContentResourceProvider, ContentEditorProvider, ProjectAccessRuntimeCapability, ContentResourcesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry, type IContentResourceProvider,
  type ContentCatalogProvider, type ContentSourceInput, type ContentResourceRequest, type ContentDocumentScope } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration, ContentResourceSnapshot } from '@xpert-ai/contracts'
import { CanvasDocument } from './entities/index.js'
import { CanvasService } from './canvas.service.js'
import type { CanvasScope, CanvasJsonValue } from './types.js'

export const CANVAS_CONTENT = 'canvas.documents'
const model = { typeId: 'xpert.canvas', modelId: 'canvas.tldraw', schemaVersion: '2', editProtocol: { id: 'platform.yjs', version: '2' } }

@Injectable()
@ContentEditorProvider('canvas.tldraw')
export class CanvasContentEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: 'canvas.tldraw', protocolVersion: 2,
    title: 'Canvas', view: { providerKey: 'canvas', viewKey: 'canvas_workbench', entry: 'canvas-workbench' },
    supports: [1, 2].map(version => ({ ...model, schemaVersion: String(version), editProtocol: { id: 'platform.yjs', version: String(version) }, access: ['view', 'edit'] })) }
}

/** Native Canvas identity participates in the Project catalog; snapshots stay in Canvas. */
@Injectable()
@ContentResourceProvider(CANVAS_CONTENT)
export class CanvasContentProvider implements IContentResourceProvider {
  readonly title = 'Canvas documents'
  constructor(private readonly service: CanvasService,
    @InjectRepository(CanvasDocument) private readonly documents: Repository<CanvasDocument>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private where(input: ContentDocumentScope) { return { tenantId: input.actor.tenantId, organizationId: input.actor.organizationId, projectId: input.projectId } }
  private async access(input: ContentDocumentScope) {
    const api = this.runtime.require(ProjectAccessRuntimeCapability)
    const access = input.assistantId ? await api.assertAssistant({ ...input, assistantId: input.assistantId })
      : (await api.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
    if (!access) throw new ForbiddenException('canvas.access_denied')
    return access
  }
  private scope(input: ContentDocumentScope): CanvasScope { return { ...input.actor, projectId: input.projectId, assistantId: input.assistantId } }
  async authorize(input: ContentResourceRequest) {
    const doc = await this.documents.findOneBy({ id: input.resourceId, tenantId: input.actor.tenantId, organizationId: input.actor.organizationId })
    if (!doc?.projectId) throw new ForbiddenException('canvas.access_denied')
    const scope = { actor: input.actor, projectId: doc.projectId }, access = await this.access(scope)
    const api = this.runtime.require(ProjectAccessRuntimeCapability)
    if (input.operation === 'write') await api.assertEdit(scope)
    if (input.operation === 'manage') await api.assertManage(scope)
    return { providerKey: CANVAS_CONTENT, resourceId: input.resourceId, title: doc.title, role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
  readonly catalog: ContentCatalogProvider = {
    types: [{ ...model, creatable: false, title: { en_US: 'Canvas', zh_Hans: '画布' }, implementationKey: 'canvas.tldraw',
      implementationTitle: { en_US: 'Canvas', zh_Hans: '画布' }, defaultEditorKey: 'canvas.tldraw' }],
    discover: async input => {
      await this.access(input)
      const offset = Number(input.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('canvas.invalid_cursor')
      const rows = await this.documents.find({ where: this.where(input), select: { id: true }, order: { id: 'ASC' }, skip: offset, take: 100 })
      return { resourceIds: rows.map(row => row.id!), ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {}) }
    },
    describe: input => this.describe(input),
    extract: async input => {
      await this.access(input)
      const detail = await this.service.getDocument(this.scope(input), { documentId: input.sourceResourceId, includeSnapshot: true })
      if (String(detail.workingCopyRevision) !== input.expectedRevision) throw new ConflictException('canvas.version_conflict')
      if (!isCanvasSnapshot(detail.scene)) throw new BadRequestException('canvas.snapshot_unavailable')
      const records = Object.values(detail.scene.store).filter(record => record.typeName === 'shape').sort((a, b) => a.id.localeCompare(b.id))
      if (records.length > 1000) throw new BadRequestException('canvas.transfer_size_limit')
      return { revision: input.expectedRevision, sections: records.map(record => ({ anchor: { kind: 'canvas-element', id: record.id },
        text: canvasText(record.props?.richText ?? record.props?.text ?? '') })) }
    },
    create: async () => { throw new BadRequestException('canvas.creation_requires_workbench') }
  }
  private async describe(input: ContentSourceInput): Promise<ContentResourceSnapshot> {
    await this.access(input)
    const detail = await this.service.getDocument(this.scope(input), { documentId: input.sourceResourceId })
    return { ...model, projectId: input.projectId, title: detail.item.title.slice(0, 200), revision: String(detail.workingCopyRevision),
      updatedAt: detail.item.updatedAt!.toISOString(), deleted: detail.item.status === 'archived', source: { kind: 'managed' },
      defaultEditorKey: 'canvas.tldraw', allowedActions: [] }
  }
  async convert(scope: CanvasScope, input: { documentId: string; expectedRevision: string; requestId: string; title: string; target?: 'workbook' | 'document' }) {
    if (!scope.tenantId || !scope.organizationId || !scope.userId || !scope.projectId) throw new ForbiddenException('canvas.project_required')
    const context: ContentDocumentScope = { actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId },
      projectId: scope.projectId, assistantId: scope.assistantId ?? undefined }
    const api = this.runtime.require(ContentResourcesRuntimeCapability).catalog
    const source = await api.register({ ...context, source: { providerKey: CANVAS_CONTENT, resourceId: input.documentId } })
    return api.create({ ...context,
      ...(input.target === 'document' ? { providerKey: 'office.documents', implementationKey: 'office-document' }
        : { providerKey: 'office-editor.workbooks', implementationKey: 'office-editor.univer' }),
      requestId: input.requestId, title: input.title, transferFrom: { contentId: source.contentId, expectedRevision: input.expectedRevision } })
  }
}

export function canvasText(value: CanvasJsonValue, depth = 0): string {
  if (depth > 32) throw new BadRequestException('canvas.transfer_depth_limit')
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(node => canvasText(node, depth + 1)).join('')
  if (typeof value.text === 'string') return value.text
  const content = value.content ? canvasText(value.content, depth + 1) : ''
  return value.type === 'paragraph' ? content + '\n' : content
}
