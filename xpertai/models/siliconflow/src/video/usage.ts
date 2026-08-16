import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { SiliconflowVideoTask } from './types.js'

export function normalizeSiliconflowVideoObservation(task: SiliconflowVideoTask): AIGCModelObservation {
  if (task.status === 'Succeed') {
    return {
      state: 'succeeded',
      metrics: [{ unit: 'generation', quantity: 1, authority: 'contract' }]
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
