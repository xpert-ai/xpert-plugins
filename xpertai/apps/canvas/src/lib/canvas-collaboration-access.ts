import { ProjectAccessRuntimeCapability, ContentResourcesRuntimeCapability, type CollaborationProviderContext,
  type RuntimeCapabilityResolver } from '@xpert-ai/plugin-sdk'
import type { CanvasDocument } from './entities/canvas-document.entity.js'

/** Every socket read/write rechecks the business resource, including sessions created without Project defaults. */
export async function authorizeCanvasCollaboration(document: CanvasDocument, context: CollaborationProviderContext, runtime?: RuntimeCapabilityResolver): Promise<boolean> {
  if (!context.userId || !context.tenantId || !context.organizationId || !runtime) return false
  const actor = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
  const write = !['read'].includes(context.operation)
  if (write && document.status === 'archived') return false
  try {
    if (document.projectId) {
      const api = runtime.get(ProjectAccessRuntimeCapability)
      if (!api) return false
      const scope = { actor, projectId: document.projectId }
      if (context.xpertId) await api.assertAssistant({ ...scope, assistantId: context.xpertId })
      if (context.operation === 'manage' || context.operation === 'delete') await api.assertManage(scope)
      else if (write) await api.assertEdit(scope)
      else if (!(await api.listReadable({ actor, projectIds: [document.projectId] })).length) return false
      return true
    }
    // Legacy personal canvases have no Project membership policy. Keep them private
    // to their authenticated creator; an organization lookup is not a collaboration grant.
    if (document.createdById !== actor.userId) return false
    const identities = runtime.get(ContentResourcesRuntimeCapability)?.identities
    if (!identities) return false
    await identities.principal(actor)
    return true
  } catch { return false }
}
