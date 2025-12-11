import { ChatAnthropicInput } from '@langchain/anthropic'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const Anthropic = 'anthropic'

export interface AnthropicModelCredentials extends CommonChatModelParameters {
  api_key: string
  model?: string
  context_size: string
  max_tokens_to_sample: string
  vision_support?: 'support' | 'no_support'
  function_calling_type?: 'tool_call' | 'no_call'
  streaming?: boolean
  top_p?: number
  temperature?: number
}

export function toCredentialKwargs(
  credentials: AnthropicModelCredentials,
  model?: string
): ChatAnthropicInput {
  return {
    anthropicApiKey: credentials.api_key,
    modelName: credentials.model || model || 'claude-3-5-sonnet-20241022',
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p,
    maxTokens: credentials.max_tokens_to_sample
      ? parseInt(credentials.max_tokens_to_sample, 10)
      : undefined
  }
}

