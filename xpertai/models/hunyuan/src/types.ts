import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'

export const Hunyuan = 'hunyuan'
export const HunyuanOpenAIBaseUrl = 'https://api.hunyuan.cloud.tencent.com/v1'

export interface HunyuanCredentials {
  api_key: string
  endpoint_url?: string
  endpoint_model_name?: string
}

export type HunyuanModelCredentials = HunyuanCredentials &
  CommonChatModelParameters & {
  streaming?: boolean
  top_p?: number
  max_tokens?: number
}

export function getBaseUrlFromCredentials(credentials: HunyuanCredentials): string {
  return credentials.endpoint_url?.replace(/\/$/, '') || HunyuanOpenAIBaseUrl
}

export function toCredentialKwargs(
  credentials: HunyuanModelCredentials,
  model?: string
): OpenAIBaseInput & { configuration: ClientOptions } {
  const credentialsKwargs: OpenAIBaseInput = {
    apiKey: credentials.api_key || 'no-key-required',
    model: credentials.endpoint_model_name || model,
    streaming: credentials.streaming,
    temperature: credentials.temperature,
    topP: credentials.top_p,
  } as OpenAIBaseInput

  const configuration: ClientOptions = {
    baseURL: getBaseUrlFromCredentials(credentials),
  }

  return {
    ...credentialsKwargs,
    configuration,
  }
}

export const SvgIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="24" rx="6" fill="#3B82F6"/>
<path d="M6 7h3v10H6V7Zm9 0h3v10h-3V7Zm-4.5 2h3v8h-3V9Z" fill="white"/>
</svg>`
