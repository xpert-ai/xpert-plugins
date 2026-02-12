import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { toCredentialKwargs, ZhipuaiCredentials, ZhipuaiTextEmbeddingModelOptions } from '../types.js'
import { ZhipuaiProviderStrategy } from '../zhipuai.js'

@Injectable()
export class ZhipuaiTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(override readonly modelProvider: ZhipuaiProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const options = copilotModel.options as ZhipuaiTextEmbeddingModelOptions
		const params = toCredentialKwargs(modelProvider.credentials as ZhipuaiCredentials)

		return new OpenAIEmbeddings({
			...params,
			model: copilotModel.model || copilotModel.copilot.copilotModel?.model,
			batchSize: options?.max_chunks
		})
	}

	async validateCredentials(model: string, credentials: ZhipuaiCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as ZhipuaiCredentials)
			const embeddings = new OpenAIEmbeddings({
				...params,
				model
			})

			// call embedding model
			await embeddings.embedQuery('ping')
		} catch (ex) {
			throw new CredentialsValidateFailedError(getErrorMessage(ex))
		}
	}
}
