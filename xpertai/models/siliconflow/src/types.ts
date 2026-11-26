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
  frequency_penalty?: number
  context_size: string
  max_tokens?: string
  max_tokens_to_sample?: string
  vision_support?: 'support' | 'no_support'
  voices?: string
  streaming?: boolean
  enable_thinking?: boolean
  reasoning_effort?: 'low' | 'high' | 'max'
  thinking_budget?: string | number
  top_k?: string | number
  seed?: string | number
  repetition_penalty?: string | number
  response_format?: string
  json_schema?: string | Record<string, unknown>
  function_calling_type?: 'no_call' | 'function_call' | 'tool_call'
}

function isTrue(value: string | boolean | undefined): boolean {
  return value === true || value === 'true'
}

const disabledModelsByOrigin = new Map<string, ReadonlySet<string>>([
  ['https://api.siliconflow.cn', new Set([
    'Qwen/Qwen3.5-122B-A10B', 'stepfun-ai/Step-3.5-Flash', 'deepseek-ai/DeepSeek-V3.1',
  ])],
  ['https://api.siliconflow.com', new Set([
    'Qwen/Qwen2.5-32B-Instruct', 'Qwen/Qwen2.5-72B-Instruct-128K',
    'Qwen/Qwen2.5-14B-Instruct', 'Qwen/Qwen3-Reranker-4B',
  ])],
])

export function getBaseUrlFromCredentials(
  credentials: Pick<SiliconflowCredentials, 'endpoint_url' | 'base_url' | 'use_international_endpoint'>,
  model?: string
): string {
  const baseUrl = (credentials.endpoint_url || credentials.base_url ||
    (isTrue(credentials.use_international_endpoint) ? 'https://api.siliconflow.com/v1' : 'https://api.siliconflow.cn/v1')
  ).replace(/\/$/, '')
  if (model) {
    const { origin, hostname } = new URL(baseUrl)
    if (disabledModelsByOrigin.get(origin)?.has(model)) {
      throw new Error(`${model} has been retired on ${hostname}. Choose the other SiliconFlow endpoint or another model.`)
    }
  }
  return baseUrl
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
    baseURL: getBaseUrlFromCredentials(credentials, credentialsKwargs.model)
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
