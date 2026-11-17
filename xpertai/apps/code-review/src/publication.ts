import type { EntityManager } from 'typeorm'
import { ReviewRepository, ReviewRun } from './automation-entities.js'
import { publicationMode, type PublicationMode } from './automation-contract.js'
import { ReviewError } from './domain.js'
import type { Review } from './entity.js'

/** Serialize the decision to send with rule changes; release the locks before contacting GitHub. */
export async function claimRepositoryPublication(manager: EntityManager, record: Review, mode: PublicationMode) {
  if (!record.automationPolicyId || !record.automationRunId || record.ref.provider !== 'github')
    throw new ReviewError('automation_managed_review')
  const scope = { tenantId: record.tenantId, organizationId: record.organizationId, assistantId: record.assistantId }
  const lock = { mode: 'pessimistic_write' as const }
  const policy = await manager.findOne(ReviewRepository, { where: { ...scope, id: record.automationPolicyId }, lock })
  const run = await manager.findOne(ReviewRun, { where: { ...scope, id: record.automationRunId,
    repositoryPolicyId: record.automationPolicyId, reviewId: record.id }, lock })
  if (!policy || !run || !policy.confirmedAt || policy.ownership !== 'assistant' || policy.executionUserId !== record.userId ||
      !policy.settings.enabled || policy.executionRevision !== run.policyRevision ||
      publicationMode(policy.settings) !== mode || publicationMode(run.settings) !== mode ||
      run.settings.executionMode !== policy.settings.executionMode ||
      policy.owner.toLowerCase() !== record.ref.owner.toLowerCase() || policy.repository.toLowerCase() !== record.ref.repository.toLowerCase() ||
      run.number !== record.ref.number || run.headSha !== record.snapshot.headSha) throw new ReviewError('policy_changed')
  if (run.trigger === 'trial') throw new ReviewError('trial_cannot_publish')
  const allowed = run.settings.executionMode === 'pipeline' ? ['running', 'awaiting_confirmation', 'blocked'] : ['running', 'publishing']
  if (!allowed.includes(run.status)) throw new ReviewError('review_not_submittable')
  return run
}
