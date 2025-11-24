import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, TChatModelOptions, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types.js'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class OAIAPICompatTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(modelProvider: OpenAICompatibleProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const params = toCredentialKwargs({
				...(modelProvider.credentials ?? {}),
				...(options?.modelProperties ?? {}),
			} as OpenAICompatModelCredentials,
			copilotModel.model || copilotModel.copilot.copilotModel?.model
		)

		return new OpenAIEmbeddings({
			...params,
			// batchSize: 512, // Default value if omitted is 512. Max is 2048
		})
	}

	async validateCredentials(model: string, credentials: OpenAICompatModelCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as OpenAICompatModelCredentials, model)
			const embeddings = new OpenAIEmbeddings({
				...params,
				// batchSize: 512, // Default value if omitted is 512. Max is 2048
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
