import { AnthropicInput } from '@langchain/anthropic'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const Anthropic = 'anthropic'

export type AnthropicCredentials = {
  api_key: string
}

export type AnthropicModelCredentials = AnthropicCredentials &
  CommonChatModelParameters & {
    temperature?: number
    top_p?: number
    max_tokens?: number
  }

export function toCredentialKwargs(
  credentials: AnthropicCredentials,
  model?: string
): AnthropicInput {
  const modelName = model || 'claude-3-5-sonnet-20241022'
  return {
    anthropicApiKey: credentials.api_key,
    model: modelName, // Preferred property
    modelName: modelName // Deprecated but kept for compatibility
  }
}

