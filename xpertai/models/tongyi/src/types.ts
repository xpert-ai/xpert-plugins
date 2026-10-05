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
    api_host?: string
    use_international_endpoint?: boolean | string
}

export interface TongyiModelCredentials extends CommonChatModelParameters {
    streaming?: boolean
    top_p?: number
    max_tokens?: number
    max_completion_tokens?: number
    frequency_penalty?: number
    enable_thinking?: boolean
    thinking_budget?: number
    reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number
    tool_stream?: boolean
    enable_search?: boolean
    response_format?: 'text' | 'json_object' | 'json_schema'
    json_schema?: string | object
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

export function normalizeTongyiApiHost(apiHost?: string): string | undefined {
    const normalizedHost = apiHost?.trim().replace(/\/+$/, '')
    if (!normalizedHost) {
        return undefined
    }

    return /^https?:\/\//i.test(normalizedHost) ? normalizedHost : `https://${normalizedHost}`
}

export function getTongyiCompatibleBaseUrl(credentials: TongyiCredentials): string {
    const apiHost = normalizeTongyiApiHost(credentials.api_host)
    if (apiHost) {
        return joinTongyiApiUrl(apiHost, '/compatible-mode/v1')
    }

    return isTongyiInternationalEndpointEnabled(credentials) ? TongyiIntlBaseUrl : TongyiDefaultBaseUrl
}

export function getTongyiHttpBaseUrl(credentials: TongyiCredentials): string {
    const apiHost = normalizeTongyiApiHost(credentials.api_host)
    if (apiHost) {
        return joinTongyiApiUrl(apiHost, '/api/v1')
    }

    return isTongyiInternationalEndpointEnabled(credentials) ? TongyiIntlHttpBaseUrl : TongyiDefaultHttpBaseUrl
}

function parseTongyiWorkspaceApiHost(apiHost?: string): URL | undefined {
    const normalizedHost = normalizeTongyiApiHost(apiHost)
    if (!normalizedHost) return undefined

    try {
        const url = new URL(normalizedHost)
        // Qwen realtime uses Bailian's workspace endpoint in Beijing or Singapore.
        const workspaceHost = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/
        if (url.protocol !== 'https:' || !workspaceHost.test(url.hostname) ||
            url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
            return undefined
        }
        return url
    } catch {
        return undefined
    }
}

export function isTongyiWorkspaceApiHost(apiHost?: string): boolean {
    return !!parseTongyiWorkspaceApiHost(apiHost)
}

export function getTongyiRealtimeUrl(credentials: Pick<TongyiCredentials, 'api_host'>, model: string): string {
    const url = parseTongyiWorkspaceApiHost(credentials.api_host)
    if (!url) {
        throw new Error('Qwen realtime requires api_host to be a Bailian workspace HTTPS host in Beijing or Singapore')
    }
    url.protocol = 'wss:'
    url.pathname = '/api-ws/v1/realtime'
    url.searchParams.set('model', model)
    return url.toString()
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
