import { OpenAIEmbeddings } from '@langchain/openai'
import { Embeddings } from '@langchain/core/embeddings'
import { AiModelTypeEnum, ICopilotModel, PriceType } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { isTongyiInternationalEndpointEnabled, toCredentialKwargs, TongyiCredentials, TongyiTextEmbeddingModelOptions } from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { TONGYI_MULTIMODAL_EMBEDDING_MODEL, TongyiMultimodalEmbeddings } from './multimodal-embeddings.js'

@Injectable()
export class TongyiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(override readonly modelProvider: TongyiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	override getPrice(model: string, credentials: TongyiCredentials, priceType: PriceType, tokens: number, inputTokens = tokens) {
		const price = super.getPrice(model, credentials, priceType, tokens, inputTokens)
		if (model === 'qwen3.7-text-embedding' && priceType === PriceType.INPUT && isTongyiInternationalEndpointEnabled(credentials)) {
			return { ...price, unitPrice: 0.525, unit: 0.000001, totalAmount: Number((tokens * 0.525 / 1000000).toFixed(7)) }
		}
		return price
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): Embeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const options = copilotModel.options as TongyiTextEmbeddingModelOptions
		return this.createEmbeddings(
			copilotModel.model || copilot.copilotModel?.model,
			modelProvider.credentials as TongyiCredentials,
			options?.max_chunks ?? 10,
			options?.dimensions
		)
	}

	async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
		try {
			const embeddings = this.createEmbeddings(model, credentials)
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}

	private createEmbeddings(model: string, credentials: TongyiCredentials, batchSize = 10, dimensions?: number): Embeddings {
		if (model === TONGYI_MULTIMODAL_EMBEDDING_MODEL) {
			return new TongyiMultimodalEmbeddings({ credentials, batchSize })
		}
		const supportedDimensions = QWEN37_EMBEDDING_DIMENSIONS[model]
		if (supportedDimensions) {
			if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('Batch size must be a positive integer')
			if (dimensions !== undefined && !supportedDimensions.includes(dimensions)) {
				throw new Error(`${model}: unsupported dimensions ${dimensions}`)
			}
		}
		return new OpenAIEmbeddings({
			...toCredentialKwargs(credentials), model,
			batchSize: supportedDimensions ? Math.min(batchSize, 20) : batchSize,
			...(dimensions === undefined ? {} : { dimensions })
		})
	}
}

const QWEN37_EMBEDDING_DIMENSIONS: Readonly<Record<string, readonly number[]>> = {
	'qwen3.7-text-embedding': [256, 512, 768, 1024, 1536, 2048, 2560],
	'qwen3.7-text-embedding-flash': [256, 512, 768, 1024]
}
