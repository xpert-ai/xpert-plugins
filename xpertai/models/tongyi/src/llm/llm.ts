import { HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ChatOAICompatReasoningModel, LargeLanguageModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { toCredentialKwargs, TongyiCredentials, TongyiModelCredentials } from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class TongyiLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(TongyiLargeLanguageModel.name)

  constructor(override readonly modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials)
    const chatModel = new ChatOAICompatReasoningModel({
      ...params,
      model,
      temperature: 0,
      maxTokens: 5
    })

    const messages = [new HumanMessage('Hello')]
    await chatModel.invoke(messages)
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot
    const credentials = modelProvider.credentials as TongyiCredentials
    const params = toCredentialKwargs(credentials)
    const modelCredentials = copilotModel.options as TongyiModelCredentials

    const model = copilotModel.model
    const fields = omitBy(
      {
        ...params,
        model,
        streaming: modelCredentials?.streaming ?? true,
        temperature: modelCredentials?.temperature ?? 0,
        maxTokens: modelCredentials?.max_tokens,
        topP: modelCredentials?.top_p,
        frequencyPenalty: modelCredentials?.frequency_penalty,
        maxRetries: modelCredentials?.maxRetries,
        modelKwargs: omitBy(
          {
            enable_thinking: modelCredentials?.enable_thinking,
            thinking_budget: modelCredentials?.thinking_budget,
            enable_search: modelCredentials?.enable_search
          },
          isNil
        ),
        streamUsage: true
      },
      isNil
    )

    return new ChatOAICompatReasoningModel({
      ...fields,
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, model, credentials, handleLLMTokens),
        this.createHandleLLMErrorCallbacks(fields, this.#logger)
      ],
      metadata: {
        profile: this.getModelProfile(model, credentials)
      }
    })
  }
}
