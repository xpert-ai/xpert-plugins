import { Injectable } from '@nestjs/common'
import { CollaborationDocumentProvider, type CollaborationProviderContext, type ICollaborationOperationsProvider } from '@xpert-ai/plugin-sdk'
import { OfficeWorkbookService, workbookScope } from './service.js'
import { WORKBOOK_MODEL } from './model.js'

export const WORKBOOK_COLLABORATION = 'office-editor.workbook-operations'

/** Transport authorization reloads the business resource and Project for every recipient.
 * No workbook state is stored in or accepted from the platform CRDT engine. */
@Injectable()
@CollaborationDocumentProvider(WORKBOOK_COLLABORATION)
export class OfficeWorkbookCollaboration implements ICollaborationOperationsProvider {
  readonly engine = 'operations' as const
  readonly schemaVersion = 1
  constructor(private readonly workbooks: OfficeWorkbookService) {}
  private async scope(context: CollaborationProviderContext) {
    if (!context.tenantId || !context.organizationId || !context.userId) throw new Error('office.access_denied')
    const document = await this.workbooks.documents.findOne({ where: { id: context.resourceId,
      tenantId: context.tenantId, organizationId: context.organizationId, contentModel: WORKBOOK_MODEL.modelId } })
    if (!document || document.status === 'archived' || (context.projectId && context.projectId !== document.projectId))
      throw new Error('office.access_denied')
    return workbookScope({ tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId,
      projectId: document.projectId, assistantId: context.xpertId ?? document.assistantId })
  }
  async authorize(context: CollaborationProviderContext) {
    try {
      const scope = await this.scope(context)
      await this.workbooks.access(scope, context.operation === 'read' || context.operation === 'initialize' ? 'read'
        : context.operation === 'manage' || context.operation === 'delete' ? 'manage' : 'write')
      return true
    } catch { return false }
  }
  async getRevision(context: CollaborationProviderContext) {
    const scope = await this.scope(context)
    return Number((await this.workbooks.head(scope, context.resourceId)).revision)
  }
}
