import { BaseMessage, BaseMessageChunk, isAIMessage, isAIMessageChunk } from '@langchain/core/messages'
import { ChatOpenAIFields, ClientOptions, OpenAIClient } from '@langchain/openai'
import { z } from 'zod'
import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilotModel,
  ModelFeature,
  ModelPropertyKey,
  ParameterType,
  legacyModelFeatures
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types.js'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'
import { compatibleResponsesTransport, reasoningEffortSchema } from '../native.js'
import { CompatibleResponsesChatModel } from './responses.js'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function getTokenLimits(credentials: {
  context_size?: string | number
  context_length?: string | number
  max_tokens_to_sample?: string | number
}) {
  const positive = (value: string | number | undefined, fallback: number) => {
    const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    return Number.isSafeInteger(number) && number > 0 ? number : fallback
  }
  const contextLength = positive(credentials.context_size ?? credentials.context_length, 2048)
  const outputLimit = Math.min(positive(credentials.max_tokens_to_sample, contextLength), contextLength)
  return { contextLength, outputLimit }
}

export class StableOpenAICompatibleChatModel extends ChatOAICompatReasoningModel {
  private activeStreamResponseId: string | null = null

  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, unknown>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ): BaseMessageChunk {
    if (isPlaceholderChatCompletionId(rawResponse.id) && delta.role) {
      this.activeStreamResponseId = this.createResponseMessageId(rawResponse.id)
    }

    const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
    if (isAIMessageChunk(messageChunk)) {
      messageChunk._updateId(this.getResponseMessageId(rawResponse.id))
      if (this.isStreamFinished(rawResponse)) {
        this.activeStreamResponseId = null
      }
    }

    return messageChunk
  }

  protected override _convertCompletionsMessageToBaseMessage(
    message: OpenAIClient.ChatCompletionMessage,
    rawResponse: OpenAIClient.ChatCompletion
  ): BaseMessage {
    const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse)
    if (isAIMessage(langChainMessage)) {
      langChainMessage._updateId(
        isPlaceholderChatCompletionId(rawResponse.id) ? this.createResponseMessageId(rawResponse.id) : rawResponse.id
      )
    }

    return langChainMessage
  }

  private getResponseMessageId(responseId?: string | null) {
    if (!isPlaceholderChatCompletionId(responseId)) {
      return responseId
    }

    this.activeStreamResponseId ??= this.createResponseMessageId(responseId)
    return this.activeStreamResponseId
  }

  private createResponseMessageId(responseId?: string | null) {
    return `${responseId ?? 'chatcmpl'}-${randomUUID()}`
  }

  private isStreamFinished(rawResponse: OpenAIClient.ChatCompletionChunk) {
    return rawResponse.choices.some((choice) => choice.finish_reason != null)
  }
}

function isPlaceholderChatCompletionId(responseId?: string | null) {
  return responseId === 'chatcmpl'
}

@Injectable()
export class OAIAPICompatLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: OpenAICompatibleProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: OpenAICompatModelCredentials): Promise<void> {
    if (credentials.api_protocol === 'responses') {
      try {
        const response = await compatibleResponsesTransport(credentials)(
          { model, input: 'Reply OK.', stream: false, max_output_tokens: 32 }, {}, AbortSignal.timeout(60000)
        )
        if (!response.ok) {
          await response.body?.cancel()
          throw new Error(`Responses validation failed (${response.status})`)
        }
        z.object({ object: z.literal('response'), status: z.enum(['completed', 'incomplete']) }).parse(await response.json())
        return
      } catch (error) {
        throw new CredentialsValidateFailedError(getErrorMessage(error))
      }
    }
    const params = toCredentialKwargs(credentials, model, { includeCustomBodyParams: true })

    try {
      const chatModel = this.createChatModel({
        ...params,
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

  protected createChatModel(params: TOAIAPICompatLLMParams) {
    if (params.useResponsesApi) {
      const model = new CompatibleResponsesChatModel(params)
      // The SDK defaults temperature to 1 even when no sampling option was selected.
      model.temperature = params.temperature
      return model
    }
    return new StableOpenAICompatibleChatModel(params)
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions,
    credentials?: OpenAICompatModelCredentials
  ) {
    const { copilot } = copilotModel
    const { handleLLMTokens } = options ?? {}

    credentials ??= options?.modelProperties as OpenAICompatModelCredentials
    const native = credentials?.api_protocol === 'responses'
    const runtimeEnableThinking = native ? undefined : copilotModel.options?.['enable_thinking']
    const runtimeCredentials = {
      ...(credentials ?? {}),
      ...(runtimeEnableThinking !== undefined ? { enable_thinking: toBoolean(runtimeEnableThinking) } : {})
    } as OpenAICompatModelCredentials
    const params = toCredentialKwargs(runtimeCredentials, copilotModel.model, { includeCustomBodyParams: !native })
    if (runtimeEnableThinking !== undefined) {
      const enableThinking = toBoolean(runtimeEnableThinking)
      params.modelKwargs['enable_thinking'] = enableThinking
      params.modelKwargs['chat_template_kwargs'] ??= {}
      params.modelKwargs['chat_template_kwargs']['enable_thinking'] = enableThinking
    }
    const modelOptions = copilotModel.options ?? {}
    const effort = native
      ? reasoningEffortSchema.optional().parse(modelOptions['reasoning_effort'] ?? credentials.reasoning_effort)
      : undefined

    return this.createChatModel({
      ...params,
      ...(native ? {
        useResponsesApi: true,
        modelKwargs: { store: false, include: ['reasoning.encrypted_content'], ...(effort ? { reasoning: { effort } } : {}) }
      } : {}),
      streaming: modelOptions['streaming'] ?? this.canSteaming(params.model),
      // This provider's Responses schema omits sampling controls, including legacy saved values.
      temperature: native ? undefined : (modelOptions['temperature'] ?? 0),
      // Explicit assistant limits win; otherwise match the provider-backed schema default.
      maxTokens: modelOptions['max_tokens'] ?? getTokenLimits(runtimeCredentials).outputLimit,
      topP: native ? undefined : (modelOptions['top_p'] ?? params.topP),
      frequencyPenalty: native ? undefined : modelOptions['frequency_penalty'],
      presencePenalty: native ? undefined : modelOptions['presence_penalty'],
      maxRetries: modelOptions['maxRetries'] ?? runtimeCredentials.maxRetries,
      streamUsage: false,
      verbose: options?.verbose,
      callbacks: [...this.createHandleUsageCallbacks(copilot, params.model, runtimeCredentials, handleLLMTokens)]
    })
  }

  canSteaming(model: string) {
    return !model.startsWith('o1')
  }

  override getParameterRules(model: string, credentials: Record<string, string>) {
    const rules = super.getParameterRules(model, credentials)
    // LargeLanguageModel adds a common temperature default outside the model schema.
    return credentials?.api_protocol === 'responses' ? rules.filter((rule) => rule.name !== 'temperature') : rules
  }

  override getCustomizableModelSchemaFromCredentials(
    model: string,
    credentials: Record<string, any>
  ): AIModelEntity | null {
    const { contextLength, outputLimit } = getTokenLimits(credentials)
    if (credentials['api_protocol'] === 'responses') {
      const effort = reasoningEffortSchema.optional().parse(credentials['reasoning_effort'])
      return {
        model, label: { en_US: model, zh_Hans: model },
        model_type: AiModelTypeEnum.LLM, fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
        native_protocols: ['openai_responses'], features: legacyModelFeatures(credentials),
        model_properties: { [ModelPropertyKey.MODE]: 'chat', [ModelPropertyKey.CONTEXT_SIZE]: contextLength },
        parameter_rules: [
          { name: 'max_tokens', type: ParameterType.INT, min: 1, max: outputLimit,
            default: outputLimit, label: { en_US: 'Max output tokens', zh_Hans: '最大输出 Token' } },
          { name: 'reasoning_effort', type: ParameterType.STRING, required: false,
            options: reasoningEffortSchema.options, ...(effort ? { default: effort } : {}),
            label: { en_US: 'Reasoning effort', zh_Hans: '推理强度' } }
        ]
      }
    }
    const rules: any[] = [
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        use_template: 'temperature',
        label: {
          zh_Hans: '温度',
          en_US: 'Temperature'
        }
      },
      {
        name: 'top_p',
        type: ParameterType.FLOAT,
        use_template: 'top_p',
        label: {
          zh_Hans: 'Top P',
          en_US: 'Top P'
        }
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        use_template: 'max_tokens',
        min: 1,
        max: outputLimit,
        default: outputLimit,
        label: {
          zh_Hans: '最大生成长度',
          en_US: 'Max Tokens'
        }
      },
      {
        name: 'presence_penalty',
        use_template: 'presence_penalty',
        type: ParameterType.FLOAT,
        label: {
          en_US: 'Presence Penalty',
          zh_Hans: '存在惩罚'
        },
        required: false,
        help: {
          en_US:
            "Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.",
          zh_Hans:
            '介于 -2.0 和 2.0 之间的数字。正值会根据新词是否已出现在文本中对其进行惩罚，从而增加模型谈论新话题的可能性。'
        },
        default: 0.0,
        min: -2.0,
        max: 2.0,
        precision: 2
      },
      {
        name: 'frequency_penalty',
        use_template: 'frequency_penalty',
        type: ParameterType.FLOAT,
        label: {
          en_US: 'Frequency Penalty',
          zh_Hans: '频率惩罚'
        },
        required: false,
        help: {
          en_US:
            "Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.",
          zh_Hans:
            '介于 -2.0 和 2.0 之间的数字。正值会根据新词在文本中的现有频率对其进行惩罚，从而降低模型逐字重复相同内容的可能性。'
        },
        default: 0.0,
        min: -2.0,
        max: 2.0,
        precision: 2
      }
    ]

    let completionType = null
    if (credentials['completion_type']) {
      if (credentials['completion_type'] === 'chat') {
        completionType = 'chat'
      } else if (credentials['completion_type'] === 'completion') {
        completionType = 'completion'
      } else {
        throw new Error(`completion_type ${credentials['completion_type']} is not supported`)
      }
    } else {
      // Default to chat if not specified, as we cannot make async calls here
      completionType = 'chat'
    }

    const features: ModelFeature[] = legacyModelFeatures(credentials)
    const supportFunctionCall = credentials['support_function_call'] ?? false
    if (supportFunctionCall && !features.includes(ModelFeature.TOOL_CALL)) {
      features.push(ModelFeature.TOOL_CALL)
    }
    const supportVision = credentials['support_vision'] ?? false
    if (supportVision && !features.includes(ModelFeature.VISION)) {
      features.push(ModelFeature.VISION)
    }

    const agentThoughtSupport = credentials['agent_though_support'] ?? 'not_supported'
    if (agentThoughtSupport === 'supported') {
      if (!features.includes(ModelFeature.AGENT_THOUGHT)) {
        features.push(ModelFeature.AGENT_THOUGHT)
      }
    }

    const structuredOutputSupport = credentials['structured_output_support'] ?? 'not_supported'
    if (structuredOutputSupport === 'supported') {
      // try {
      //     entity.features.index(ModelFeature.STRUCTURED_OUTPUT)
      // } catch (ValueError) {
      //     entity.features.append(ModelFeature.STRUCTURED_OUTPUT)
      // }

      rules.push({
        name: 'response_format',
        label: {
          en_US: 'Response Format',
          zh_Hans: '回复格式'
        },
        help: {
          en_US: 'Specifying the format that the model must output.',
          zh_Hans: '指定模型必须输出的格式。'
        },
        type: ParameterType.STRING,
        options: ['text', 'json_object', 'json_schema'],
        required: false
      })
      rules.push({
        name: 'json_schema',
        use_template: 'json_schema'
      })
    }

    let label = {
      zh_Hans: model,
      en_US: model
    }

    if (credentials['display_name'] && credentials['display_name'] !== '') {
      label = {
        en_US: credentials['display_name'],
        zh_Hans: credentials['display_name']
      }
    }

    const defaultModelKwargs = toCredentialKwargs(credentials as OpenAICompatModelCredentials, model, {
      includeCustomBodyParams: true
    }).modelKwargs
    const defaultEnableThinking = defaultModelKwargs?.['enable_thinking']

    rules.push({
      name: 'enable_thinking',
      label: {
        en_US: 'Thinking mode',
        zh_Hans: '思考模式'
      },
      help: {
        en_US:
          'Whether to enable thinking mode, applicable to various thinking mode models deployed on reasoning frameworks such as vLLM and SGLang, for example Qwen3.',
        zh_Hans: '是否开启思考模式，适用于vLLM和SGLang等推理框架部署的多种思考模式模型，例如Qwen3。'
      },
      type: ParameterType.BOOLEAN,
      required: false,
      default: defaultEnableThinking === undefined ? false : toBoolean(defaultEnableThinking)
    })

    return {
      model,
      label,
      fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      model_type: AiModelTypeEnum.LLM,
      features: features,
      model_properties: {
        [ModelPropertyKey.MODE]: completionType,
        [ModelPropertyKey.CONTEXT_SIZE]: contextLength
      },
      parameter_rules: rules
    }
  }
}
