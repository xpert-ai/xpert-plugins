import { Inject, Injectable, Logger } from '@nestjs/common'
import { CollaborationDocumentProvider, CollaborationRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry, type CollaborationProviderContext, type ICollaborationOperationsProvider,
  type ContentSourceInput } from '@xpert-ai/plugin-sdk'
import { SpaceAccess } from './access.js'
import { denied } from './domain.js'

export const SPACE_FILE_COLLABORATION = 'spaces.file-operations'
/** The host transports presence and invalidations; file bytes stay with the versioned CAS writer. */
@Injectable()
@CollaborationDocumentProvider(SPACE_FILE_COLLABORATION)
export class SpaceFileCollaboration implements ICollaborationOperationsProvider {
  readonly engine = 'operations' as const
  readonly schemaVersion = 1
  private readonly logger = new Logger(SpaceFileCollaboration.name)
  constructor(private readonly access: SpaceAccess,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry) {}
  private async resource(context: CollaborationProviderContext) {
    if (!context.tenantId || !context.organizationId || !context.userId) throw denied()
    const actor = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId,
      projectId: context.projectId ?? undefined, assistantId: context.xpertId ?? undefined }
    const { item, space } = await this.access.resource(actor, context.resourceId,
      context.operation === 'read' || context.operation === 'initialize' ? 'read' : context.operation === 'manage' || context.operation === 'delete' ? 'manage' : 'write')
    if (!item?.filePath || !['file', 'artifact'].includes(item.kind) || item.deleted || (context.projectId && context.projectId !== space.projectId)) throw denied()
    return item
  }
  async authorize(context: CollaborationProviderContext) {
    try { await this.resource(context); return true } catch { return false }
  }
  async getRevision(context: CollaborationProviderContext) { return (await this.resource(context)).version }
  async session(input: ContentSourceInput) {
    const actor = { ...input.actor, projectId: input.projectId, assistantId: input.assistantId }
    const { item } = await this.access.resource(actor, input.sourceResourceId, 'read')
    if (!item?.filePath || !['file', 'artifact'].includes(item.kind) || item.deleted) throw denied()
    const api = this.runtime.require(CollaborationRuntimeCapability)
    const document = await api.ensureDocument({ providerKey: SPACE_FILE_COLLABORATION, resourceId: item.id })
    return api.createSession({ documentId: document.id, access: 'read' })
  }
  async notify(resourceId: string) {
    try { await this.runtime.get(CollaborationRuntimeCapability)?.notifyRevision?.({ providerKey: SPACE_FILE_COLLABORATION, resourceId }) }
    catch { this.logger.debug('File revision notification unavailable; reconnect rechecks the current revision') }
  }
}
