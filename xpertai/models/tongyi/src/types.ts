import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const Tongyi = 'tongyi'

export interface TongyiCredentials {
  dashscope_api_key: string
  use_international_endpoint?: string | boolean
}

export interface QWenModelCredentials extends CommonChatModelParameters {
  streaming?: boolean
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  enable_thinking?: boolean
  thinking_budget?: number
  enable_search?: boolean
}

export interface TongyiTextEmbeddingModelOptions {
  context_size: number
  max_chunks: number
}

function isTrue(value: string | boolean | undefined): boolean {
  return value === true || value === 'true'
}

export function getBaseUrlFromCredentials(credentials: TongyiCredentials): string {
  return isTrue(credentials.use_international_endpoint)
    ? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
    : 'https://dashscope.aliyuncs.com/compatible-mode/v1'
}

export function getDashscopeApiBase(credentials: TongyiCredentials): string {
  return isTrue(credentials.use_international_endpoint)
    ? 'https://dashscope-intl.aliyuncs.com/api/v1'
    : 'https://dashscope.aliyuncs.com/api/v1'
}

export function toCredentialKwargs(credentials: TongyiCredentials) {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.dashscope_api_key
  } as OpenAIBaseInput
  const configuration: ClientOptions = { baseURL: getBaseUrlFromCredentials(credentials) }

  return {
    ...credentialsKwargs,
    configuration
  }
}
