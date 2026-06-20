import { HumanMessage } from '@langchain/core/messages'
import { ClientOptions } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ChatOAICompatReasoningModel, LargeLanguageModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { toCredentialKwargs, TongyiCredentials, TongyiModelCredentials } from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'

const TONGYI_EXPLICIT_CACHE_MODELS = new Set([
  'qwen3.6-max-preview',
  'qwen3-max-preview',
  'qwen3-max',
  'qwen3.6-plus',
  'qwen3.5-plus',
  'qwen3.5-plus-2026-04-20',
  'qwen-plus',
  'qwen3.6-flash',
  'qwen3.5-flash',
  'qwen-flash',
  'qwen3-coder-plus',
  'qwen3-coder-flash',
  'qwen3-vl-plus',
  'qwen3-vl-flash',
  'deepseek-v3.2',
  'kimi-k2.6',
  'kimi-k2.5',
  'glm-5.1'
])
const TONGYI_EXPLICIT_CACHE_CONTROL = { type: 'ephemeral' } as const
const TONGYI_EXTRA_HEADER_RESERVED_NAMES = new Set([
  'authorization',
  'content-type',
  'content-length',
  'host'
])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function parseTongyiExtraHeaders(value: unknown): Record<string, string> {
  if (value == null || value === '') {
    return {}
  }

  if (typeof value === 'string' && value.trim() === '') {
    return {}
  }

  const parsed = typeof value === 'string'
    ? JSON.parse(value.replace(/\u00a0/g, ' ').replace(/\u3000/g, ' '))
    : value

  if (!isPlainObject(parsed)) {
    throw new Error('Extra headers must be a JSON object')
  }

  const headers: Record<string, string> = {}
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const key = rawKey.trim()
    if (!key) {
      throw new Error('Extra header key must not be empty')
    }
    if (TONGYI_EXTRA_HEADER_RESERVED_NAMES.has(key.toLowerCase())) {
      throw new Error(`Extra header '${rawKey}' is reserved`)
    }
    if (
      typeof rawValue !== 'string' &&
      typeof rawValue !== 'number' &&
      typeof rawValue !== 'boolean'
    ) {
      throw new Error(`Extra header '${rawKey}' must be a string, number, or boolean`)
    }

    headers[key] = String(rawValue)
  }

  return headers
}

export function toTongyiConfigurationWithExtraHeaders(
  configuration: ClientOptions,
  extraHeaders: unknown
): ClientOptions {
  const parsedExtraHeaders = parseTongyiExtraHeaders(extraHeaders)
  if (Object.keys(parsedExtraHeaders).length === 0) {
    return configuration
  }

  return {
    ...configuration,
    defaultHeaders: {
      ...(isPlainObject(configuration.defaultHeaders) ? configuration.defaultHeaders : {}),
      ...parsedExtraHeaders
    }
  }
}

type TongyiContentPart = {
  type?: unknown
  text?: unknown
  cache_control?: unknown
  cacheControl?: unknown
}

type TongyiMessageContent = string | TongyiContentPart[] | null | undefined

type TongyiChatCompletionMessage = {
  role?: string
  content?: TongyiMessageContent
}

type TongyiChatCompletionRequest = {
  model?: string
  messages?: TongyiChatCompletionMessage[]
}

type TongyiCacheFields = {
  model?: string
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object'
}

function withTongyiCacheControlContent(content: TongyiMessageContent):
  | { changed: true; content: TongyiContentPart[] }
  | { changed: false; content: TongyiMessageContent } {
  if (typeof content === 'string') {
    if (!content) {
      return { changed: false, content }
    }

    return {
      changed: true,
      content: [
        {
          type: 'text',
          text: content,
          cache_control: { ...TONGYI_EXPLICIT_CACHE_CONTROL }
        }
      ]
    }
  }

  if (!Array.isArray(content)) {
    return { changed: false, content }
  }

  if (content.some((part) => isObject(part) && (hasOwn(part, 'cache_control') || hasOwn(part, 'cacheControl')))) {
    return { changed: false, content }
  }

  for (let index = content.length - 1; index >= 0; index--) {
    const part = content[index]
    if (isObject(part) && part.type === 'text' && typeof part.text === 'string' && part.text.length > 0) {
      const nextContent = content.slice()
      nextContent[index] = {
        ...part,
        cache_control: { ...TONGYI_EXPLICIT_CACHE_CONTROL }
      }

      return { changed: true, content: nextContent }
    }
  }

  return { changed: false, content }
}

export function applyTongyiExplicitCache<TRequest extends TongyiChatCompletionRequest>(
  request: TRequest,
  fields?: TongyiCacheFields
): TRequest {
  const model = request?.model ?? fields?.model
  if (
    !model ||
    !TONGYI_EXPLICIT_CACHE_MODELS.has(model) ||
    !Array.isArray(request?.messages)
  ) {
    return request
  }

  const targetIndex = request.messages.findIndex((message) => message?.role === 'system')
  if (targetIndex < 0) {
    return request
  }

  const targetMessage = request.messages[targetIndex]
  const cacheableContent = withTongyiCacheControlContent(targetMessage?.content)
  if (!cacheableContent.changed) {
    return request
  }

  const messages = request.messages.slice()
  messages[targetIndex] = {
    ...targetMessage,
    content: cacheableContent.content
  }

  return {
    ...request,
    messages
  }
}

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
    const configuration = toTongyiConfigurationWithExtraHeaders(params.configuration, modelCredentials?.extra_headers)

    const model = copilotModel.model
    const fields = omitBy(
      {
        ...params,
        configuration,
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
            tool_stream: modelCredentials?.tool_stream,
            enable_search: modelCredentials?.enable_search,
            response_format: modelCredentials?.response_format
              ? { type: modelCredentials.response_format }
              : undefined
          },
          isNil
        ),
        streamUsage: true
      },
      isNil
    )

    const chatModel = new ChatOAICompatReasoningModel({
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

    const originalCompletionWithRetry = chatModel.completionWithRetry.bind(chatModel)

    chatModel.completionWithRetry = (async (request, requestOptions) => {
      const requestWithExplicitCache = applyTongyiExplicitCache(request, { model })
      return originalCompletionWithRetry(requestWithExplicitCache, requestOptions)
    }) as typeof chatModel.completionWithRetry

    return chatModel
  }
}
