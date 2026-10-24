import type { EntityManager } from 'typeorm'
import { ProjectAccessRuntimeCapability, type RuntimeCapabilityRegistry, type ProjectPipelineContext } from '@xpert-ai/plugin-sdk'
import { Review } from '../entity.js'
import { ReviewError, type Scope } from '../domain.js'
import { ReviewPipelineBinding } from './entity.js'
import { digest } from './contract.js'

export const pipelineOwner = (c: ProjectPipelineContext) => ({ tenantId: c.actor.tenantId,
  organizationId: c.actor.organizationId || '', userId: c.actor.userId, projectId: c.projectId })
export function sourceVersion(r: Review) {
  return { version: `${r.snapshot.baseSha}:${r.snapshot.headSha}`, digest: digest({ ref: r.ref, baseSha: r.snapshot.baseSha,
    headSha: r.snapshot.headSha, files: r.snapshot.files, instructions: r.instructions, title: r.snapshot.title, body: r.snapshot.body }) }
}
/** Shared pipeline drafts retain live Project access and immutable-version checks on every domain read/write. */
export async function assertPipelineReviewAccess(manager: EntityManager, capabilities: RuntimeCapabilityRegistry, s: Scope, r: Review) {
  if (!r.pipelineProjectId) return
  const context = { actor: { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId }, projectId: r.pipelineProjectId }
  await capabilities.require(ProjectAccessRuntimeCapability).assertEdit(context)
  await assertPipelineReviewVersion(manager, s, r)
}
export async function assertPipelineReviewVersion(manager: EntityManager, s: Scope, r: Review) {
  const context = { actor: { tenantId: s.tenantId, organizationId: s.organizationId, userId: s.userId }, projectId: r.pipelineProjectId! }
  const binding = await manager.findOneBy(ReviewPipelineBinding, { ...pipelineOwner(context), userId: r.userId, id: r.pipelineRootReviewId || r.id })
  if (!binding) throw new ReviewError('pipeline_binding_unavailable')
  if (r.pipelineOperationId) {
    const root = await manager.findOne(Review, { where: { id: binding.currentReviewId ?? binding.id, tenantId: s.tenantId, organizationId: s.organizationId,
      userId: r.userId, assistantId: binding.assistantId }, ...(manager.queryRunner?.isTransactionActive ? { lock: { mode: 'pessimistic_write' as const } } : {}) })
    if (!root || sourceVersion(root).digest !== sourceVersion(r).digest) throw new ReviewError('stale_revision')
  }
}
