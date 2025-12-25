import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { getErrorMessage } from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { ModelProvider, 
	TextEmbeddingModelManager, 
	CredentialsValidateFailedError } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs, TongyiCredentials, TongyiTextEmbeddingModelOptions } from '../types.js'

@Injectable()
export class TongyiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(override readonly modelProvider: ModelProvider) {
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
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as TongyiCredentials)
			const embeddings = new OpenAIEmbeddings({
				...params,
				model,
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
