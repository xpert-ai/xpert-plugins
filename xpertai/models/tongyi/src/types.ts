import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const TongyiModelProvider = 'tongyi'
export const TongyiDefaultBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const TongyiIntlBaseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
export const TongyiDefaultHttpBaseUrl = 'https://dashscope.aliyuncs.com/api/v1'
export const TongyiIntlHttpBaseUrl = 'https://dashscope-intl.aliyuncs.com/api/v1'

export const SvgIcon = readFileSync(join(moduleDir, '_assets/icon_s_en.svg'), 'utf8');

export interface TongyiCredentials {
    dashscope_api_key: string
    use_international_endpoint?: boolean | string
}

export interface TongyiModelCredentials extends CommonChatModelParameters {
    streaming?: boolean
    top_p?: number
    max_tokens?: number
    frequency_penalty?: number
    enable_thinking?: boolean
    thinking_budget?: number
    tool_stream?: boolean
    enable_search?: boolean
    response_format?: 'text' | 'json_object'
    extra_headers?: string
}

export interface TongyiTextEmbeddingModelOptions {
    context_size: number
    max_chunks: number
}

export function isTongyiInternationalEndpointEnabled(credentials?: Partial<TongyiCredentials>): boolean {
    const value = credentials?.use_international_endpoint
    return value === true || value === 'true'
}

export function getTongyiCompatibleBaseUrl(credentials: TongyiCredentials): string {
    return isTongyiInternationalEndpointEnabled(credentials) ? TongyiIntlBaseUrl : TongyiDefaultBaseUrl
}

export function getTongyiHttpBaseUrl(credentials: TongyiCredentials): string {
    return isTongyiInternationalEndpointEnabled(credentials) ? TongyiIntlHttpBaseUrl : TongyiDefaultHttpBaseUrl
}

export function joinTongyiApiUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function toCredentialKwargs(credentials: TongyiCredentials) {
    const credentialsKwargs = {
        apiKey: credentials.dashscope_api_key,
    } as OpenAIBaseInput
    const configuration: ClientOptions = {
        baseURL: getTongyiCompatibleBaseUrl(credentials)
    }

    return {
        ...credentialsKwargs,
        configuration
    }
}
