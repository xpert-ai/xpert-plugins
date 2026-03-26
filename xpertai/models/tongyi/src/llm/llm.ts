import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { isNil, omitBy } from 'lodash-es'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { QWenModelCredentials, toCredentialKwargs, TongyiCredentials } from '../types.js'

@Injectable()
export class TongyiLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(TongyiLargeLanguageModel.name)

  constructor(override readonly modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
    try {
      const chatModel = new ChatOpenAI({
        ...toCredentialKwargs(credentials),
        model,
        temperature: 0,
        maxTokens: 5,
      })
      await chatModel.invoke([
        {
          role: 'human',
          content: 'Hi',
        },
      ])
    } catch (err) {
      throw new CredentialsValidateFailedError(getErrorMessage(err))
    }
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot
    const modelCredentials = {
      ...(mergeCredentials(modelProvider.credentials, options?.modelProperties) ?? {}),
      ...(copilotModel.options ?? {}),
    } as TongyiCredentials & QWenModelCredentials
    const params = toCredentialKwargs(modelCredentials)

    const model = copilotModel.model
    const fields = omitBy(
      {
        ...params,
        model,
        streaming: modelCredentials.streaming ?? true,
        temperature: modelCredentials.temperature ?? 0,
        maxTokens: modelCredentials.max_tokens,
        topP: modelCredentials.top_p,
        frequencyPenalty: modelCredentials.frequency_penalty,
        maxRetries: modelCredentials.maxRetries,
        modelKwargs: omitBy(
          {
            enable_thinking: modelCredentials.enable_thinking,
            thinking_budget: modelCredentials.thinking_budget,
            enable_search: modelCredentials.enable_search,
          },
          isNil
        ),
        streamUsage: true,
      },
      isNil
    )

    return new ChatOAICompatReasoningModel({
      ...fields,
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, model, modelCredentials, handleLLMTokens),
        this.createHandleLLMErrorCallbacks(fields, this.#logger),
      ],
      metadata: {
        profile: this.getModelProfile(model, modelCredentials),
      },
    })
  }
}
