import { ChatOpenAIFields, ClientOptions } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  LargeLanguageModel,
  getErrorMessage,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { HunyuanProviderStrategy } from '../provider.strategy.js'
import { HunyuanModelCredentials, toCredentialKwargs } from '../types.js'

export type THunyuanLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

@Injectable()
export class HunyuanLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: HunyuanProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  protected createChatModel(params: THunyuanLLMParams) {
    return new ChatOAICompatReasoningModel(params)
  }

  async validateCredentials(model: string, credentials: HunyuanModelCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials, model)

    try {
      const chatModel = this.createChatModel({
        ...params,
        temperature: 0,
        maxTokens: 5,
        streamUsage: false,
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
    const { copilot } = copilotModel
    const { handleLLMTokens } = options ?? {}
    const credentials = mergeCredentials(
      copilot.modelProvider.credentials,
      options?.modelProperties
    ) as HunyuanModelCredentials
    const params = toCredentialKwargs(credentials, copilotModel.model)
    const modelName = (params.model as string) || copilotModel.model

    return this.createChatModel({
      ...params,
      streaming: copilotModel.options?.['streaming'] ?? this.canStreaming(modelName),
      temperature: copilotModel.options?.['temperature'] ?? credentials.temperature ?? 0,
      topP: copilotModel.options?.['top_p'] ?? credentials.top_p,
      maxTokens: copilotModel.options?.['max_tokens'] ?? credentials.max_tokens,
      streamUsage: false,
      verbose: options?.verbose,
      callbacks: [...this.createHandleUsageCallbacks(copilot, modelName, credentials, handleLLMTokens)],
    })
  }

  canStreaming(model: string) {
    return !model.startsWith('o1')
  }
}
