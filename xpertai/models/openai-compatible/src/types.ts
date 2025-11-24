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
}

export function toCredentialKwargs(
  credentials: OpenAICompatModelCredentials,
  model?: string
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

  const modelKwargs = {}
  if (credentials.enable_thinking != null) {
    modelKwargs['chat_template_kwargs'] ??= {}
    modelKwargs['chat_template_kwargs']['enable_thinking'] = !!credentials.enable_thinking
  }

  return {
    ...credentialsKwargs,
    modelKwargs,
    configuration
  }
}
