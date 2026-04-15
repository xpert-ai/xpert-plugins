import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const moduleDir = dirname(fileURLToPath(import.meta.url));

export const ZhipuAIModelProvider = 'zhipuai'
export const ZhipuAIDefaultBaseUrl = 'https://open.bigmodel.cn/api/paas/v4'

export const SvgIcon = readFileSync(join(moduleDir, '_assets/icon_s_en.svg'), 'utf8');

export interface ZhipuaiCredentials {
	api_key: string
	endpoint_url?: string
}

export interface ZhipuaiModelOptions extends CommonChatModelParameters {
	streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
	thinking?: 'enabled' | 'disabled'
	clear_thinking?: boolean
	tool_stream?: boolean
	web_search?: boolean
	response_format?: 'text' | 'json_object'
}

export interface ZhipuaiTextEmbeddingModelOptions {
	context_size: number
	max_chunks: number
}

export function toCredentialKwargs(credentials: ZhipuaiCredentials) {
	const credentialsKwargs = {
		apiKey: credentials.api_key,
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	if (credentials.endpoint_url) {
		configuration.baseURL = credentials.endpoint_url.replace(/\/$/, '')
	} else {
		configuration.baseURL = ZhipuAIDefaultBaseUrl
	}

	return {
		...credentialsKwargs,
		configuration
	}
}
