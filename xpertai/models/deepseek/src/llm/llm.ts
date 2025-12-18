import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { DeepSeekProviderStrategy } from '../provider.strategy.js';
import { DeepseekCredentials, DeepseekModelCredentials, toCredentialKwargs } from '../types.js';

@Injectable()
export class DeepSeekLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(DeepSeekLargeLanguageModel.name);

  constructor(modelProvider: DeepSeekProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(model: string, credentials: DeepseekCredentials): Promise<void> {
		try {
			const chatModel = new ChatOAICompatReasoningModel({
				...toCredentialKwargs(credentials),
				model,
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

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ) {
    const { handleLLMTokens } = options ?? {}
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as DeepseekCredentials
		const params = toCredentialKwargs(credentials)
		const modelCredentials = copilotModel.options as DeepseekModelCredentials

		const model = copilotModel.model
		const fields = {
			...params,
			model,
			streaming: modelCredentials?.streaming ?? true,
			temperature: modelCredentials?.temperature ?? 0,
			maxTokens: modelCredentials?.max_tokens,
			topP: modelCredentials?.top_p,
			frequencyPenalty: modelCredentials?.frequency_penalty,
			maxRetries: modelCredentials?.maxRetries,
			streamUsage: false,
			verbose: options?.verbose,
		}

    return new ChatOAICompatReasoningModel({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(
          copilot,
          params.model,
          modelCredentials,
          handleLLMTokens
        ),
        this.createHandleLLMErrorCallbacks(fields, this.#logger),
      ],
    });
  }
}
