import { Document } from '@langchain/core/documents'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { getErrorMessage, type IRerank, RerankModel, type RerankResult, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { getXirangBaseUrl, type XirangModelCredentials } from '../types.js'

type XirangRerankResponse = {
  results?: Array<{ index?: number; relevance_score?: number; document?: string | { text?: string } }>
}

class XirangReranker implements IRerank {
  constructor(private readonly credentials: XirangModelCredentials, private readonly model: string) {}

  async rerank(docs: Document<Record<string, unknown>>[], query: string, options: { topN?: number; scoreThreshold?: number; model?: string }): Promise<RerankResult[]> {
    if (docs.length === 0) return []
    const response = await fetch(`${getXirangBaseUrl(this.credentials)}/rerank`, {
      method: 'POST',
      headers: { Authorization: this.credentials.app_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.credentials.endpoint_model_name || options.model || this.model, query, documents: docs.map((doc) => doc.pageContent), top_n: options.topN ?? docs.length })
    })
    if (!response.ok) throw new Error(`Xirang rerank endpoint returned HTTP ${response.status}`)
    const payload = (await response.json()) as XirangRerankResponse
    if (!Array.isArray(payload.results)) throw new Error('Xirang rerank response is missing results')
    const scores = payload.results.map((result) => Number(result.relevance_score ?? 0))
    const min = Math.min(...scores)
    const max = Math.max(...scores)
    const range = max === min ? 1 : max - min
    return payload.results
      .map((result, index) => ({
        index: Number.isInteger(result.index) ? Number(result.index) : index,
        relevanceScore: (Number(result.relevance_score ?? 0) - min) / range
      }))
      .filter((result) => options.scoreThreshold == null || result.relevanceScore >= options.scoreThreshold)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, options.topN ?? docs.length)
  }
}

@Injectable()
export class XirangRerankModel extends RerankModel {
  constructor(modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  override async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    if (!credentials?.app_key?.trim()) throw new Error('天翼云 AppKey 不能为空')
    try {
      await new XirangReranker(credentials, model).rerank([new Document({ pageContent: 'ping' })], 'ping', { model, topN: 1 })
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
