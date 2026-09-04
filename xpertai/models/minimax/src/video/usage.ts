import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { MiniMaxVideoTask } from './types.js'

export function normalizeMiniMaxVideoObservation(task: MiniMaxVideoTask): AIGCModelObservation {
  if (task.status === 'failed') return { state: 'failed', errorCode: 'provider_task_failed' }
  if (task.status === 'cancelled') return { state: 'cancelled', errorCode: 'provider_task_cancelled' }
  if (task.status === 'queued') return { state: 'submitted' }
  if (task.status === 'running') return { state: 'processing' }
  const outputSeconds = task.usage?.output_seconds ?? task.duration
  return {
    state: 'succeeded',
    ...(outputSeconds && outputSeconds > 0
      ? { metrics: [{ unit: 'second' as const, quantity: outputSeconds, authority: 'provider' as const }] }
      : {})
  }
}
