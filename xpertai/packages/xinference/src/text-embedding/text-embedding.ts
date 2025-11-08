import { chunkArray } from '@langchain/core/utils/chunk_array'
import { OpenAIClient, OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, TChatModelOptions, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { translate } from '../i18n.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, XinferenceModelCredentials } from '../types.js'

@Injectable()
export class XinferenceTextEmbeddingModel extends TextEmbeddingModelManager {
	constructor(modelProvider: XinferenceProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
	}

	getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		if (!options?.modelProperties) {
			throw new Error(
				translate('Error.ModelCredentialsMissing', {model: copilotModel.model})
			)
		}
		const params = toCredentialKwargs({
				...(modelProvider.credentials ?? {}),
				...options.modelProperties,
			} as XinferenceModelCredentials,
			copilotModel.model || copilotModel.copilot.copilotModel?.model
		)

		return new XinferenceOpenAIEmbeddings({
			...params,
			// batchSize: 512, // Default value if omitted is 512. Max is 2048
		})
	}

	async validateCredentials(model: string, credentials: XinferenceModelCredentials): Promise<void> {
		try {
			// transform credentials to kwargs for model instance
			const params = toCredentialKwargs(credentials as XinferenceModelCredentials, model)
			const embeddings = new XinferenceOpenAIEmbeddings({
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


class XinferenceOpenAIEmbeddings extends OpenAIEmbeddings {
	/**
	 * Method to generate embeddings for an array of documents. Splits the
	 * documents into batches and makes requests to the OpenAI API to generate
	 * embeddings.
	 * @param texts Array of documents to generate embeddings for.
	 * @returns Promise that resolves to a 2D array of embeddings for each document.
	 */
	override async embedDocuments(texts: string[]) {
		const batches = chunkArray(this.stripNewLines ? texts.map((t) => t.replace(/\n/g, ' ')) : texts, this.batchSize)

		const batchRequests = batches.map((batch) => {
			const params: OpenAIClient.EmbeddingCreateParams = {
				model: this.model,
				input: batch,
				encoding_format: 'float' // ✅ Use 'float' (any value) to skip base64 decoding in OpenAIEmbeddings class, Xinference does not support this parameter
			}
			if (this.dimensions) {
				params.dimensions = this.dimensions
			}
			return this.embeddingWithRetry(params)
		})
		const batchResponses = await Promise.all(batchRequests)

		const embeddings: number[][] = []
		for (let i = 0; i < batchResponses.length; i += 1) {
			const batch = batches[i]
			const { data: batchResponse } = batchResponses[i]
			for (let j = 0; j < batch.length; j += 1) {
				embeddings.push(batchResponse[j].embedding)
			}
		}
		return embeddings
	}
	
	override async embedQuery(text: string) {
		const params: OpenAIClient.EmbeddingCreateParams = {
			model: this.model,
			input: this.stripNewLines ? text.replace(/\n/g, ' ') : text,
			encoding_format: 'float' // ✅ Use 'float' (any value) to skip base64 decoding in OpenAIEmbeddings class, Xinference does not support this parameter
		}
		if (this.dimensions) {
			params.dimensions = this.dimensions
		}
		const { data } = await this.embeddingWithRetry(params)
		return data[0].embedding
	}
}
