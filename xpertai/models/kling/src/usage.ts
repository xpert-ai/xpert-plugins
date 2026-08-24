import type { ModelUsagePricingDimensions } from '@xpert-ai/contracts'
import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { KlingProviderTask } from './types.js'

export function normalizeKlingVideoObservation(
  task: KlingProviderTask,
  pricingDimensions?: ModelUsagePricingDimensions
): AIGCModelObservation {
  if (task.status === 'failed') {
    return { state: 'failed', errorCode: 'provider_task_failed' }
  }
  if (task.status !== 'succeeded') {
    return { state: task.status === 'submitted' ? 'submitted' : 'processing' }
  }

  const providerSeconds = task.outputs.reduce((total, output) => {
    return total + (typeof output.duration === 'number' && output.duration > 0 ? output.duration : 0)
  }, 0)
  if (providerSeconds > 0) {
    return {
      state: 'succeeded',
      metrics: [{ unit: 'second', quantity: providerSeconds, authority: 'provider' }]
    }
  }
  const requestSeconds = pricingDimensions?.durationSeconds
  if (typeof requestSeconds === 'number' && Number.isFinite(requestSeconds) && requestSeconds > 0) {
    return {
      state: 'succeeded',
      metrics: [{ unit: 'second', quantity: requestSeconds, authority: 'request' }]
    }
  }
  return { state: 'succeeded' }
}
