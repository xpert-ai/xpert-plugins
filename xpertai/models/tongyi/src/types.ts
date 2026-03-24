import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const TongyiModelProvider = 'tongyi'
export const TongyiDefaultBaseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export const SvgIcon = readFileSync(join(moduleDir, '_assets/icon_s_en.svg'), 'utf8');

export interface TongyiCredentials {
    dashscope_api_key: string
}

export interface TongyiModelCredentials extends CommonChatModelParameters {
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

export function toCredentialKwargs(credentials: TongyiCredentials) {
    const credentialsKwargs = {
        apiKey: credentials.dashscope_api_key,
    } as OpenAIBaseInput
    const configuration: ClientOptions = {
        baseURL: TongyiDefaultBaseUrl
    }

    return {
        ...credentialsKwargs,
        configuration
    }
}
