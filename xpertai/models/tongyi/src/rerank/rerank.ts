import { Callbacks } from '@langchain/core/callbacks/manager'
import { Document, DocumentInterface } from '@langchain/core/documents'
import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IRerank, mergeCredentials, RerankModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import axios from 'axios'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { getDashscopeApiBase, TongyiCredentials } from '../types.js'

@Injectable()
export class TongyiRerankModel extends RerankModel {
  constructor(modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as TongyiCredentials
    return new TongyiRerank({
      apiKey: credentials.dashscope_api_key,
      model: copilotModel.model,
      url: `${getDashscopeApiBase(credentials)}/services/rerank/text-rerank/text-rerank`,
    })
  }
}

export class TongyiRerank extends BaseDocumentCompressor implements IRerank {
  private readonly model: string = 'gte-rerank-v2'
  private readonly topN: number = 3
  private readonly apiKey: string = process.env.DASHSCOPE_API_KEY || ''
  private readonly url: string

  constructor(fields: { apiKey: string; model: string; topN?: number; url: string }) {
    super()
    this.apiKey = fields.apiKey || this.apiKey
    this.model = fields.model || this.model
    this.topN = fields.topN || this.topN
    this.url = fields.url
  }

  async compressDocuments(
    documents: DocumentInterface[],
    query: string,
    callbacks?: Callbacks
  ): Promise<DocumentInterface[]> {
    const topN = this.topN
    const rerankResults = await this.rerank(documents as Document<Record<string, any>>[], query, { topN })
    const sortedIndices = rerankResults.slice(0, topN).map((result) => result.index)
    return sortedIndices.map((idx) => documents[idx])
  }

  async rerank(
    docs: Document<Record<string, any>>[],
    query: string,
    options: {
      topN?: number
      scoreThreshold?: number
      model?: string
    }
  ): Promise<
    {
      index: number
      relevanceScore: number
      document?: Document<Record<string, any>>
    }[]
  > {
    const payload = {
      model: this.model,
      input: {
        query,
        documents: docs.map((doc) => doc.pageContent),
      },
      parameters: {
        return_documents: false,
        top_n: options.topN,
      },
    }

    const response = await axios.post(this.url, payload, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    const results = response.data.output?.results || []
    return results.map((item: any) => ({
      index: item.index,
      relevanceScore: item.relevance_score,
    }))
  }
}
