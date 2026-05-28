import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const OpenAICompatible = 'openai-compatible'

export interface OpenAICompatModelCredentials extends CommonChatModelParameters {
  api_key: string
  endpoint_url?: string
  endpoint_model_name?: string
  mode: 'completion' | 'chat'
  top_p?: number
  context_size: string
  max_tokens_to_sample: string
  vision_support: 'support' | 'no_support'
  voices?: string
  streaming?: boolean
  enable_thinking?: boolean
  customBodyParams?: Record<string, string | number | boolean>
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

const ReservedCustomBodyParamKeys = new Set(['model', 'messages', 'stream'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function toCustomBodyParams(value: unknown): Record<string, string | number | boolean> {
  if (value == null) {
    return {}
  }

  if (!isPlainObject(value)) {
    throw new Error('Custom body params must be an object')
  }

  const params: Record<string, string | number | boolean> = {}
  for (const [rawKey, paramValue] of Object.entries(value)) {
    const key = rawKey.trim()
    if (!key) {
      throw new Error('Custom body param key must not be empty')
    }
    if (ReservedCustomBodyParamKeys.has(key)) {
      throw new Error(`Custom body param '${key}' is reserved`)
    }
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Custom body param '${key}' is duplicated`)
    }
    if (
      typeof paramValue !== 'string' &&
      typeof paramValue !== 'boolean' &&
      !(typeof paramValue === 'number' && Number.isFinite(paramValue))
    ) {
      throw new Error(`Custom body param '${key}' must be a string, finite number, or boolean`)
    }

    params[key] = paramValue
  }

  return params
}

export function toCredentialKwargs(
  credentials: OpenAICompatModelCredentials,
  model?: string,
  options?: { includeCustomBodyParams?: boolean }
): OpenAIBaseInput & { configuration: ClientOptions } {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key || 'no-key-required',
    model: credentials.endpoint_model_name || model,
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p
  } as OpenAIBaseInput
  const configuration: ClientOptions = {}

  if (credentials.endpoint_url) {
    const openaiApiBase = credentials.endpoint_url.replace(/\/$/, '')
    configuration.baseURL = openaiApiBase
  }

  const modelKwargs: Record<string, any> = {}
  if (credentials.enable_thinking != null) {
    const thinkingEnabled = toBoolean(credentials.enable_thinking)
    modelKwargs['enable_thinking'] = thinkingEnabled
    modelKwargs['chat_template_kwargs'] ??= {}
    modelKwargs['chat_template_kwargs']['enable_thinking'] = thinkingEnabled
  }
  if (options?.includeCustomBodyParams) {
    const customBodyParams = toCustomBodyParams(credentials.customBodyParams)
    Object.assign(modelKwargs, customBodyParams)
    if (Object.prototype.hasOwnProperty.call(customBodyParams, 'enable_thinking')) {
      modelKwargs['chat_template_kwargs'] ??= {}
      modelKwargs['chat_template_kwargs']['enable_thinking'] = toBoolean(customBodyParams['enable_thinking'])
    }
  }

  return {
    ...credentialsKwargs,
    modelKwargs,
    configuration
  }
}
