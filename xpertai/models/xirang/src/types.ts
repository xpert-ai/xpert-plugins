import type { ClientOptions, OpenAIBaseInput } from '@langchain/openai'

export const Xirang = 'xirang'
export const XirangDefaultBaseUrl = 'https://ai.ctaigw.cn/v1'

export type XirangCredentials = {
  app_key: string
  endpoint_url?: string
}

export type XirangModelCredentials = XirangCredentials & {
  endpoint_model_name?: string
  context_size?: string | number
  max_tokens_to_sample?: string | number
  enable_thinking?: boolean | string | number
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
    const enabled = credentials.enable_thinking === true || credentials.enable_thinking === 'true' || credentials.enable_thinking === 1 || credentials.enable_thinking === '1'
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
  size?: string
  response_format?: string
  watermark?: boolean
}

export type XirangImageResponse = {
  created?: number
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>
  [key: string]: unknown
}
