import { interrupt } from '@langchain/langgraph'
import { z } from 'zod/v3'
import { approvalDetails, approvalDisplay } from './approval.js'
import type { StudioService } from './studio.service.js'
import type { StudioJobs } from './jobs.js'
import type { StudioScope } from './types.js'

const approvalResponseSchema = z.object({
  decisions: z.array(z.object({ type: z.enum(['approve', 'reject']), message: z.string().optional() })).length(1),
})

export async function executeReviewedPlan(
  service: Pick<StudioService, 'record' | 'preparePlanApproval' | 'approve'>,
  jobs: Pick<StudioJobs, 'schedulePlan'>,
  scope: StudioScope,
  id: string
) {
  const existing = await service.record(scope, id)
  if (existing.kind !== 'plan') throw new Error('plan_required')
  // A replay or repeated tool call must never resubmit a completed or uncertain write.
  if (['succeeded', 'running', 'pending', 'unknown', 'cancelled', 'failed'].includes(existing.status)) return existing
  if (existing.status === 'awaiting_approval') {
    const { plan, payload } = await service.preparePlanApproval(scope, id)
    const response = interrupt({
      actionRequests: [{
        name: 'db_studio_execute_plan',
        args: { id: plan.id, ...approvalDetails(payload) },
        display: approvalDisplay(payload),
        description: `Confirm database change "${plan.title}". Review the exact SQL and ordered parameters, or the import target, columns, row count and preview. Approve submits this frozen plan for execution; reject cancels it.`,
      }],
      reviewConfigs: [{ actionName: 'db_studio_execute_plan', allowedDecisions: ['approve', 'reject'] }],
    })
    const parsed = approvalResponseSchema.safeParse(response)
    if (!parsed.success) throw new Error('plan_approval_response_invalid')
    const approved = parsed.data.decisions[0].type === 'approve'
    const reviewed = await service.approve(scope, id, payload.digest, approved)
    if (!approved) return reviewed
  }
  return jobs.schedulePlan(scope, id)
}
