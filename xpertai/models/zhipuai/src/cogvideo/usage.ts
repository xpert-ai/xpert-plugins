import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { ZhipuVideoTask } from './types.js'

export function normalizeZhipuVideoObservation(task: ZhipuVideoTask): AIGCModelObservation {
  const status = task.task_status?.trim().toUpperCase()
  if (status === 'SUCCESS') {
    return {
      state: 'succeeded',
      metrics: [{ unit: 'generation', quantity: 1, authority: 'contract' }]
    }
  }
  if (status === 'FAIL') {
    return {
      state: 'failed',
      errorCode: 'provider_task_failed'
    }
  }
  return { state: 'processing' }
}
