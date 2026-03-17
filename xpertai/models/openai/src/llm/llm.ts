import { HumanMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import {
  OpenAICredentials,
  OpenAIModelOptions,
  shouldEnableResponseFormat,
  shouldEnableSamplingParameters,
  toCredentialKwargs
} from '../types.js'
import { OpenAIProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class OpenAILargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(OpenAILargeLanguageModel.name)

  constructor(override readonly modelProvider: OpenAIProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: OpenAICredentials): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials)
      const chatModel = new ChatOpenAI({
        ...params,
        model,
        maxTokens: 5,
        useResponsesApi: true,
      })
      const messages = [new HumanMessage('Hello')]
      await chatModel.invoke(messages)
    } catch (err) {
      throw new CredentialsValidateFailedError(getErrorMessage(err))
    }
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot
    const credentials = modelProvider.credentials as OpenAICredentials
    const params = toCredentialKwargs(credentials)
    const modelOptions = copilotModel.options as OpenAIModelOptions
    const model = copilotModel.model
    const hasCustomEndpoint = !!credentials?.endpoint_url?.trim()
    const streaming = modelOptions?.streaming ?? !hasCustomEndpoint
    const supportsSamplingParams = shouldEnableSamplingParameters(
      credentials?.sampling_parameters,
      params.configuration?.baseURL,
      model
    )
    const supportsResponseFormat = shouldEnableResponseFormat(params.configuration?.baseURL, model)
    const responseFormat =
      supportsResponseFormat && modelOptions?.response_format
        ? { type: modelOptions.response_format }
        : undefined

    const fields = omitBy(
      {
        ...params,
        model,
        streaming,
        temperature: supportsSamplingParams ? (modelOptions?.temperature ?? 1) : undefined,
        maxTokens: modelOptions?.max_tokens,
        topP: supportsSamplingParams ? modelOptions?.top_p : undefined,
        frequencyPenalty: modelOptions?.frequency_penalty,
        presencePenalty: modelOptions?.presence_penalty,
        maxRetries: modelOptions?.maxRetries,
        useResponsesApi: true,
        reasoning: modelOptions?.reasoning_effort
          ? { effort: modelOptions.reasoning_effort }
          : undefined,
        streamUsage: streaming,
      },
      isNil
    )

    const chatModel = new ChatOpenAI({
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

    return responseFormat
      ? (chatModel.withConfig({ response_format: responseFormat }) as ChatOpenAI)
      : chatModel
  }
}
