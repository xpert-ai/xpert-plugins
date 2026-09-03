import type { ClientOptions, OpenAIBaseInput } from '@langchain/openai'

export const Xirang = 'xirang'
export const XirangDefaultBaseUrl = 'https://ai.ctaigw.cn/v1'

export type XirangCredentials = {
  app_key: string
  endpoint_url?: string
}

export type XirangModelCredentials = XirangCredentials & {
  endpoint_model_name?: string
  /** Optional Rerank-specific API key. Falls back to the provider AppKey. */
  rerank_api_key?: string
  /** Rerank path relative to endpoint_url, for example /rerank or /reranks. */
  rerank_path?: string
  /** Authentication scheme for the Rerank endpoint. */
  rerank_auth_scheme?: 'raw' | 'bearer' | string
  /** Optional instruction passed to Qwen-compatible Rerank endpoints. */
  rerank_instruct?: string
  context_size?: string | number
  max_tokens_to_sample?: string | number
  enable_thinking?: boolean | string | number
}

export function resolveXirangModelLimits(credentials: { context_size?: unknown; max_tokens_to_sample?: unknown }) {
  const configuredContextSize = Number(credentials.context_size)
  const contextSize =
    Number.isFinite(configuredContextSize) && configuredContextSize > 0 ? Math.floor(configuredContextSize) : 32768
  const configuredMaxOutput = Number(credentials.max_tokens_to_sample)
  const maxOutputTokens =
    Number.isFinite(configuredMaxOutput) && configuredMaxOutput > 0
      ? Math.min(Math.floor(configuredMaxOutput), contextSize)
      : contextSize
  return { contextSize, maxOutputTokens }
}

export function getXirangBaseUrl(credentials: Pick<XirangCredentials, 'endpoint_url'>): string {
  const value = credentials.endpoint_url?.trim() || XirangDefaultBaseUrl
  return value.replace(/\/+$/, '')
}

export function toCredentialKwargs(
  credentials: XirangModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  const endpointModel = credentials.endpoint_model_name?.trim() || model
  const baseURL = getXirangBaseUrl(credentials)
  const appKey = credentials.app_key?.trim()
  if (!appKey) throw new Error('Tianyi Cloud Xirang AppKey is missing')

  const modelKwargs: Record<string, unknown> = {}
  if (credentials.enable_thinking !== undefined) {
    const enabled =
      credentials.enable_thinking === true ||
      credentials.enable_thinking === 'true' ||
      credentials.enable_thinking === 1 ||
      credentials.enable_thinking === '1'
    modelKwargs.enable_thinking = enabled
    modelKwargs.chat_template_kwargs = { enable_thinking: enabled }
  }

  return {
    apiKey: 'xirang-app-key',
    model: endpointModel,
    modelKwargs,
    configuration: {
      baseURL,
      defaultHeaders: {
        // Xirang documents AppKey as a raw Authorization value, not Bearer auth.
        Authorization: appKey
      }
    }
  } as unknown as OpenAIBaseInput & { configuration: ClientOptions }
}

export type XirangImageInput = Record<string, unknown> & {
  prompt?: string
  image?: string | string[]
  images?: string | string[]
  image_url?: string
  size?: string
  response_format?: string
  watermark?: boolean
}

export type XirangImageResponse = {
  created?: number
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string; size?: string }>
  [key: string]: unknown
}
