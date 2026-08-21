import { Document } from '@langchain/core/documents'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { getErrorMessage, type IRerank, RerankModel, type RerankResult, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { getXirangBaseUrl, type XirangModelCredentials } from '../types.js'
import { buildRerankBody, extractRerankResults, getRerankModelId, getRerankRequest, mapRerankResults, type XirangRerankPayload } from './protocol.js'

class XirangReranker implements IRerank {
  constructor(private readonly credentials: XirangModelCredentials, private readonly model: string) {}

  async rerank(docs: Document<Record<string, unknown>>[], query: string, options: { topN?: number; scoreThreshold?: number; model?: string }): Promise<RerankResult[]> {
    if (docs.length === 0) return []
    const model = getRerankModelId(options.model || this.model, this.credentials)
    const request = getRerankRequest(this.credentials, options.model || this.model)
    const body = buildRerankBody(
      model,
      query,
      docs.map((doc) => doc.pageContent),
      options.topN ?? docs.length,
      this.credentials,
      request
    )

    const response = await fetch(`${getXirangBaseUrl(this.credentials)}${request.path}`, {
      method: 'POST',
      headers: { Authorization: request.authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) {
      let detail = ''
      try {
        const errorPayload = (await response.json()) as { message?: string; detail?: string; error?: { message?: string } }
        detail = errorPayload.error?.message || errorPayload.detail || errorPayload.message || ''
      } catch {
        // Preserve the status when the gateway does not return JSON.
      }
      throw new Error(`Xirang rerank endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    const payload = (await response.json()) as XirangRerankPayload
    if (payload.code != null && payload.code !== 0) {
      throw new Error(`Xirang rerank request failed${payload.error?.message ? `: ${payload.error.message}` : ` (code ${payload.code})`}`)
    }
    if (payload.error?.message) throw new Error(`Xirang rerank request failed: ${payload.error.message}`)
    const results = extractRerankResults(payload)
    if (!results) throw new Error('Xirang rerank response is missing results')
    return mapRerankResults(results, options.scoreThreshold, options.topN ?? docs.length)
  }
}

@Injectable()
export class XirangRerankModel extends RerankModel {
  constructor(modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  override async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    if (!credentials?.app_key?.trim()) throw new Error('天翼云 AppKey 不能为空')
    getRerankModelId(model, credentials)
    try {
      await new XirangReranker(credentials, model).rerank([
        new Document({ pageContent: '人工智能正在快速发展。' }),
        new Document({ pageContent: '量子计算是计算科学的前沿领域。' })
      ], '什么是人工智能', { model, topN: 1 })
    } catch (error) {
      throw new Error(`Reranker credentials validation failed: ${getErrorMessage(error)}`)
    }
  }

  override async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
    const credentials = {
      ...(copilotModel.copilot?.modelProvider?.credentials ?? {}),
      ...(options?.modelProperties ?? {})
    } as XirangModelCredentials
    return new XirangReranker(credentials, copilotModel.model)
  }
}
