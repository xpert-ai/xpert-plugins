import { OpenAIEmbeddings } from '@langchain/openai'
import { Embeddings } from '@langchain/core/embeddings'
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs, TongyiCredentials, TongyiTextEmbeddingModelOptions } from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { TONGYI_MULTIMODAL_EMBEDDING_MODEL, TongyiMultimodalEmbeddings } from './multimodal-embeddings.js'

@Injectable()
export class TongyiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(override readonly modelProvider: TongyiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): Embeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const options = copilotModel.options as TongyiTextEmbeddingModelOptions
		return this.createEmbeddings(
			copilotModel.model || copilot.copilotModel?.model,
			modelProvider.credentials as TongyiCredentials,
			options?.max_chunks ?? 10
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

	private createEmbeddings(model: string, credentials: TongyiCredentials, batchSize = 10): Embeddings {
		if (model === TONGYI_MULTIMODAL_EMBEDDING_MODEL) {
			return new TongyiMultimodalEmbeddings({ credentials, batchSize })
		}
		return new OpenAIEmbeddings({ ...toCredentialKwargs(credentials), model, batchSize })
	}
}
