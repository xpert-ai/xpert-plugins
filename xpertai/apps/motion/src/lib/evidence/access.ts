import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ContentResourcesRuntimeCapability, ProjectAccessRuntimeCapability, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { MotionProject } from '../entities/index.js'
import type { MotionScope } from '../types.js'

/** Evidence outputs retain their Project ACL through native editors, exports and queue retries. */
export async function authorizeEvidenceProject(runtime: RuntimeCapabilityRegistry | undefined, scope: MotionScope, project: MotionProject, write: boolean) {
  if (project.contentModel !== 'motion.evidence-video') return
  if (!runtime || !scope.tenantId || !scope.organizationId || !scope.userId || !project.projectId ||
    project.tenantId !== scope.tenantId || project.organizationId !== scope.organizationId ||
    scope.projectId && scope.projectId !== project.projectId) throw new ForbiddenException('MOTION_EVIDENCE_ACCESS_DENIED')
  const api = runtime.require(ProjectAccessRuntimeCapability)
  const input = { actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId }, projectId: project.projectId }
  const access = scope.assistantId ? await api.assertAssistant({ ...input, assistantId: scope.assistantId })
    : (await api.listReadable({ actor: input.actor, projectIds: [input.projectId] }))[0]
  if (!access || access.archived) throw new ForbiddenException('MOTION_EVIDENCE_ACCESS_DENIED')
  if (write) await api.assertEdit(input)
}
export async function visibleEvidenceProjects(runtime: RuntimeCapabilityRegistry | undefined, scope: MotionScope, rows: MotionProject[]) {
  const visible: MotionProject[] = []
  for (const row of rows) {
    try { await authorizeEvidenceProject(runtime, scope, row, false); await authorizeEvidenceSource(runtime, scope, row); visible.push(row) }
    catch (error) { if (!(error instanceof ForbiddenException || error instanceof ConflictException)) throw error }
  }
  return visible
}

/** New renders and their delivery recheck the original evidence, including current source permissions. */
export async function authorizeEvidenceSource(runtime: RuntimeCapabilityRegistry | undefined, scope: MotionScope, project: MotionProject) {
  if (project.contentModel !== 'motion.evidence-video') return
  if (!runtime || !scope.userId || !scope.organizationId || !project.sourceEvidence?.id)
    throw new ForbiddenException('MOTION_EVIDENCE_SOURCE_UNAVAILABLE')
  await runtime.require(ContentResourcesRuntimeCapability).authorize({
    actor: { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId },
    providerKey: 'live-dashboard.analysis-evidence', resourceId: project.sourceEvidence.id, operation: 'read'
  })
}
