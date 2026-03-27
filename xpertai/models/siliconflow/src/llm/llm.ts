import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ChatOpenAIFields, ClientOptions, OpenAIClient } from '@langchain/openai'
import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilotModel,
  ModelFeature,
  ModelPropertyKey,
  ParameterType,
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { SiliconflowModelCredentials, toCredentialKwargs } from '../types.js'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true'
}

function toFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : undefined
}

function sanitizeUsageMetadata(
  usage:
    | undefined
    | {
        input_tokens?: unknown
        output_tokens?: unknown
        total_tokens?: unknown
        input_token_details?: Record<string, unknown>
        output_token_details?: Record<string, unknown>
      }
) {
  if (!usage || typeof usage !== 'object') {
    return undefined
  }

  const inputTokens = toFiniteNumber(usage.input_tokens)
  const outputTokens = toFiniteNumber(usage.output_tokens)
  const totalTokens = toFiniteNumber(usage.total_tokens)

  const inputDetails = usage.input_token_details
  const outputDetails = usage.output_token_details
  const sanitizedInputDetails: Record<string, number> = {}
  const sanitizedOutputDetails: Record<string, number> = {}

  if (inputDetails && typeof inputDetails === 'object') {
    for (const [key, value] of Object.entries(inputDetails)) {
      const num = toFiniteNumber(value)
      if (num !== undefined) {
        sanitizedInputDetails[key] = num
      }
    }
  }
  if (outputDetails && typeof outputDetails === 'object') {
    for (const [key, value] of Object.entries(outputDetails)) {
      const num = toFiniteNumber(value)
      if (num !== undefined) {
        sanitizedOutputDetails[key] = num
      }
    }
  }

  const result: Record<string, unknown> = {}
  if (inputTokens !== undefined) {
    result.input_tokens = inputTokens
  }
  if (outputTokens !== undefined) {
    result.output_tokens = outputTokens
  }
  if (totalTokens !== undefined) {
    result.total_tokens = totalTokens
  }
  if (Object.keys(sanitizedInputDetails).length) {
    result.input_token_details = sanitizedInputDetails
  }
  if (Object.keys(sanitizedOutputDetails).length) {
    result.output_token_details = sanitizedOutputDetails
  }

  return Object.keys(result).length ? result : undefined
}

function normalizeReasoningContent(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object' && value && typeof (value as { then?: unknown }).then === 'function') {
    return undefined
  }
  try {
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  } catch {
    return String(value)
  }
}

function sanitizeTokenCounters(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  let hasValue = false

  for (const [key, rawValue] of Object.entries(source)) {
    if (
      key === 'prompt_tokens' ||
      key === 'completion_tokens' ||
      key === 'total_tokens' ||
      key === 'reasoning_tokens' ||
      key === 'input_tokens' ||
      key === 'output_tokens' ||
      key === 'promptTokens' ||
      key === 'completionTokens' ||
      key === 'totalTokens'
    ) {
      const normalized = toFiniteNumber(rawValue)
      if (normalized !== undefined) {
        result[key] = normalized
        hasValue = true
      }
      continue
    }

    if (rawValue !== undefined) {
      result[key] = rawValue
      hasValue = true
    }
  }

  return hasValue ? result : undefined
}

function sanitizeResponseMetadata(
  metadata: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  const sanitized: Record<string, unknown> = { ...metadata }
  const tokenUsage = sanitizeTokenCounters(sanitized['tokenUsage'])
  if (tokenUsage) {
    sanitized['tokenUsage'] = tokenUsage
  } else {
    delete sanitized['tokenUsage']
  }

  const usage = sanitizeTokenCounters(sanitized['usage'])
  if (usage) {
    sanitized['usage'] = usage
  } else {
    delete sanitized['usage']
  }

  return sanitized
}

function extractReasoningFromContent(content: string): { reasoning: string | null; finalContent: string } {
  const tagIndex = content.indexOf('</think>')
  if (tagIndex === -1) {
    return { reasoning: null, finalContent: content }
  }

  const reasoning = content.slice(0, tagIndex).trim()
  const finalContent = content.slice(tagIndex + '</think>'.length).trim()
  return { reasoning, finalContent }
}

class SiliconflowChatOAICompatReasoningModel extends ChatOAICompatReasoningModel {
  private accumulatedReasoning = ''
  private finalReasoningContent: string | null = null
  private inReasoningMode = false
  private reasoningComplete = false
  private sawDirectReasoning = false
  private thinkingEnabled: boolean

  constructor(fields: TOAIAPICompatLLMParams & { modelKwargs?: Record<string, any> }) {
    super(fields)
    const modelKwargs = fields.modelKwargs ?? {}
    const chatTemplateKwargs = modelKwargs.chat_template_kwargs ?? {}
    this.thinkingEnabled = toBoolean(chatTemplateKwargs.enable_thinking ?? modelKwargs.enable_thinking)
    this.resetReasoningState()
  }

  setThinkingEnabled(value: boolean) {
    this.thinkingEnabled = value
    this.resetReasoningState()
  }

  override async _generate(
    messages: Parameters<ChatOAICompatReasoningModel['_generate']>[0],
    options?: Parameters<ChatOAICompatReasoningModel['_generate']>[1],
    runManager?: Parameters<ChatOAICompatReasoningModel['_generate']>[2]
  ) {
    this.resetReasoningState()
    const result = await super._generate(messages, options, runManager)

    for (const generation of result.generations) {
      const message = generation.message as AIMessage | undefined
      if (!message) {
        continue
      }
      message.usage_metadata = sanitizeUsageMetadata(
        message.usage_metadata as Record<string, unknown> | undefined
      ) as AIMessage['usage_metadata']
    }

    return result
  }

  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, any>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ): AIMessageChunk {
    const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)

    if (!messageChunk.additional_kwargs) {
      messageChunk.additional_kwargs = {}
    }

    const chunkWithUsage = messageChunk as AIMessageChunk & {
      usage_metadata?: Record<string, unknown>
      response_metadata?: Record<string, unknown>
    }
    chunkWithUsage.usage_metadata = sanitizeUsageMetadata(chunkWithUsage.usage_metadata) as
      | AIMessageChunk['usage_metadata']
      | undefined
    chunkWithUsage.response_metadata = sanitizeResponseMetadata(chunkWithUsage.response_metadata)

    const directReasoning = normalizeReasoningContent(delta['reasoning_content'])
    if (directReasoning !== undefined) {
      if (this.thinkingEnabled) {
        messageChunk.additional_kwargs['reasoning_content'] = directReasoning
        if (directReasoning) {
          this.accumulatedReasoning += directReasoning
          this.sawDirectReasoning = true
        }
      } else {
        delete messageChunk.additional_kwargs['reasoning_content']
      }
      return messageChunk
    }

    const content = typeof messageChunk.content === 'string' ? messageChunk.content : ''
    if (!content) {
      return messageChunk
    }

    if (!this.thinkingEnabled) {
      if (content.includes('</think>')) {
        const [, finalPart = ''] = content.split('</think>')
        messageChunk.content = finalPart
      } else if (content.includes('<think>')) {
        messageChunk.content = ''
      }
      delete messageChunk.additional_kwargs['reasoning_content']
      return messageChunk
    }

    if (this.inReasoningMode && this.sawDirectReasoning) {
      this.finalReasoningContent = this.accumulatedReasoning || this.finalReasoningContent
      this.reasoningComplete = true
      this.inReasoningMode = false
      if (this.finalReasoningContent && !messageChunk.additional_kwargs['reasoning_content']) {
        messageChunk.additional_kwargs['reasoning_content'] = this.finalReasoningContent
      }
      return messageChunk
    }

    if (
      this.inReasoningMode &&
      !this.sawDirectReasoning &&
      !this.accumulatedReasoning &&
      !content.includes('<think>') &&
      !content.includes('</think>')
    ) {
      this.reasoningComplete = true
      this.inReasoningMode = false
      return messageChunk
    }

    if (content.includes('</think>')) {
      const [reasoningPart, finalPart = ''] = content.split('</think>')
      if (reasoningPart) {
        this.accumulatedReasoning += reasoningPart
      }
      this.finalReasoningContent = this.accumulatedReasoning || null
      this.reasoningComplete = true
      this.inReasoningMode = false

      if (this.finalReasoningContent) {
        messageChunk.additional_kwargs['reasoning_content'] = this.finalReasoningContent
      }
      messageChunk.content = finalPart
      this.accumulatedReasoning = ''
      return messageChunk
    }

    if (this.reasoningComplete) {
      if (this.finalReasoningContent && !messageChunk.additional_kwargs['reasoning_content']) {
        messageChunk.additional_kwargs['reasoning_content'] = this.finalReasoningContent
      }
      return messageChunk
    }

    if (this.inReasoningMode) {
      const reasoning = normalizeReasoningContent(content)
      if (reasoning) {
        messageChunk.additional_kwargs['reasoning_content'] = reasoning
        this.accumulatedReasoning += content
      }
      messageChunk.content = ''
      return messageChunk
    }

    return messageChunk
  }

  protected override _convertCompletionsMessageToBaseMessage(
    message: OpenAIClient.ChatCompletionMessage,
    rawResponse: OpenAIClient.ChatCompletion
  ): AIMessage {
    const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse)

    if (!langChainMessage.additional_kwargs) {
      langChainMessage.additional_kwargs = {}
    }

    const directReasoning = normalizeReasoningContent((message as any).reasoning_content)
    if (directReasoning !== undefined) {
      if (this.thinkingEnabled) {
        langChainMessage.additional_kwargs['reasoning_content'] = directReasoning
      } else {
        delete langChainMessage.additional_kwargs['reasoning_content']
      }
      return langChainMessage
    }

    if (typeof langChainMessage.content !== 'string') {
      return langChainMessage
    }

    const { reasoning, finalContent } = extractReasoningFromContent(langChainMessage.content)
    if (reasoning) {
      if (this.thinkingEnabled) {
        langChainMessage.additional_kwargs['reasoning_content'] = reasoning
      }
      langChainMessage.content = finalContent
    }
    return langChainMessage
  }

  private resetReasoningState() {
    this.accumulatedReasoning = ''
    this.finalReasoningContent = null
    this.reasoningComplete = false
    this.inReasoningMode = this.thinkingEnabled
    this.sawDirectReasoning = false
  }
}

@Injectable()
export class SiliconflowLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: SiliconflowModelCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials, model)
    const modelKwargs = { ...(params.modelKwargs ?? {}) } as Record<string, any>
    if (!this.supportsEnableThinkingParam(params.model)) {
      delete modelKwargs['enable_thinking']
      if (modelKwargs['chat_template_kwargs']) {
        const chatTemplateKwargs = { ...(modelKwargs['chat_template_kwargs'] as Record<string, any>) }
        delete chatTemplateKwargs['enable_thinking']
        if (Object.keys(chatTemplateKwargs).length) {
          modelKwargs['chat_template_kwargs'] = chatTemplateKwargs
        } else {
          delete modelKwargs['chat_template_kwargs']
        }
      }
    }

    try {
      const chatModel = new SiliconflowChatOAICompatReasoningModel({
        ...params,
        modelKwargs,
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

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions,
    credentials?: SiliconflowModelCredentials
  ) {
    const { copilot } = copilotModel
    const { handleLLMTokens } = options ?? {}

    credentials ??= mergeCredentials(
      copilot.modelProvider.credentials,
      options?.modelProperties
    ) as SiliconflowModelCredentials
    const params = toCredentialKwargs(credentials, copilotModel.model)
    const maxTokens =
      copilotModel.options?.['max_tokens'] ??
      credentials.max_tokens ??
      credentials.max_tokens_to_sample
    const defaultThinkingEnabled = this.isThinkingModel(params.model)
    const runtimeThinking =
      copilotModel.options?.['enable_thinking'] ?? credentials.enable_thinking ?? defaultThinkingEnabled
    const runtimeThinkingEnabled = toBoolean(runtimeThinking)
    const runtimeThinkingBudget =
      copilotModel.options?.['thinking_budget'] ?? credentials.thinking_budget
    const supportsThinkingToggle = this.supportsEnableThinkingParam(params.model)

    const modelKwargs = {
      ...(params.modelKwargs ?? {}),
      top_k: toFiniteNumber(copilotModel.options?.['top_k'] ?? credentials.top_k),
      seed: toFiniteNumber(copilotModel.options?.['seed'] ?? credentials.seed),
      repetition_penalty: toFiniteNumber(
        copilotModel.options?.['repetition_penalty'] ?? credentials.repetition_penalty
      ),
      response_format: copilotModel.options?.['response_format'] ?? credentials.response_format,
    } as Record<string, any>

    if (supportsThinkingToggle) {
      modelKwargs['enable_thinking'] = runtimeThinkingEnabled
      modelKwargs['thinking_budget'] = toFiniteNumber(runtimeThinkingBudget)
    } else {
      delete modelKwargs['enable_thinking']
      delete modelKwargs['thinking_budget']
    }

    if (params.modelKwargs?.['chat_template_kwargs'] || supportsThinkingToggle) {
      modelKwargs['chat_template_kwargs'] = {
        ...(params.modelKwargs?.['chat_template_kwargs'] ?? {}),
        ...(supportsThinkingToggle ? { enable_thinking: runtimeThinkingEnabled } : {}),
      }
      if (!supportsThinkingToggle) {
        delete modelKwargs['chat_template_kwargs']['enable_thinking']
      }
      if (!Object.keys(modelKwargs['chat_template_kwargs']).length) {
        delete modelKwargs['chat_template_kwargs']
      }
    }

    const sanitizedModelKwargs = omitBy(modelKwargs, isNil) as Record<string, any>

    const chatModel = new SiliconflowChatOAICompatReasoningModel({
      ...params,
      modelKwargs: sanitizedModelKwargs,
      streaming: copilotModel.options?.['streaming'] ?? this.canStreaming(params.model),
      temperature: copilotModel.options?.['temperature'] ?? credentials.temperature ?? 0,
      topP: copilotModel.options?.['top_p'] ?? credentials.top_p,
      maxTokens,
      streamUsage: false,
      verbose: options?.verbose,
      callbacks: [...this.createHandleUsageCallbacks(copilot, params.model, credentials, handleLLMTokens)],
    })
    chatModel.setThinkingEnabled(runtimeThinkingEnabled)
    return chatModel
  }

  canStreaming(model: string) {
    return !model.startsWith('o1')
  }

  override getCustomizableModelSchemaFromCredentials(
    model: string,
    credentials: Record<string, any>
  ): AIModelEntity | null {
    const contextLength = Number(credentials['context_size'] ?? credentials['context_length'] ?? 2048)
    const completionType = credentials['mode'] ?? credentials['completion_type'] ?? 'chat'

    const rules: any[] = [
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        use_template: 'temperature',
        label: {
          zh_Hans: '温度',
          en_US: 'Temperature',
        },
      },
      {
        name: 'top_p',
        type: ParameterType.FLOAT,
        use_template: 'top_p',
        label: {
          zh_Hans: 'Top P',
          en_US: 'Top P',
        },
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        use_template: 'max_tokens',
        min: 1,
        max: contextLength,
        default: 512,
        label: {
          zh_Hans: '最大生成长度',
          en_US: 'Max Tokens',
        },
      },
    ]

    const features: ModelFeature[] = []
    if (credentials['function_calling_type'] && credentials['function_calling_type'] !== 'no_call') {
      features.push(ModelFeature.TOOL_CALL)
    }
    if (credentials['vision_support'] === 'support') {
      features.push(ModelFeature.VISION)
    }

    rules.push({
      name: 'enable_thinking',
      label: {
        en_US: 'Thinking mode',
        zh_Hans: '思考模式',
      },
      type: ParameterType.BOOLEAN,
      required: false,
    })

    return {
      model,
      label: {
        zh_Hans: credentials['display_name'] || model,
        en_US: credentials['display_name'] || model,
      },
      fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      model_type: AiModelTypeEnum.LLM,
      features,
      model_properties: {
        [ModelPropertyKey.MODE]: completionType,
        [ModelPropertyKey.CONTEXT_SIZE]: contextLength,
      },
      parameter_rules: rules,
    }
  }

  private supportsEnableThinkingParam(model?: string): boolean {
    const normalized = (model ?? '').toLowerCase()
    if (!normalized) {
      return false
    }

    return (
      normalized.includes('qwen/qwen3') ||
      normalized.includes('qwen3-') ||
      normalized.includes('glm-4.1v-9b-thinking')
    )
  }

  private isThinkingModel(model?: string): boolean {
    return (model ?? '').toLowerCase().includes('-thinking')
  }
}
