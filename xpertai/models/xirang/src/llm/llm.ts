import { BaseMessage, BaseMessageChunk, isAIMessage, isAIMessageChunk } from '@langchain/core/messages'
import type { OpenAIClient } from '@langchain/openai'
import {
  AiModelTypeEnum,
  FetchFrom,
  type AIModelEntity,
  type ICopilotModel,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  type TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { XirangProviderStrategy } from '../provider.strategy.js'
import {
  resolveXirangModelLimits,
  isOfficialXirangEndpoint,
  toCredentialKwargs,
  type XirangModelCredentials,
  type XirangPredefinedModelConfig
} from '../types.js'

class XirangChatModel extends ChatOAICompatReasoningModel {
  private activeStreamResponseId: string | null = null

  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, unknown>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ): BaseMessageChunk {
    if (rawResponse.id === 'chatcmpl' && delta.role) this.activeStreamResponseId = `${rawResponse.id}-${randomUUID()}`
    const chunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
    if (isAIMessageChunk(chunk)) {
      chunk._updateId(this.responseId(rawResponse.id))
      if (rawResponse.choices.some((choice) => choice.finish_reason != null)) this.activeStreamResponseId = null
    }
    return chunk
  }

  protected override _convertCompletionsMessageToBaseMessage(
    message: OpenAIClient.ChatCompletionMessage,
    rawResponse: OpenAIClient.ChatCompletion
  ): BaseMessage {
    const converted = super._convertCompletionsMessageToBaseMessage(message, rawResponse)
    if (isAIMessage(converted))
      converted._updateId(rawResponse.id === 'chatcmpl' ? `chatcmpl-${randomUUID()}` : rawResponse.id)
    return converted
  }

  private responseId(id?: string | null) {
    if (id !== 'chatcmpl') return id
    this.activeStreamResponseId ??= `chatcmpl-${randomUUID()}`
    return this.activeStreamResponseId
  }
}

@Injectable()
export class XirangLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    try {
      const modelConfig = this.getModelSchema(model)?.modelConfig as XirangPredefinedModelConfig | undefined
      const params = toCredentialKwargs(credentials, model, modelConfig)
      await new XirangChatModel({ ...params, temperature: 0, maxTokens: 2 }).invoke([{ role: 'human', content: 'Hi' }])
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error))
    }
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions,
    credentials?: XirangModelCredentials
  ) {
    const copilot = copilotModel.copilot
    credentials ??= {
      ...(copilot?.modelProvider?.credentials ?? {}),
      ...(options?.modelProperties ?? {})
    } as XirangModelCredentials
    const modelConfig = this.getModelSchema(copilotModel.model)?.modelConfig as XirangPredefinedModelConfig | undefined
    const params = toCredentialKwargs(credentials, copilotModel.model, modelConfig)
    const modelOptions = copilotModel.options ?? {}
    const runtimeThinking = modelOptions.enable_thinking
    if (runtimeThinking !== undefined) {
      const enabled =
        runtimeThinking === true || runtimeThinking === 'true' || runtimeThinking === 1 || runtimeThinking === '1'
      params.modelKwargs.enable_thinking = enabled
      params.modelKwargs.chat_template_kwargs = { enable_thinking: enabled }
    }
    if (typeof modelOptions.response_format === 'string' && modelOptions.response_format.trim()) {
      params.modelKwargs.response_format = { type: modelOptions.response_format.trim() }
    }
    const usageModel = isOfficialXirangEndpoint(credentials) ? copilotModel.model : params.model

    return new XirangChatModel({
      ...params,
      streaming: modelOptions.streaming ?? true,
      temperature: modelOptions.temperature ?? 0.2,
      maxTokens: modelOptions.max_tokens,
      topP: modelOptions.top_p,
      frequencyPenalty: modelOptions.frequency_penalty,
      presencePenalty: modelOptions.presence_penalty,
      maxRetries: modelOptions.maxRetries,
      // Usage chunks are required for authoritative Xirang billing.
      streamUsage: true,
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, usageModel, credentials, options?.handleLLMTokens)
      ]
    })
  }

  override getCustomizableModelSchemaFromCredentials(
    model: string,
    credentials: Record<string, unknown>
  ): AIModelEntity | null {
    const { contextSize, maxOutputTokens } = resolveXirangModelLimits(credentials)
    return {
      model,
      label: { zh_Hans: String(credentials.display_name || model), en_US: String(credentials.display_name || model) },
      model_type: AiModelTypeEnum.LLM,
      fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      features: [ModelFeature.TOOL_CALL, ModelFeature.MULTI_TOOL_CALL, ModelFeature.STREAM_TOOL_CALL],
      model_properties: { [ModelPropertyKey.MODE]: 'chat', [ModelPropertyKey.CONTEXT_SIZE]: contextSize },
      parameter_rules: [
        {
          name: 'temperature',
          type: ParameterType.FLOAT,
          useTemplate: 'temperature',
          label: { zh_Hans: '温度', en_US: 'Temperature' },
          default: 0.2,
          min: 0,
          max: 2
        },
        {
          name: 'top_p',
          type: ParameterType.FLOAT,
          useTemplate: 'top_p',
          label: { zh_Hans: 'Top P', en_US: 'Top P' },
          default: 1,
          min: 0,
          max: 1
        },
        {
          name: 'max_tokens',
          type: ParameterType.INT,
          useTemplate: 'max_tokens',
          label: { zh_Hans: '最大输出 Token', en_US: 'Max output tokens' },
          default: Math.min(2048, maxOutputTokens),
          min: 1,
          max: maxOutputTokens
        },
        {
          name: 'enable_thinking',
          type: ParameterType.BOOLEAN,
          label: { zh_Hans: '思考模式', en_US: 'Thinking mode' },
          default: false,
          required: false
        }
      ]
    }
  }
}
