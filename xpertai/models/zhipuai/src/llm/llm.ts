import { HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ChatOAICompatReasoningModel, LargeLanguageModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { toCredentialKwargs, ZhipuaiCredentials, ZhipuaiModelOptions } from '../types.js'
import { ZhipuaiProviderStrategy } from '../zhipuai.js'

@Injectable()
export class ZhipuAILargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(ZhipuAILargeLanguageModel.name)

  constructor(override readonly modelProvider: ZhipuaiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: ZhipuaiCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials)
    const chatModel = new ChatOAICompatReasoningModel({
      ...params,
      model,
      temperature: 1,
      modelKwargs: {
        thinking: {
          type: 'disabled'
        }
      }
    })

    const messages = [new HumanMessage('Hello')]
    await chatModel.invoke(messages)
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot
    const credentials = modelProvider.credentials as ZhipuaiCredentials
    const params = toCredentialKwargs(credentials)
    const modelCredentials = copilotModel.options as ZhipuaiModelOptions

    const model = copilotModel.model
    const fields = omitBy(
      {
        ...params,
        model,
        streaming: modelCredentials?.streaming ?? true,
        temperature: modelCredentials?.temperature ?? 0.6,
        maxTokens: modelCredentials?.max_tokens,
        topP: modelCredentials?.top_p,
        frequencyPenalty: modelCredentials?.frequency_penalty,
        maxRetries: modelCredentials?.maxRetries,
        modelKwargs: omitBy(
          {
            web_search: modelCredentials?.web_search,
            response_format: modelCredentials?.response_format
              ? { type: modelCredentials.response_format }
              : undefined,
            thinking: {
              type: modelCredentials?.thinking ?? 'enabled',
              clear_thinking: modelCredentials?.clear_thinking
            }
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
