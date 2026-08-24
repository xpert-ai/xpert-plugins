import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = dirname(currentFilePath)
export const SvgIcon = readFileSync(join(currentDirectory, '_assets/openrouter_square.svg'), 'utf8')

export const OpenRouterAiBaseUrl = 'https://openrouter.ai/api/v1'
export const OpenRouterDefaultHeaders = {
  'HTTP-Referer': 'https://xpertai.cn/',
  'X-Title': 'XpertAI'
} as const

export type OpenRouterCredentials = {
  api_key: string
  endpoint_url?: string
}

export type OpenRouterReasoningEffort = 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'
export type OpenRouterResponseFormat = 'text' | 'json_object' | 'json_schema'
export type OpenRouterSupport = 'support' | 'no_support'

export type OpenRouterModelCredentials = {
  api_key?: string
  endpoint_url?: string
  mode?: 'completion' | 'chat'
  context_size?: string | number
  max_tokens_to_sample?: string | number
  vision_support?: OpenRouterSupport
  reasoning_support?: OpenRouterSupport
  structured_output_support?: OpenRouterSupport
  function_calling_type?: 'no_call' | 'tool_call'
  temperature?: number | string
  top_p?: number | string
  max_tokens?: number | string
  frequency_penalty?: number | string
  presence_penalty?: number | string
  reasoning_effort?: OpenRouterReasoningEffort
  reasoning_budget?: number | string
  enable_thinking?: boolean | string
  exclude_reasoning_tokens?: boolean | string
  verbosity?: 'low' | 'medium' | 'high'
  response_format?: OpenRouterResponseFormat
  json_schema?: string | Record<string, unknown>
  provider?: Record<string, unknown>
  display_name?: string
  streaming?: boolean
}

export function normalizeOpenRouterBaseUrl(endpointUrl?: string): string {
  if (!endpointUrl?.trim()) {
    return OpenRouterAiBaseUrl
  }

  const normalized = endpointUrl
    .trim()
    .replace(/[。｡．]+$/, '')
    .replace(/\/+$/, '')

  return normalized || OpenRouterAiBaseUrl
}

export function toCredentialKwargs(
  credentials: OpenRouterModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key,
    model
  } as OpenAIBaseInput
  const configuration: ClientOptions = {
    baseURL: normalizeOpenRouterBaseUrl(credentials.endpoint_url),
    defaultHeaders: {
      ...OpenRouterDefaultHeaders
    }
  }

  return {
    ...credentialsKwargs,
    configuration
  }
}
