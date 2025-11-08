import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, LargeLanguageModel, mergeCredentials, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, XinferenceModelCredentials } from '../types.js'
import { translate } from '../i18n.js'

@Injectable()
export class XinferenceLargeLanguageModel extends LargeLanguageModel {
	readonly #logger = new Logger(XinferenceLargeLanguageModel.name)

	constructor(modelProvider: XinferenceProviderStrategy) {
		super(modelProvider, AiModelTypeEnum.LLM)
	}

	async validateCredentials(model: string, credentials: XinferenceModelCredentials): Promise<void> {
		try {
			const chatModel = new ChatOpenAI({
				...toCredentialKwargs(credentials, model),
				temperature: 0,
				maxTokens: 5
			})
			await chatModel.invoke([
				{
					role: 'human',
					content: `Hi`
				}
			])
		} catch (err) {
			throw new CredentialsValidateFailedError(getErrorMessage(err))
		}
	}

	override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
		const { handleLLMTokens } = options ?? {}
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		if (!options?.modelProperties) {
			throw new Error(
				translate('Error.ModelCredentialsMissing', {model: copilotModel.model})
			)
		}
		const modelCredentials = mergeCredentials(modelProvider.credentials, options.modelProperties) as XinferenceModelCredentials
		const params = toCredentialKwargs(modelCredentials, copilotModel.model)

		const fields = {
			...params,
			streaming: true,
			maxRetries: modelCredentials?.max_retries,
			streamUsage: false,
			verbose: options?.verbose
		}
		return new ChatOpenAI({
			...fields,
			callbacks: [
				...this.createHandleUsageCallbacks(copilot, params.model, modelCredentials, handleLLMTokens),
				this.createHandleLLMErrorCallbacks(fields, this.#logger)
			]
		})
	}
}
