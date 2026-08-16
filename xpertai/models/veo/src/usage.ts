import type { ModelUsagePricingDimensions } from '@xpert-ai/contracts'
import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { VeoOperation } from './types.js'

export function normalizeVeoObservation(
  operation: VeoOperation,
  pricingDimensions?: ModelUsagePricingDimensions
): AIGCModelObservation {
  if (!operation.done) return { state: 'processing' }
  if (operation.error || !hasGeneratedVideo(operation)) {
    return { state: 'failed', errorCode: 'provider_task_failed' }
  }
  const durationSeconds = pricingDimensions?.durationSeconds
  if (typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return {
      state: 'succeeded',
      metrics: [{ unit: 'second', quantity: durationSeconds, authority: 'request' }]
    }
  }
  return { state: 'succeeded' }
}

function hasGeneratedVideo(operation: VeoOperation) {
  return (
    operation.response?.generateVideoResponse?.generatedSamples?.some((sample) => {
      const uri = sample.video?.uri
      return typeof uri === 'string' && Boolean(uri.trim())
    }) ?? false
  )
}
