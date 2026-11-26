import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { SiliconflowVideoTask } from './types.js'

export function normalizeSiliconflowVideoObservation(task: SiliconflowVideoTask, durationSeconds?: number): AIGCModelObservation {
  if (task.status === 'Succeed') {
    return {
      state: 'succeeded',
      metrics: durationSeconds === undefined
        ? [{ unit: 'generation', quantity: 1, authority: 'contract' }]
        : [{ unit: 'second', quantity: durationSeconds, authority: 'request' }]
    }
  }
  if (task.status === 'Failed') {
    return {
      state: 'failed',
      errorCode: 'provider_task_failed'
    }
  }
  return { state: 'processing' }
}
