import { BadRequestException, ConflictException, Inject, Injectable, ForbiddenException } from '@nestjs/common'
import type { ResourceContentEditorRegistration, ContentResourceSnapshot } from '@xpert-ai/contracts'
import { ContentResourceProvider, ContentEditorProvider, ProjectFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ContentCatalogProvider, type ContentSourceInput, type ContentResourceRequest, type IContentResourceProvider, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { OfficeWorkbookService, workbookWhere } from './service.js'
import { WORKBOOK_MODEL, WORKBOOK_EDITOR, WORKBOOK_ENTRY, WORKBOOK_IMPLEMENTATION, WORKBOOK_PROVIDER,
  WORKBOOK_VIEW, WORKBOOK_VIEW_PROVIDER, workbookSourceRoot, workbookText } from './model.js'

@Injectable()
@ContentEditorProvider(WORKBOOK_EDITOR)
export class OfficeWorkbookEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: WORKBOOK_EDITOR, protocolVersion: 2,
    title: 'Univer Workbook (Office Editor)', view: { providerKey: WORKBOOK_VIEW_PROVIDER, viewKey: WORKBOOK_VIEW, entry: WORKBOOK_ENTRY },
    supports: [{ ...WORKBOOK_MODEL, access: ['view', 'edit'] }] }
}
@Injectable()
@ContentResourceProvider(WORKBOOK_PROVIDER)
export class OfficeWorkbookContent implements IContentResourceProvider {
  readonly title = 'Office Editor workbooks'
  constructor(private readonly service: OfficeWorkbookService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  readonly catalog: ContentCatalogProvider = {
    types: [{ ...WORKBOOK_MODEL, title: { en_US: 'Spreadsheet', zh_Hans: '电子表格' }, implementationKey: WORKBOOK_IMPLEMENTATION,
      implementationTitle: { en_US: 'Univer (Office Editor)', zh_Hans: 'Univer（Office 编辑器）' }, defaultEditorKey: WORKBOOK_EDITOR }],
    discover: async scope => {
      await this.service.access(scope)
      const offset = Number(scope.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('office.invalid_cursor')
      const rows = await this.service.documents.find({ where: workbookWhere(scope), select: { id: true }, order: { id: 'ASC' }, skip: offset, take: 100 })
      return { resourceIds: rows.map(row => row.id!), ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {}) }
    },
    describe: input => this.describe(input),
    create: async input => {
      if (input.implementationKey !== WORKBOOK_IMPLEMENTATION || input.templateId) throw new BadRequestException('office.implementation_unavailable')
      return { providerKey: WORKBOOK_PROVIDER, resourceId: (await this.service.create(input, input.requestId, input.title)).documentId }
    },
    mutate: async input => ({ providerKey: WORKBOOK_PROVIDER,
      resourceId: await this.service.mutate(input, input.sourceResourceId, input.expectedRevision, input.change) }),
    reconcile: input => this.service.reconcile(input, input.sourceResourceId),
    extract: async input => {
      const result = await this.service.read(input, input.sourceResourceId)
      if (result.revision !== input.expectedRevision) throw new ConflictException('office.version_conflict')
      return { revision: result.revision, sections: [{ anchor: { kind: 'workbook', id: result.documentId }, text: result.title }, ...workbookText(result.snapshot)] }
    }
  }
  async authorize(input: ContentResourceRequest) {
    const doc = await this.service.documents.findOneBy({ id: input.resourceId, tenantId: input.actor.tenantId,
      organizationId: input.actor.organizationId, contentModel: WORKBOOK_MODEL.modelId })
    if (!doc?.projectId) throw new ForbiddenException('office.access_denied')
    const access = await this.service.access({ actor: input.actor, projectId: doc.projectId },
      input.operation === 'read' ? 'read' : input.operation === 'manage' ? 'manage' : 'write')
    return { providerKey: WORKBOOK_PROVIDER, resourceId: input.resourceId, title: doc.title, role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
  private async describe(input: ContentSourceInput): Promise<ContentResourceSnapshot> {
    const access = await this.service.access(input), doc = await this.service.require(input, input.sourceResourceId, undefined, true)
    const revision = String(doc.currentVersionNumber), root = workbookSourceRoot(doc.id!)
    const source = doc.sourceSnapshotPath ? await this.runtime.require(ProjectFilesRuntimeCapability).read({ ...input, path: doc.sourceSnapshotPath }).catch(() => null) : null
    return { ...WORKBOOK_MODEL, projectId: input.projectId, title: doc.title, revision, updatedAt: doc.updatedAt!.toISOString(),
      deleted: doc.status === 'archived', offlineAccess: 'project',
      source: doc.sourceSnapshotPath ? { kind: 'bundle', rootPath: root, entryPath: doc.sourceSnapshotPath.slice(root.length + 1) } : { kind: 'managed' },
      containedPaths: [{ path: root, recursive: true }], defaultEditorKey: WORKBOOK_EDITOR,
      sourceSync: { status: source?.sha256 === doc.sourceSnapshotHash ? 'synced' : 'failed', revision },
      preview: { kind: 'outline', revision, lines: [doc.title] },
      allowedActions: [...(doc.status !== 'archived' ? ['rename' as const, 'duplicate' as const] : []),
        ...(access.canManage ? [doc.status === 'archived' ? 'restore' as const : 'trash' as const] : [])] }
  }
}
