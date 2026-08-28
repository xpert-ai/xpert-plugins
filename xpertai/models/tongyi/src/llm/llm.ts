import { HumanMessage } from '@langchain/core/messages'
import { ClientOptions } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel, ParameterRule } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ChatOAICompatReasoningModel, LargeLanguageModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import {
  isTongyiInternationalEndpointEnabled,
  toCredentialKwargs,
  TongyiCredentials,
  TongyiModelCredentials
} from '../types.js'
import { TongyiProviderStrategy } from '../provider.strategy.js'

const TONGYI_EXPLICIT_CACHE_MODELS = new Set([
  'qwen3.8-max',
  'qwen3.7-max',
  'qwen3.6-max-preview',
  'qwen3-max-preview',
  'qwen3-max',
  'qwen3.7-plus',
  'qwen3.7-flash',
  'qwen3.6-plus',
  'qwen3.5-plus',
  'qwen3.5-plus-2026-04-20',
  'qwen-plus',
  'qwen-plus-latest',
  'qwen3.6-flash',
  'qwen3.5-flash',
  'qwen-flash',
  'qwen3-coder-plus',
  'qwen3-coder-flash',
  'qwen3-vl-plus',
  'qwen3-vl-flash',
  'qwen-vl-max',
  'qwen-vl-plus',
  'deepseek-v3.2',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'kimi-k2.6',
  'kimi-k2.5',
  'glm-5.1'
])
const TONGYI_CN_EXPLICIT_CACHE_PRICED_MODELS = new Set([
  'qwen3.8-max',
  'qwen3.7-max',
  'qwen3-max',
  'qwen3-max-preview',
  'qwen3.7-plus',
  'qwen3.7-flash',
  'qwen3.6-plus',
  'qwen3.5-plus',
  'qwen-plus',
  'qwen-plus-latest',
  'qwen3.6-flash',
  'qwen3.5-flash',
  'qwen-flash',
  'qwen3-coder-plus',
  'qwen3-vl-plus',
  'qwen3-vl-flash',
  'qwen-vl-max',
  'qwen-vl-plus',
  'deepseek-v3.2',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'kimi-k2.5',
  'glm-5.1'
])
const TONGYI_EXPLICIT_CACHE_CONTROL = { type: 'ephemeral' } as const
// Kimi K3 only accepts the provider defaults for sampling and reasoning controls.
const TONGYI_FIXED_SAMPLING_AND_REASONING_MODELS = new Set(['kimi-k3'])
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

export function getTongyiPricingContext(
  credentials: TongyiCredentials,
  modelCredentials?: TongyiModelCredentials
) {
  const endpointSelection = credentials.use_international_endpoint
  const region = credentials.api_host
    ? endpointSelection === true || endpointSelection === 'true'
      ? 'international'
      : endpointSelection === false || endpointSelection === 'false'
        ? 'cn'
        : undefined
    : isTongyiInternationalEndpointEnabled(credentials)
      ? 'international'
      : 'cn'

  return {
    mode: modelCredentials?.enable_thinking === true ? 'thinking' : 'standard',
    region
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

type TongyiPriceComponent = 'input' | 'output' | 'cache_read_input' | 'cache_write_input'

type TongyiPriceRule = {
  component: TongyiPriceComponent
  unit_price: number
  unit_size: number
  min_input_tokens?: number
  max_input_tokens?: number
  mode?: string
  region?: string
}

type TongyiTieredPrice = {
  input?: string | number
  output?: string | number
  max_tokens?: string | number
}

type TongyiPriceConfig = {
  input?: string | number
  output?: string | number
  unit?: string | number
  tiered_pricing?: TongyiTieredPrice[]
  rules?: TongyiPriceRule[]
  [key: string]: unknown
}

function normalizeTongyiUnitPrice(value: number) {
  return Number(value.toFixed(10))
}

function legacyChinaRules(pricing: TongyiPriceConfig, component: 'input' | 'output'): TongyiPriceRule[] {
  const unit = Number(pricing.unit)
  if (!Number.isFinite(unit) || unit <= 0) return []

  const tiers = pricing.tiered_pricing?.length
    ? pricing.tiered_pricing
    : [{ input: pricing.input, output: pricing.output }]
  let previousMax: number | undefined

  return tiers.flatMap((tier) => {
    const configuredPrice = Number(tier[component] ?? pricing[component])
    if (!Number.isFinite(configuredPrice)) return []
    const maxInputTokens = tier.max_tokens === undefined ? undefined : Number(tier.max_tokens)
    const rule: TongyiPriceRule = {
      component,
      unit_price: normalizeTongyiUnitPrice(configuredPrice * unit * 1_000_000),
      unit_size: 1_000_000,
      region: 'cn'
    }
    if (previousMax !== undefined) rule.min_input_tokens = previousMax + 1
    if (Number.isFinite(maxInputTokens)) {
      rule.max_input_tokens = maxInputTokens
      previousMax = maxInputTokens
    }
    return [rule]
  })
}

function withTongyiChinaExplicitCachePricing(pricing: TongyiPriceConfig): TongyiPriceConfig {
  const configuredRules = pricing.rules ?? []
  const inputRules = configuredRules.some((rule) => rule.component === 'input' && rule.region === 'cn')
    ? configuredRules.filter((rule) => rule.component === 'input' && rule.region === 'cn')
    : legacyChinaRules(pricing, 'input')
  const outputRules = configuredRules.some((rule) => rule.component === 'output' && rule.region === 'cn')
    ? []
    : legacyChinaRules(pricing, 'output')
  const missingStandardInputRules = configuredRules.some(
    (rule) => rule.component === 'input' && rule.region === 'cn'
  )
    ? []
    : inputRules
  const cacheReadRules = configuredRules.some(
    (rule) => rule.component === 'cache_read_input' && rule.region === 'cn'
  )
    ? []
    : inputRules.map((rule) => ({
        ...rule,
        component: 'cache_read_input' as const,
        unit_price: normalizeTongyiUnitPrice(rule.unit_price * 0.1)
      }))
  const cacheWriteRules = configuredRules.some(
    (rule) => rule.component === 'cache_write_input' && rule.region === 'cn'
  )
    ? []
    : inputRules.map((rule) => ({
        ...rule,
        component: 'cache_write_input' as const,
        unit_price: normalizeTongyiUnitPrice(rule.unit_price * 1.25)
      }))

  return {
    ...pricing,
    rules: [
      ...configuredRules,
      ...missingStandardInputRules,
      ...outputRules,
      ...cacheReadRules,
      ...cacheWriteRules
    ]
  }
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

  protected override _commonParameterRules(model: string): ParameterRule[] {
    const rules = super._commonParameterRules(model)
    if (!TONGYI_FIXED_SAMPLING_AND_REASONING_MODELS.has(model)) return rules
    return rules.filter((rule) => rule.name !== 'temperature')
  }

  override predefinedModels(): ReturnType<LargeLanguageModel['predefinedModels']> {
    const models = super.predefinedModels()
    this.modelSchemas = models.map((model) => {
      if (!TONGYI_CN_EXPLICIT_CACHE_PRICED_MODELS.has(model.model) || !model.pricing) return model
      return {
        ...model,
        pricing: withTongyiChinaExplicitCachePricing(
          model.pricing as unknown as TongyiPriceConfig
        ) as unknown as typeof model.pricing
      }
    })
    return this.modelSchemas
  }

  async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials)
    const chatModel = new ChatOAICompatReasoningModel({
      ...params,
      model,
      ...(TONGYI_FIXED_SAMPLING_AND_REASONING_MODELS.has(model) ? {} : { temperature: 0 }),
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
    const supportsSamplingAndReasoningOverrides =
      !TONGYI_FIXED_SAMPLING_AND_REASONING_MODELS.has(model)
    const fields = omitBy(
      {
        ...params,
        configuration,
        model,
        streaming: modelCredentials?.streaming ?? true,
        temperature: supportsSamplingAndReasoningOverrides
          ? modelCredentials?.temperature ?? 0
          : undefined,
        maxTokens: modelCredentials?.max_tokens,
        topP: supportsSamplingAndReasoningOverrides ? modelCredentials?.top_p : undefined,
        frequencyPenalty: supportsSamplingAndReasoningOverrides
          ? modelCredentials?.frequency_penalty
          : undefined,
        maxRetries: modelCredentials?.maxRetries,
        modelKwargs: omitBy(
          {
            enable_thinking: supportsSamplingAndReasoningOverrides
              ? modelCredentials?.enable_thinking
              : undefined,
            thinking_budget: supportsSamplingAndReasoningOverrides
              ? modelCredentials?.thinking_budget
              : undefined,
            reasoning_effort: supportsSamplingAndReasoningOverrides
              ? modelCredentials?.reasoning_effort
              : undefined,
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
        ...this.createHandleUsageCallbacks(
          copilot,
          model,
          credentials,
          handleLLMTokens,
          getTongyiPricingContext(credentials, modelCredentials)
        ),
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
