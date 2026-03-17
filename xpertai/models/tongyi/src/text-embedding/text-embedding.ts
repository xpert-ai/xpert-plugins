import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs, TongyiCredentials, TongyiTextEmbeddingModelOptions } from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class TongyiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(override readonly modelProvider: TongyiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const options = copilotModel.options as TongyiTextEmbeddingModelOptions
		const params = toCredentialKwargs(modelProvider.credentials as TongyiCredentials)

		return new OpenAIEmbeddings({
			...params,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model,
			batchSize: options?.max_chunks ?? 10
		})
	}

	async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
		try {
			const params = toCredentialKwargs(credentials)
			const embeddings = new OpenAIEmbeddings({
				...params,
				model
			})
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
