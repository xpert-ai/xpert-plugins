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

export type XirangPredefinedModelConfig = {
  endpoint_model_name?: string
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

export function isOfficialXirangEndpoint(credentials: Pick<XirangCredentials, 'endpoint_url'>): boolean {
  try {
    return new URL(getXirangBaseUrl(credentials)).hostname.toLowerCase() === 'ai.ctaigw.cn'
  } catch {
    return false
  }
}

export function getXirangAuthorization(credentials: XirangCredentials): string {
  const appKey = credentials.app_key?.trim()
  if (!appKey) throw new Error('Tianyi Cloud Xirang AppKey is missing')
  if (/^Bearer\s+/i.test(appKey)) return appKey
  return isOfficialXirangEndpoint(credentials) ? `Bearer ${appKey}` : appKey
}

export function resolveXirangEndpointModel(
  credentials: Pick<XirangModelCredentials, 'endpoint_model_name' | 'endpoint_url'>,
  model?: string,
  predefinedConfig?: XirangPredefinedModelConfig
): string | undefined {
  return (
    credentials.endpoint_model_name?.trim() ||
    (isOfficialXirangEndpoint(credentials) ? predefinedConfig?.endpoint_model_name?.trim() : undefined) ||
    model
  )
}

export function toCredentialKwargs(
  credentials: XirangModelCredentials,
  model?: string,
  predefinedConfig?: XirangPredefinedModelConfig
): OpenAIBaseInput & { configuration: ClientOptions } {
  const endpointModel = resolveXirangEndpointModel(credentials, model, predefinedConfig)
  const baseURL = getXirangBaseUrl(credentials)
  const authorization = getXirangAuthorization(credentials)

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
        Authorization: authorization
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
