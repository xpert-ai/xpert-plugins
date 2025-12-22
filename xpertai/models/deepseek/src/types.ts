import { ClientOptions, OpenAIBaseInput } from '@langchain/openai';
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const typesFileUrl = fileURLToPath(import.meta.url);
const typesFileDir = dirname(typesFileUrl);

export const DeepSeek = 'deepseek';
export const DeepSeekBaseUrl = 'https://api.deepseek.com/v1';

export const SvgIcon = readFileSync(join(typesFileDir, '_assets/icon_s_en.svg'), 'utf8');

export interface DeepseekCredentials {
	api_key: string
	endpoint_url: string
}

export interface DeepseekModelCredentials extends CommonChatModelParameters {
  streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
}

export function toCredentialKwargs(credentials: DeepseekCredentials) {
	const credentialsKwargs: OpenAIBaseInput = {
		apiKey: credentials.api_key
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	if (credentials.endpoint_url) {
		const openaiApiBase = credentials.endpoint_url.replace(/\/$/, '').replace(/\/v1$/, '')
		configuration.baseURL = `${openaiApiBase}/v1`
	} else {
		configuration.baseURL = `https://api.deepseek.com/v1`
	}

	return {
		...credentialsKwargs,
		configuration
	}
}
