import { Document } from '@langchain/core/documents'
import { Callbacks } from '@langchain/core/callbacks/manager'
import { DocumentInterface } from '@langchain/core/documents'
import { BaseDocumentCompressor } from '@langchain/core/retrievers/document_compressors'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { IRerank, RerankModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { TongyiCredentials } from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class TongyiRerankModel extends RerankModel {
	constructor(modelProvider: TongyiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.RERANK)
	}

	async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
		const credentials = copilotModel.copilot.modelProvider.credentials as TongyiCredentials
		return new TongyiRerank({
			apiKey: credentials.dashscope_api_key,
			model: copilotModel.model
		})
	}
}

export class TongyiRerank extends BaseDocumentCompressor implements IRerank {
	private readonly model: string
	private readonly topN: number
	private readonly apiKey: string
	private readonly url = 'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank'

	constructor(fields: { apiKey: string; model: string; topN?: number }) {
		super()
		this.apiKey = fields.apiKey
		this.model = fields.model || 'gte-rerank-v2'
		this.topN = fields.topN || 3
	}

	async compressDocuments(
		documents: DocumentInterface[],
		query: string,
		callbacks?: Callbacks
	): Promise<DocumentInterface[]> {
		const rerankResults = await this.rerank(documents as Document<Record<string, any>>[], query, { topN: this.topN })
		const sortedIndices = rerankResults.slice(0, this.topN).map((result) => result.index)
		return sortedIndices.map((idx) => documents[idx])
	}

	async rerank(
		docs: Document<Record<string, any>>[],
		query: string,
		options: { topN?: number; scoreThreshold?: number; model?: string }
	): Promise<{ index: number; relevanceScore: number; document?: Document<Record<string, any>> }[]> {
		const documents = docs.map((doc) => doc.pageContent)
		const payload = {
			model: this.model,
			input: { query, documents },
			parameters: {
				return_documents: false,
				top_n: options.topN
			}
		}

		const response = await fetch(this.url, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${this.apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Tongyi rerank failed: ${response.status} ${errorText}`)
		}

		const data = await response.json() as { output?: { results?: { index: number; relevance_score: number }[] } }
		const results = data.output?.results || []
		return results.map((item) => ({
			index: item.index,
			relevanceScore: item.relevance_score
		}))
	}
}
