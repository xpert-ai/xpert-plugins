import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { AiModelTypeEnum, type ICopilotModel, type ModelUsageMetric } from '@xpert-ai/contracts'
import { ImageGenerationModel, mergeCredentials, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { MiniMaxProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, type MiniMaxCredentials } from '../types.js'

const outputSize = z.string().refine(value => {
  if (value === 'auto') return true
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  const pixels = width * height
  return pixels >= 655_360 && pixels <= 20_000_000 && width <= 3 * height && height <= 3 * width
}, 'MiniMax image size is outside the supported dimensions')

const aspectRatio = z.string().refine(value => {
  if (value === 'auto') return true
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(value)
  if (!match) return false
  const width = Number(match[1])
  const height = Number(match[2])
  return width >= 1 && height >= 1 && width <= 300 && height <= 300 && width <= 3 * height && height <= 3 * width
}, 'MiniMax image aspect ratio is outside the supported range')

const reference = z.object({ image_url: z.string().min(1) })
const request = z.object({
  prompt: z.string().trim().min(1).refine(value => [...value].length <= 32_000, 'MiniMax prompt exceeds 32000 characters'),
  images: z.array(reference).min(1).max(16).optional(),
  n: z.number().int().min(1).max(10).optional(),
  area: z.enum(['1K', '2K', '4K']).optional(),
  aspect_ratio: aspectRatio.optional(),
  size: outputSize.optional(),
  stream: z.literal(false).optional(),
  disable_prompt_enhanced: z.boolean().optional(),
  response_format: z.enum(['url', 'b64_json']).optional(),
  output_format: z.enum(['png', 'jpeg', 'jpg', 'webp']).optional(),
  output_compression: z.number().int().min(0).max(100).optional()
}).strict().refine(fields => !fields.size || fields.size === 'auto' || (!fields.area && !fields.aspect_ratio),
  'Set either an explicit image size or an area and aspect ratio')
  .refine(fields => !fields.images || fields.disable_prompt_enhanced === undefined,
    'MiniMax image edits always enhance the prompt')
  .refine(fields => !fields.disable_prompt_enhanced ||
    Boolean((fields.size && fields.size !== 'auto') || (fields.aspect_ratio && fields.aspect_ratio !== 'auto')),
    'MiniMax requires an explicit size or aspect ratio when prompt enhancement is disabled')
const result = z.object({
  data: z.array(z.union([
    z.object({ url: z.string().url(), size: z.string().optional() }).passthrough(),
    z.object({ b64_json: z.string().min(1), size: z.string().optional() }).passthrough(),
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
        const operation = fields.images ? 'image_to_image' : 'text_to_image'
        const path = fields.images ? '/images/edits' : '/images/generations'
        const startedAt = new Date().toISOString()
        const response = await fetch(configuration.baseURL + path, {
          method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, model }), signal: AbortSignal.timeout(610000)
        })
        if (!response.ok) throw new Error('MiniMax image request failed with HTTP ' + response.status)
        const data = result.parse(await response.json())
        const imageSizes = data.data.flatMap(item => 'url' in item || 'b64_json' in item ? [item.size] : [])
        if (!imageSizes.length) throw new Error('MiniMax returned no successful images')
        const tiers = new Set(imageSizes.map(value => {
          const size = value && /^(\d+)x(\d+)$/.exec(value)
          if (!size) return 'unknown'
          return Number(size[1]) * Number(size[2]) >= 16_600_000 ? '4k-promotion' : 'standard'
        }))
        const resolution = tiers.size === 1 ? [...tiers][0] : 'unknown'
        const market = ['https://api.minimaxi.com/v1', 'https://api.minimax.cn/v1'].includes(configuration.baseURL) ? 'cn'
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
          metrics.push({ unit: 'generation', authority: 'provider', quantity: imageSizes.length })
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
