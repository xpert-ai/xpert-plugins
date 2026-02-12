import { HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ChatOAICompatReasoningModel, LargeLanguageModel, ModelProvider, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import omitBy from 'lodash-es/omitby.js'
import isNil from 'lodash-es/isnil.js'
import { toCredentialKwargs, ZhipuaiCredentials, ZhipuaiModelOptions } from '../types.js'

@Injectable()
export class ZhipuAILargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(ZhipuAILargeLanguageModel.name)

  constructor(override readonly modelProvider: ModelProvider) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: ZhipuaiCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials)
    const glm = new ChatOAICompatReasoningModel({
      ...params,
      model,
      temperature: 1,
      modelKwargs: {
		web_search: false,
        thinking: {
          type: 'disabled'
        }
      }
    })

    const messages = [new HumanMessage('Hello')]
    const res = await glm.invoke(messages)
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
        temperature: modelCredentials?.temperature ?? 0,
        maxTokens: modelCredentials?.max_tokens,
        topP: modelCredentials?.top_p,
        frequencyPenalty: modelCredentials?.frequency_penalty,
        maxRetries: modelCredentials?.maxRetries,
        doSample: modelCredentials?.do_sample,
        modelKwargs: {
		  web_search: modelCredentials?.web_search,
          thinking: {
            type: modelCredentials?.thinking ? 'enabled' : 'disabled'
          }
        }
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
