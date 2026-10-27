import { ForbiddenException } from '@nestjs/common'
import { ProjectAccessRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { PresentationScope } from './types.js'
export async function assertPresentationProject(runtime: RuntimeCapabilityRegistry | undefined, scope: PresentationScope, operation: 'read' | 'write' | 'manage' = 'read') {
  if (!scope.projectId) return undefined
  if (!runtime || !scope.tenantId || !scope.organizationId || !scope.userId) throw new ForbiddenException('PRESENTATION_PROJECT_ACCESS_DENIED')
  const actor = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }, projectId = scope.projectId
  const projects = runtime.require(ProjectAccessRuntimeCapability), assistantId = scope.xpertId ?? scope.assistantId
  if (assistantId) await projects.assertAssistant({ actor, projectId, assistantId })
  if (operation === 'write') return projects.assertEdit({ actor, projectId })
  if (operation === 'manage') return projects.assertManage({ actor, projectId })
  const access = (await projects.listReadable({ actor, projectIds: [projectId] }))[0]
  if (!access) throw new ForbiddenException('PRESENTATION_PROJECT_ACCESS_DENIED')
  return access
}
