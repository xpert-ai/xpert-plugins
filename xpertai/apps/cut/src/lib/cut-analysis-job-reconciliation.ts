import type { ManagedQueueExecutionPool, ManagedQueueService } from '@xpert-ai/plugin-sdk'
import type { CutAnalysisJob } from './entities/index.js'
import type { CutJsonValue } from './types.js'

export type CutQueueReconciliation = {
  changed: boolean
  queueState?: string
  failureCode?: 'QUEUE_HANDLER_UNAVAILABLE' | 'QUEUE_JOB_FAILED' | 'QUEUE_RESULT_NOT_PERSISTED'
  errorMessage?: string
}

/**
 * Reconciles the durable Cut analysis row with its physical BullMQ job.
 *
 * A worker can fail before a plugin handler begins, so the plugin processor has
 * no opportunity to update the Cut row. Reads use this bounded reconciliation
 * to prevent a terminal BullMQ job from appearing queued forever.
 */
export async function reconcileCutAnalysisJobWithQueue(
  queue: ManagedQueueService | undefined,
  job: CutAnalysisJob
): Promise<CutQueueReconciliation> {
  if (
    !queue ||
    typeof queue.getJob !== 'function' ||
    !job.queueJobId ||
    job.executionMode !== 'server' ||
    !['queued', 'running'].includes(job.status)
  ) {
    return { changed: false }
  }

  const executionPool: ManagedQueueExecutionPool = job.type === 'render' ? 'sandbox-browser' : 'default'
  const snapshot = await queue.getJob({ jobId: job.queueJobId, executionPool }).catch(() => null)
  if (!snapshot || (snapshot.state !== 'failed' && snapshot.state !== 'completed')) {
    return { changed: false, queueState: snapshot?.state }
  }

  const handlerUnavailable = snapshot.state === 'failed' &&
    /no managed queue handler registered/i.test(snapshot.failedReason ?? '')
  const failureCode = snapshot.state === 'completed'
    ? 'QUEUE_RESULT_NOT_PERSISTED'
    : handlerUnavailable
      ? 'QUEUE_HANDLER_UNAVAILABLE'
      : 'QUEUE_JOB_FAILED'
  const errorMessage = snapshot.state === 'completed'
    ? 'Managed Queue completed the physical job without persisting a terminal Cut result.'
    : (snapshot.failedReason?.trim() || 'Managed Queue failed the physical job before Cut persisted its terminal state.')
  const metadata = jsonObject(job.metadata)

  job.status = 'failed'
  job.progress = 0
  job.errorMessage = errorMessage
  job.completedAt = snapshot.finishedOn ? new Date(snapshot.finishedOn) : new Date()
  job.metadata = {
    ...metadata,
    stage: 'queue-failed',
    errorCode: failureCode,
    queueState: snapshot.state,
    queueAttempts: snapshot.attemptsMade,
    ...(snapshot.finishedOn ? { queueFinishedOn: new Date(snapshot.finishedOn).toISOString() } : {})
  } as CutJsonValue

  return { changed: true, queueState: snapshot.state, failureCode, errorMessage }
}

function jsonObject(value: CutJsonValue | null | undefined): Record<string, CutJsonValue | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, CutJsonValue | undefined>
    : {}
}
