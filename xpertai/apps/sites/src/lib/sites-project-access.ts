import { ForbiddenException } from '@nestjs/common'
import { IsNull } from 'typeorm'
import { ProjectAccessRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { SitesScope } from './types.js'
export async function assertSitesProject(runtime: RuntimeCapabilityRegistry | undefined, scope: SitesScope, operation: 'read' | 'write' | 'manage') {
  if (!scope.hostProjectId) return undefined
  if (!runtime || !scope.tenantId || !scope.organizationId || !scope.userId) throw new ForbiddenException('SITES_PROJECT_ACCESS_DENIED')
  const api = runtime.require(ProjectAccessRuntimeCapability)
  const actor = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }, projectId = scope.hostProjectId
  if (scope.assistantId) await api.assertAssistant({ actor, projectId, assistantId: scope.assistantId })
  if (operation === 'write') return api.assertEdit({ actor, projectId })
  if (operation === 'manage') return api.assertManage({ actor, projectId })
  const access = (await api.listReadable({ actor, projectIds: [projectId] }))[0]
  if (!access) throw new ForbiddenException('SITES_PROJECT_ACCESS_DENIED')
  return access
}
/** hostProjectId is the platform owner; projectId in Sites tables is the existing site ID. */
export function sitesWhere(scope: SitesScope) {
  if (!scope.tenantId || !scope.organizationId || !scope.userId || !scope.hostProjectId && !scope.assistantId) throw new ForbiddenException('SITES_SCOPE_REQUIRED')
  return { tenantId: scope.tenantId, organizationId: scope.organizationId,
    ...(scope.hostProjectId ? { hostProjectId: scope.hostProjectId } : { hostProjectId: IsNull(), assistantId: scope.assistantId, createdById: scope.userId }) }
}
