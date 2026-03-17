import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const OpenAIProvider = 'openai'
export const OpenAIDefaultBaseUrl = 'https://api.openai.com/v1'
const OpenAIApiVersionPath = '/v1'
const OpenAIOfficialHost = 'api.openai.com'

export const SvgIcon = readFileSync(join(moduleDir, '_assets/icon_s_en.svg'), 'utf8')

export interface OpenAICredentials {
	api_key: string
	endpoint_url?: string
	sampling_parameters?: 'auto' | 'enabled' | 'disabled'
}

export type OpenAIReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

export interface OpenAIModelOptions extends CommonChatModelParameters {
	streaming?: boolean
	top_p?: number
	max_tokens?: number
	frequency_penalty?: number
	presence_penalty?: number
	reasoning_effort?: OpenAIReasoningEffort
	response_format?: 'text' | 'json_object'
}

const OpenAIGPT5ProModelPattern = /^gpt-5(?:\.\d+)?-pro$/

export function normalizeOpenAIBaseUrl(endpointUrl?: string): string {
	if (!endpointUrl?.trim()) {
		return OpenAIDefaultBaseUrl
	}

	const trimmed = endpointUrl.trim().replace(/[。｡．]+$/, '').replace(/\/+$/, '')

	try {
		const parsed = new URL(trimmed)
		if (!parsed.pathname || parsed.pathname === '/') {
			parsed.pathname = OpenAIApiVersionPath
			parsed.search = ''
			parsed.hash = ''
			return parsed.toString().replace(/\/$/, '')
		}

		return parsed.toString().replace(/\/$/, '')
	} catch {
		if (trimmed.endsWith(OpenAIApiVersionPath) || trimmed.includes(`${OpenAIApiVersionPath}/`)) {
			return trimmed
		}
		return `${trimmed}${OpenAIApiVersionPath}`
	}
}

export function isOpenAIOfficialBaseUrl(baseURL?: string): boolean {
	if (!baseURL?.trim()) {
		return true
	}

	try {
		const parsed = new URL(baseURL)
		return parsed.hostname.toLowerCase() === OpenAIOfficialHost
	} catch {
		return baseURL.includes(OpenAIOfficialHost)
	}
}

export function isOpenAIGPT5ProModel(model?: string): boolean {
	return !!model?.trim() && OpenAIGPT5ProModelPattern.test(model.trim())
}

export function shouldEnableSamplingParameters(
	mode: OpenAICredentials['sampling_parameters'],
	baseURL?: string,
	model?: string
): boolean {
	if (mode === 'enabled') {
		return true
	}

	if (mode === 'disabled') {
		return false
	}

	if (!isOpenAIOfficialBaseUrl(baseURL)) {
		return false
	}

	return !isOpenAIGPT5ProModel(model)
}

export function shouldEnableResponseFormat(
	baseURL?: string,
	model?: string
): boolean {
	if (!isOpenAIOfficialBaseUrl(baseURL)) {
		return true
	}

	return !isOpenAIGPT5ProModel(model)
}

export function toCredentialKwargs(credentials: OpenAICredentials) {
	const credentialsKwargs = {
		apiKey: credentials.api_key,
	} as OpenAIBaseInput
	const configuration: ClientOptions = {}

	configuration.baseURL = normalizeOpenAIBaseUrl(credentials.endpoint_url)

	return {
		...credentialsKwargs,
		configuration
	}
}
