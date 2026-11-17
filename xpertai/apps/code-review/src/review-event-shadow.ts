import { triggerDecision } from './automation-domain.js'
import { workflowDecision } from './workflow-contract.js'
import type { ReviewRepository } from './automation-entities.js'
import type { StoredWebhook } from './webhook-inbox.js'

export interface ReviewEventShadow {
  type: string
  subject: { kind: string; key: string }
  operationKey: string
  reason: string | null
  comparison: 'pending' | 'matched' | 'different' | 'binding_changed'
}

/** Read-only prediction made from the authenticated fact and the repository policy at receipt time. */
export function projectReviewEvent(policy: ReviewRepository, event: StoredWebhook['event']): ReviewEventShadow {
  if (event.event === 'workflow_run') {
    const run = event.data.workflow_run
    const reason = workflowDecision(policy.settings, event.data)
    return {
      type: 'code_review.workflow_run',
      subject: { kind: 'workflow-run', key: String(run.id) },
      operationKey:
        run.id + '-' + run.run_attempt + '-' + policy.executionRevision + (reason ? '-skip-' + event.data.action : ''),
      reason,
      comparison: 'pending',
    }
  }
  const pr = event.data.pull_request
  const reason =
    triggerDecision(policy.settings, event.data) ??
    (policy.settings.executionMode !== 'assistant' && !policy.settings.pipeline ? 'pipeline_binding_required' : null)
  return {
    type: 'code_review.pull_request',
    subject: { kind: 'pull-request', key: String(pr.number) },
    operationKey:
      pr.number + '-' + pr.head.sha + '-' + policy.executionRevision + (reason ? '-skip-' + event.data.action : ''),
    reason,
    comparison: 'pending',
  }
}

export function compareShadow(
  shadow: ReviewEventShadow | null,
  operationKey: string,
  reason?: string | null,
): ReviewEventShadow | null {
  if (!shadow) return null
  const matched = operationKey === shadow.operationKey && (reason ?? null) === shadow.reason
  return { ...shadow, comparison: matched ? 'matched' : 'different' }
}
