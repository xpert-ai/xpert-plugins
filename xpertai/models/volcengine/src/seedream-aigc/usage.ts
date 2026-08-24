import type { ModelUsageMetric } from '@xpert-ai/contracts'
import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import type { SeedanceVideoTask, SeedanceVideoUsage, SeedreamImageResponse } from './types.js'

export type SeedreamImageTokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function normalizeSeedreamImageUsage(response: unknown): SeedreamImageTokenUsage | undefined {
  if (!isRecord(response) || !isRecord(response.usage)) return undefined
  const promptTokens = readTokenCount(response.usage.prompt_tokens) ?? 0
  const completionTokens =
    readTokenCount(response.usage.completion_tokens) ?? readTokenCount(response.usage.output_tokens)
  const totalTokens = readTokenCount(response.usage.total_tokens)
  if (completionTokens === undefined || totalTokens === undefined) return undefined
  return { promptTokens, completionTokens, totalTokens }
}

export function normalizeSeedreamImageObservation(response: SeedreamImageResponse): AIGCModelObservation {
  const usage = normalizeSeedreamImageUsage(response)
  const generation = normalizeSeedreamImageGeneration(response)
  if (!usage && !generation) {
    return { state: 'succeeded' }
  }
  return {
    state: 'succeeded',
    metrics: [
      ...(usage
        ? [{ unit: 'token' as const, authority: 'provider' as const, ...usage }]
        : []),
      ...(generation
        ? [{ unit: 'generation' as const, authority: generation.authority, quantity: generation.quantity }]
        : [])
    ]
  }
}

function normalizeSeedreamImageGeneration(response: SeedreamImageResponse) {
  if (isRecord(response.usage)) {
    const generatedImages = readTokenCount(response.usage.generated_images)
    if (generatedImages !== undefined && generatedImages > 0) {
      return { quantity: generatedImages, authority: 'provider' as const }
    }
  }
  if (Array.isArray(response.data) && response.data.length > 0) {
    return { quantity: response.data.length, authority: 'contract' as const }
  }
  return undefined
}

const SUCCEEDED = new Set(['succeeded', 'success', 'completed'])
const FAILED = new Set(['failed', 'fail', 'error'])
const CANCELLED = new Set(['cancelled', 'canceled'])
const SUBMITTED = new Set(['queued', 'pending', 'submitted'])

export function normalizeSeedanceVideoObservation(task: SeedanceVideoTask): AIGCModelObservation {
  const status = task.status?.trim().toLowerCase() ?? ''
  if (SUCCEEDED.has(status)) return terminalObservation('succeeded', task.usage)
  if (FAILED.has(status)) return terminalObservation('failed', task.usage, 'provider_task_failed')
  if (CANCELLED.has(status)) return terminalObservation('cancelled', task.usage, 'provider_task_cancelled')
  return { state: SUBMITTED.has(status) ? 'submitted' : 'processing' }
}

function terminalObservation(
  state: 'succeeded' | 'failed' | 'cancelled',
  usage?: SeedanceVideoUsage,
  errorCode?: string
): AIGCModelObservation {
  const tokenMetric = toTokenMetric(usage)
  if (!tokenMetric) return { state, ...(errorCode ? { errorCode } : {}) }
  return {
    state,
    metrics: [tokenMetric],
    ...(errorCode ? { errorCode } : {})
  }
}

function toTokenMetric(usage?: SeedanceVideoUsage): ModelUsageMetric | undefined {
  if (!usage) return undefined
  const metric: Extract<ModelUsageMetric, { unit: 'token' }> = {
    unit: 'token',
    authority: 'provider'
  }
  if (usage.prompt_tokens !== undefined) metric.promptTokens = usage.prompt_tokens
  if (usage.completion_tokens !== undefined) metric.completionTokens = usage.completion_tokens
  if (usage.total_tokens !== undefined) metric.totalTokens = usage.total_tokens
  return metric.promptTokens !== undefined || metric.completionTokens !== undefined || metric.totalTokens !== undefined
    ? metric
    : undefined
}

function readTokenCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
