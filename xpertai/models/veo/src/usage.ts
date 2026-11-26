import type { ModelUsageMetric, ModelUsagePricingDimensions } from '@xpert-ai/contracts'
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
  if (operation.name?.startsWith('interactions/')) {
    const usage = operation.metadata?.usage
    if (!usage || typeof usage !== 'object') return { state: 'succeeded' }
    const metrics: ModelUsageMetric[] = []
    if ('total_input_tokens' in usage && typeof usage.total_input_tokens === 'number') {
      metrics.push({ unit: 'token', authority: 'provider', component: 'input', promptTokens: usage.total_input_tokens,
        pricingDimensions: { mode: 'input' } })
    }
    const byModality = 'output_tokens_by_modality' in usage && Array.isArray(usage.output_tokens_by_modality)
      ? usage.output_tokens_by_modality : []
    for (const entry of byModality) {
      if ((entry?.modality === 'video' || entry?.modality === 'text') && typeof entry.tokens === 'number') {
        metrics.push({ unit: 'token', authority: 'provider', component: 'output', key: entry.modality,
          completionTokens: entry.tokens, pricingDimensions: { mode: entry.modality } })
      }
    }
    if (!byModality.length && 'total_output_tokens' in usage && typeof usage.total_output_tokens === 'number') {
      metrics.push({ unit: 'token', authority: 'provider', component: 'output', key: 'unspecified',
        completionTokens: usage.total_output_tokens, pricingDimensions: { mode: 'unspecified' } })
    }
    if ('total_thought_tokens' in usage && typeof usage.total_thought_tokens === 'number' && usage.total_thought_tokens > 0) {
      metrics.push({ unit: 'token', authority: 'provider', component: 'output', key: 'thinking',
        completionTokens: usage.total_thought_tokens, pricingDimensions: { mode: 'text' } })
    }
    return { state: 'succeeded', metrics }
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
