import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings'
import { randomUUID } from 'node:crypto'
import { AiModelTypeEnum, type ModelUsagePricingContext } from '@xpert-ai/contracts'
import type { TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { getTongyiHttpBaseUrl, joinTongyiApiUrl, TongyiCredentials } from '../types.js'

export const TONGYI_MULTIMODAL_EMBEDDING_MODEL = 'multimodal-embedding-v1'
export const QWEN_VL_EMBEDDING_MODEL = 'qwen3-vl-embedding'

const responseSchema = z.object({
  output: z.object({
    embeddings: z.array(z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()),
      type: z.literal('text')
    }))
  }),
  usage: z.object({ input_tokens: z.number().int().nonnegative() }).optional()
})

const errorSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  request_id: z.string().optional()
})

type TongyiMultimodalEmbeddingsParams = EmbeddingsParams & {
  credentials: TongyiCredentials
  batchSize?: number
  model?: string
  dimensions?: number
  runtime?: TChatModelOptions
}

/** Text input for the native multimodal endpoint; the host Embeddings contract accepts strings. */
export class TongyiMultimodalEmbeddings extends Embeddings {
  private readonly url: string
  private readonly apiKey: string
  private readonly batchSize: number
  private readonly model: string
  private readonly dimensions: number
  private readonly runtime?: TChatModelOptions

  constructor({ credentials, batchSize = 10, model = TONGYI_MULTIMODAL_EMBEDDING_MODEL, dimensions, runtime, ...params }: TongyiMultimodalEmbeddingsParams) {
    super({ maxRetries: 2, ...params })
    if (!Number.isInteger(batchSize) || batchSize < 1) {
      throw new Error('Tongyi embedding batch size must be a positive integer')
    }
    // DashScope permits at most 20 text inputs per request for this model.
    this.batchSize = Math.min(batchSize, 20)
    this.model = model
    this.runtime = runtime
    this.dimensions = dimensions ?? (model === QWEN_VL_EMBEDDING_MODEL ? 2560 : 1024)
    const allowed = model === QWEN_VL_EMBEDDING_MODEL ? [256, 512, 768, 1024, 1536, 2048, 2560] : [1024]
    if (!allowed.includes(this.dimensions)) throw new Error(`${model}: unsupported dimensions ${this.dimensions}`)
    this.apiKey = credentials.dashscope_api_key
    this.url = joinTongyiApiUrl(
      getTongyiHttpBaseUrl(credentials),
      '/services/embeddings/multimodal-embedding/multimodal-embedding'
    )
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const vectors: number[][] = []
    for (let offset = 0; offset < documents.length; offset += this.batchSize) {
      vectors.push(...await this.embedBatch(documents.slice(offset, offset + this.batchSize)))
    }
    return vectors
  }

  async embedQuery(document: string): Promise<number[]> {
    const [vector] = await this.embedBatch([document])
    return vector
  }

  private async embedBatch(documents: string[]): Promise<number[][]> {
    const context: ModelUsagePricingContext = { model: this.model, operation: AiModelTypeEnum.TEXT_EMBEDDING, modality: 'text', startedAt: new Date().toISOString() }
    const pricingSnapshot = this.runtime?.handleModelUsage ? await this.runtime.resolveUsagePricingSnapshot?.(context) : undefined
    const body = await this.caller.call(async () => {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: { contents: documents.map((text) => ({ text })) },
          ...(this.model === QWEN_VL_EMBEDDING_MODEL ? { parameters: { dimension: this.dimensions } } : {})
        }),
        signal: AbortSignal.timeout(60_000)
      })
      const body: string = await response.text()
      if (!response.ok) {
        throw Object.assign(new Error(`Tongyi multimodal embedding failed: HTTP ${response.status} ${body}`), {
          status: response.status
        })
      }
      return body
    })

    // Validate outside the retry loop: malformed vectors must never enter the vector store.
    const data: object = JSON.parse(body)
    const failure = errorSchema.safeParse(data)
    if (failure.success && failure.data.code) {
      const { code, message, request_id } = failure.data
      throw new Error(`Tongyi multimodal embedding failed: ${code}: ${message ?? ''} (request_id: ${request_id ?? 'n/a'})`)
    }
    const result = responseSchema.safeParse(data)
    if (!result.success || result.data.output.embeddings.some((entry) => entry.embedding.length !== this.dimensions)) {
      throw new Error(`Tongyi multimodal embedding returned an invalid response; expected ${this.dimensions}-dimensional text vectors`)
    }
    const embeddings = result.data.output.embeddings.sort((left, right) => left.index - right.index)
    if (embeddings.length !== documents.length || embeddings.some((entry, index) => entry.index !== index)) {
      throw new Error('Tongyi multimodal embedding returned missing, duplicate or out-of-range input indices')
    }
    const tokens = result.data.usage?.input_tokens
    // Accounting failure must not retry a successful, billable provider request.
    if (tokens !== undefined && this.runtime?.handleModelUsage) {
      await this.runtime.handleModelUsage({
        requestId: randomUUID(), model: this.model, modelType: AiModelTypeEnum.TEXT_EMBEDDING,
        operation: AiModelTypeEnum.TEXT_EMBEDDING, modality: 'text', pricingSnapshot,
        recordedAt: new Date().toISOString(),
        metrics: [{ unit: 'token', authority: 'provider', promptTokens: tokens, completionTokens: 0, totalTokens: tokens }]
      })
    }
    return embeddings.map((entry) => entry.embedding)
  }
}
