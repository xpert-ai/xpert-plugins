import { AnthropicInput } from '@langchain/anthropic'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const Anthropic = 'anthropic'

export type AnthropicClientOptions = NonNullable<AnthropicInput['clientOptions']>

export type AnthropicCredentials = {
  anthropic_api_key: string
  anthropic_api_url?: string
}

export type AnthropicModelCredentials = AnthropicCredentials &
  CommonChatModelParameters & {
    thinking?: boolean
    thinking_budget?: number
    temperature?: number
    top_k?: number
    top_p?: number
    max_tokens?: number
    context_1m?: boolean
    prompt_caching_message_flow?: number
    prompt_caching_system_message?: boolean
    prompt_caching_images?: boolean
    prompt_caching_documents?: boolean
    prompt_caching_tool_definitions?: boolean
    prompt_caching_tool_results?: boolean
  }

export function normalizeAnthropicBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl?.trim()) {
    return undefined
  }

  return baseUrl.trim().replace(/\/+$/, '')
}

export function mergeAnthropicClientOptions(
  base?: AnthropicClientOptions,
  override?: AnthropicClientOptions
): AnthropicClientOptions | undefined {
  if (!base && !override) {
    return undefined
  }

  const merged = {
    ...(base ?? {}),
    ...(override ?? {})
  } satisfies AnthropicClientOptions

  const defaultHeaders = {
    ...(base?.defaultHeaders ?? {}),
    ...(override?.defaultHeaders ?? {})
  }

  if (Object.keys(defaultHeaders).length > 0) {
    merged.defaultHeaders = defaultHeaders
  }

  return merged
}

export function toCredentialKwargs(
  credentials: AnthropicCredentials,
  model?: string,
  clientOptions?: AnthropicClientOptions
): AnthropicInput {
  const modelName = model || 'claude-sonnet-4-6'
  const anthropicApiUrl = normalizeAnthropicBaseUrl(credentials.anthropic_api_url)
  const mergedClientOptions = mergeAnthropicClientOptions(
    anthropicApiUrl
      ? {
          baseURL: anthropicApiUrl
        }
      : undefined,
    clientOptions
  )
  const config: AnthropicInput = {
    anthropicApiKey: credentials.anthropic_api_key,
    anthropicApiUrl,
    model: modelName, // Preferred property
    modelName: modelName // Deprecated but kept for compatibility
  }

  if (mergedClientOptions) {
    config.clientOptions = mergedClientOptions
  }

  return config
}
