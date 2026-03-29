import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const Siliconflow = 'siliconflow'

export interface SiliconflowCredentials {
  api_key: string
  endpoint_url?: string
  base_url?: string
  use_international_endpoint?: string | boolean
}

export interface SiliconflowModelCredentials
  extends SiliconflowCredentials,
    CommonChatModelParameters {
  endpoint_model_name?: string
  mode?: 'completion' | 'chat'
  top_p?: number
  context_size: string
  max_tokens?: string
  max_tokens_to_sample?: string
  vision_support?: 'support' | 'no_support'
  voices?: string
  streaming?: boolean
  enable_thinking?: boolean
  thinking_budget?: string | number
  top_k?: string | number
  seed?: string | number
  repetition_penalty?: string | number
  response_format?: string
  function_calling_type?: 'no_call' | 'function_call' | 'tool_call'
}

function isTrue(value: string | boolean | undefined): boolean {
  return value === true || value === 'true'
}

export function getBaseUrlFromCredentials(credentials: SiliconflowCredentials): string {
  const baseUrl = credentials.endpoint_url || credentials.base_url
  if (baseUrl) {
    return baseUrl.replace(/\/$/, '')
  }

  return isTrue(credentials.use_international_endpoint)
    ? 'https://api.siliconflow.com/v1'
    : 'https://api.siliconflow.cn/v1'
}

export function toCredentialKwargs(
  credentials: SiliconflowModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key || 'no-key-required',
    model: credentials.endpoint_model_name || model,
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p
  } as OpenAIBaseInput

  const configuration: ClientOptions = {
    baseURL: getBaseUrlFromCredentials(credentials)
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
