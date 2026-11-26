import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { AiModelTypeEnum, type ICopilotModel, type ModelUsageMetric } from '@xpert-ai/contracts'
import { ImageGenerationModel, mergeCredentials, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { MiniMaxProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, type MiniMaxCredentials } from '../types.js'

const reference = z.object({ image_url: z.string().min(1) })
const request = z.object({
  prompt: z.string().trim().min(1),
  images: z.array(reference).min(1).max(16).optional(),
  n: z.number().int().min(1).max(10).optional(),
  area: z.enum(['1K', '2K', '4K']).optional(),
  aspect_ratio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional()
}).strict()
const result = z.object({
  data: z.array(z.union([
    z.object({ url: z.string().url(), size: z.string().optional() }).passthrough(),
    z.object({ error: z.object({ code: z.string(), message: z.string() }) })
  ])).nonempty(),
  request_id: z.string().optional(),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(),
    input_tokens_details: z.object({ text_tokens: z.number().int().nonnegative(), image_tokens: z.number().int().nonnegative() }).optional()
  }).passthrough().optional(),
  base_resp: z.object({ status_code: z.literal(0) }).optional()
}).passthrough()

@Injectable()
export class MiniMaxImageModel extends ImageGenerationModel {
  constructor(provider: MiniMaxProviderStrategy) { super(provider, AiModelTypeEnum.IMAGE) }

  override async validateCredentials(_model: string, credentials: MiniMaxCredentials) {
    if (!credentials.api_key?.trim()) throw new Error('MiniMax API key is required')
  }

  override getAIGCModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const model = copilotModel.model
    const credentials = mergeCredentials(copilotModel.copilot.modelProvider.credentials, options?.modelProperties) as MiniMaxCredentials
    const { apiKey, configuration } = toCredentialKwargs(credentials)
    return {
      async invoke(input: z.input<typeof request>) {
        const fields = request.parse(input)
        if (fields.images && fields.n !== undefined) throw new Error('MiniMax image editing does not accept n')
        const operation = fields.images ? 'image_to_image' : 'text_to_image'
        const path = fields.images ? '/images/edits' : '/images/generations'
        const startedAt = new Date().toISOString()
        const response = await fetch(configuration.baseURL + path, {
          method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, model }), signal: AbortSignal.timeout(610000)
        })
        if (!response.ok) throw new Error('MiniMax image request failed with HTTP ' + response.status)
        const data = result.parse(await response.json())
        const images = data.data.filter(item => 'url' in item)
        if (!images.length) throw new Error('MiniMax returned no successful images')
        const tiers = new Set(images.map(image => {
          const size = 'size' in image && typeof image.size === 'string' && /^(\d+)x(\d+)$/.exec(image.size)
          if (!size) return 'unknown'
          return Number(size[1]) * Number(size[2]) >= 16_600_000 ? '4k-promotion' : 'standard'
        }))
        const resolution = tiers.size === 1 ? [...tiers][0] : 'unknown'
        const market = configuration.baseURL === 'https://api.minimaxi.com/v1' ? 'cn'
          : configuration.baseURL === 'https://api.minimax.io/v1' ? 'global' : 'custom'
        const metrics: ModelUsageMetric[] = []
        if (data.usage) {
          const details = data.usage.input_tokens_details
          const text = details?.text_tokens ?? (fields.images ? undefined : data.usage.input_tokens)
          if (text !== undefined) metrics.push({ unit: 'token', component: 'input', key: 'text', authority: 'provider',
            promptTokens: text, pricingDimensions: { resolution, mode: market + '-text' } })
          if (details?.image_tokens) metrics.push({ unit: 'token', component: 'input', key: 'reference', authority: 'provider',
            promptTokens: details.image_tokens, pricingDimensions: { resolution, mode: market + '-reference' } })
          if (text === undefined) metrics.push({ unit: 'token', component: 'input', key: 'unspecified', authority: 'provider',
            promptTokens: data.usage.input_tokens, pricingDimensions: { resolution, mode: 'unspecified' } })
          metrics.push({ unit: 'token', component: 'output', key: 'image', authority: 'provider',
            completionTokens: data.usage.output_tokens, pricingDimensions: { resolution, mode: market + '-image' } })
        } else {
          metrics.push({ unit: 'generation', authority: 'provider', quantity: images.length })
        }
        if (options?.handleModelUsage) {
          const pricingSnapshot = await options.resolveUsagePricingSnapshot?.({ model, modality: 'image', operation, startedAt })
          await options.handleModelUsage({
            requestId: data.request_id || randomUUID(), model, modelType: AiModelTypeEnum.IMAGE, modality: 'image',
            operation, metrics, pricingSnapshot, recordedAt: new Date().toISOString()
          })
        }
        return { data, observation: { state: 'succeeded' as const, metrics } }
      }
    }
  }
}
