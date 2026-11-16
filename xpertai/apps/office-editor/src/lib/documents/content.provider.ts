import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import * as Y from 'yjs'
import { z } from 'zod/v3'
import { In } from 'typeorm'
import { ContentEditorProvider, ContentResourceProvider, type ContentCatalogProvider, type ContentResourceRequest,
  type ContentDocumentScope, type IContentResourceProvider } from '@xpert-ai/plugin-sdk'
import type { ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import { OfficeDocument, OfficeSnapshot } from '../entities/index.js'
import { OfficeWorkbookService } from '../workbooks/service.js'
import { OFFICE_EDITOR_PROVIDER_KEY, OFFICE_EDITOR_VIEW_KEY, OFFICE_EDITOR_REMOTE_ENTRY_KEY } from '../constants.js'
import { documentFromTransfer, presentationFromTransfer } from './transfer.js'

export const DOCUMENT_PROVIDER = 'office.documents'
const model = { typeId: 'document', modelId: 'office-editor.document', schemaVersion: '1', editProtocol: { id: 'office.yjs', version: '1' } }
const presentationModel = { ...model, typeId: 'presentation', modelId: 'office-editor.presentation' }
const editor = 'office.document-editor'
const where = (scope: ContentDocumentScope) => ({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId, projectId: scope.projectId, contentModel: In([model.modelId, presentationModel.modelId]) })
@Injectable()
@ContentEditorProvider(editor)
export class OfficeDocumentEditor {
  readonly descriptor: ResourceContentEditorRegistration = { kind: 'resource', key: editor, protocolVersion: 2, title: 'Office document',
    view: { providerKey: OFFICE_EDITOR_PROVIDER_KEY, viewKey: OFFICE_EDITOR_VIEW_KEY, entry: OFFICE_EDITOR_REMOTE_ENTRY_KEY }, supports: [{ ...model, access: ['view', 'edit'] }, { ...presentationModel, access: ['view', 'edit'] }] }
}
/** Creates the same original Office/Yjs model atomically; subsequent edits use Office's existing domain writer. */
@Injectable()
@ContentResourceProvider(DOCUMENT_PROVIDER)
export class OfficeDocumentContent implements IContentResourceProvider {
  readonly title = 'Office documents'
  constructor(private readonly office: OfficeWorkbookService) {}
  private async read(scope: ContentDocumentScope, id: string) {
    await this.office.access(scope)
    const doc = await this.office.documents.findOneBy({ ...where(scope), id })
    if (!doc) throw new ForbiddenException('office.access_denied')
    await this.office.documentSourceAccess(scope, doc)
    return doc
  }
  readonly catalog: ContentCatalogProvider = {
    acceptedTransferSchemas: ['xpert.content-transfer@1', 'xpert.content-analysis-transfer@1'],
    types: [{ ...model, title: { en_US: 'Document', zh_Hans: '文档' }, implementationKey: 'office-document',
      implementationTitle: { en_US: 'Office document', zh_Hans: 'Office 文档' }, defaultEditorKey: editor }, { ...presentationModel, title: { en_US: 'Presentation', zh_Hans: '演示文稿' }, implementationKey: 'office-presentation', implementationTitle: { en_US: 'Evidence presentation', zh_Hans: '证据演示文稿' }, defaultEditorKey: editor }],
    discover: async scope => { await this.office.access(scope); const offset = Number(scope.cursor ?? 0)
      if (!Number.isSafeInteger(offset) || offset < 0) throw new BadRequestException('office.invalid_cursor')
      const rows = await this.office.documents.find({ where: where(scope), order: { id: 'ASC' }, take: 100, skip: offset })
      return { resourceIds: rows.map(row => row.id!), ...(rows.length === 100 ? { nextCursor: String(offset + 100) } : {}) } },
    describe: async scope => { const doc = await this.read(scope, scope.sourceResourceId)
      return { ...(doc.documentType === 'presentation' ? presentationModel : model), projectId: scope.projectId, title: doc.title, revision: String(doc.currentVersionNumber), updatedAt: doc.updatedAt!.toISOString(),
        deleted: doc.status === 'archived', source: { kind: 'managed' }, defaultEditorKey: editor, allowedActions: [],
        preview: { kind: 'outline', revision: String(doc.currentVersionNumber), lines: [doc.title] } } },
    extract: async scope => { const doc = await this.read(scope, scope.sourceResourceId)
      if (String(doc.currentVersionNumber) !== scope.expectedRevision) throw new ConflictException('office.version_conflict')
      const snapshot = await this.office.documents.manager.getRepository(OfficeSnapshot).findOneBy({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId, projectId: scope.projectId, id: doc.currentSnapshotId })
      await this.office.documentSourceAccess(scope, doc)
      return { revision: scope.expectedRevision, sections: [{ anchor: { kind: 'document', id: doc.id! }, text: snapshot?.snapshotText ?? doc.title }] } },
    create: async scope => {
      if (!['office-document', 'office-presentation'].includes(scope.implementationKey) || scope.templateId) throw new BadRequestException('office.implementation_unavailable')
      await this.office.access(scope, 'write'); z.string().uuid().parse(scope.requestId); z.string().min(1).max(200).parse(scope.title)
      const documentType = scope.implementationKey === 'office-presentation' ? 'presentation' : 'document'
      const targetModel = documentType === 'presentation' ? presentationModel : model
      const fingerprint = createHash('sha256').update(JSON.stringify({ title: scope.title, transfer: scope.initialContent ?? null })).digest('hex')
      await this.office.documents.manager.transaction(async manager => {
        await manager.getRepository(OfficeDocument).createQueryBuilder().insert().values({ ...where(scope), contentModel: targetModel.modelId, id: scope.requestId,
          title: scope.title, documentType, status: 'active', currentVersionNumber: 0, createRequestHash: fingerprint,
          createdById: scope.actor.userId, lastEditedById: scope.actor.userId, assistantId: scope.assistantId,
          workspaceCatalog: 'projects', workspaceScopeId: scope.projectId }).orIgnore().execute()
        const doc = await manager.getRepository(OfficeDocument).findOne({ where: { ...where(scope), id: scope.requestId }, lock: { mode: 'pessimistic_write' } })
        if (!doc || doc.documentType !== documentType || doc.createRequestHash !== fingerprint) throw new ConflictException('office.request_conflict')
        if (doc.currentVersionNumber) return
        const { snapshot, text } = (documentType === 'presentation' ? presentationFromTransfer : documentFromTransfer)(scope.requestId, scope.title, scope.initialContent)
        const ydoc = new Y.Doc(), map = ydoc.getMap('office')
        map.set('documentId', doc.id); map.set('documentType', documentType); map.set('snapshot', snapshot)
        const state = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64'), vector = Buffer.from(Y.encodeStateVector(ydoc)).toString('base64'); ydoc.destroy()
        const saved = await manager.getRepository(OfficeSnapshot).save({ tenantId: scope.actor.tenantId, organizationId: scope.actor.organizationId,
          projectId: scope.projectId, documentId: doc.id!, versionNumber: 1, source: 'import', snapshot, snapshotText: text, yjsStateBase64: state,
          yjsStateVectorBase64: vector, yjsUpdateCount: 0, changeSummary: 'Created from a fixed source snapshot', createdById: scope.actor.userId })
        await manager.getRepository(OfficeDocument).update(doc.id!, { currentSnapshotId: saved.id, currentVersionNumber: 1,
          yjsStateBase64: state, yjsStateVectorBase64: vector, lastEditedAt: new Date() })
      })
      await this.office.access(scope, 'write')
      return { providerKey: DOCUMENT_PROVIDER, resourceId: scope.requestId }
    }
  }
  async authorize(input: ContentResourceRequest) {
    const doc = await this.office.documents.findOneBy({ tenantId: input.actor.tenantId, organizationId: input.actor.organizationId,
      id: input.resourceId, contentModel: In([model.modelId, presentationModel.modelId]) })
    if (!doc?.projectId) throw new ForbiddenException('office.access_denied')
    const access = await this.office.access({ actor: input.actor, projectId: doc.projectId }, input.operation === 'read' ? 'read' : 'write')
    await this.office.documentSourceAccess({ actor: input.actor, projectId: doc.projectId }, doc)
    return { providerKey: DOCUMENT_PROVIDER, resourceId: doc.id!, title: doc.title, role: access.role,
      canWrite: !access.archived && ['owner', 'manager', 'editor'].includes(access.role), canManage: access.canManage }
  }
}
