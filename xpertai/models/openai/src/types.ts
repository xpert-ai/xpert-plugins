import { ClientOptions, OpenAIBaseInput } from '@langchain/openai'
import { CommonChatModelParameters } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const moduleDir = dirname(fileURLToPath(import.meta.url))

export const OpenAIProvider = 'openai'
export const OpenAIDefaultBaseUrl = 'https://api.openai.com/v1'
export const OpenAIResponsesMinOutputTokens = 16
const OpenAIApiVersionPath = '/v1'
const OpenAIOfficialHost = 'api.openai.com'

export const SvgIcon = readFileSync(join(moduleDir, '_assets/icon_s_en.svg'), 'utf8')

export interface OpenAICredentials {
	api_key: string
	endpoint_url?: string
	sampling_parameters?: 'auto' | 'enabled' | 'disabled'
}

export type OpenAIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

const OpenAICurrentModelProfiles: readonly {
	model: string
	supported: readonly OpenAIReasoningEffort[]
	defaultEffort: OpenAIReasoningEffort
}[] = [
	{ model: 'gpt-6-astra', supported: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
	{ model: 'gpt-6.1-sol', supported: ['low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
	{ model: 'gpt-6.1-terra', supported: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
	{ model: 'gpt-6-luna', supported: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
	{ model: 'gpt-6-sol', supported: ['none', 'low', 'medium', 'high', 'xhigh', 'max'], defaultEffort: 'medium' },
]

function getCurrentModelProfile(model?: string) {
	return OpenAICurrentModelProfiles.find((profile) => profile.model === model?.trim())
}

const OpenAIReasoningEffortScale: readonly OpenAIReasoningEffort[] = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
	'max',
]

const OpenAIReasoningEffortProfiles = [
	{
		pattern: /^gpt-5$/,
		supported: ['minimal', 'low', 'medium', 'high'] as const,
	},
	{
		pattern: /^gpt-5\.(2|4)$/,
		supported: ['none', 'low', 'medium', 'high', 'xhigh'] as const,
	},
	{
		pattern: /^gpt-5\.[23]-codex$/,
		supported: ['low', 'medium', 'high', 'xhigh'] as const,
	},
	{
		pattern: /^gpt-5\.(2|4)-pro$/,
		supported: ['medium', 'high', 'xhigh'] as const,
	},
] as const

export interface OpenAIModelOptions extends Partial<CommonChatModelParameters> {
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

export function getSupportedOpenAIReasoningEfforts(
	model?: string
): readonly OpenAIReasoningEffort[] | undefined {
	if (!model?.trim()) {
		return undefined
	}

	return getCurrentModelProfile(model)?.supported ??
		OpenAIReasoningEffortProfiles.find(({ pattern }) => pattern.test(model.trim()))?.supported
}

export function normalizeOpenAIReasoningEffort(
	model?: string,
	effort?: OpenAIReasoningEffort
): OpenAIReasoningEffort | undefined {
	const currentProfile = getCurrentModelProfile(model)
	if (!effort) {
		return currentProfile?.defaultEffort
	}
	if (currentProfile && effort === 'minimal') {
		return 'low'
	}

	const supported = getSupportedOpenAIReasoningEfforts(model)
	if (!supported?.length) {
		return undefined
	}

	if (supported.includes(effort)) {
		return effort
	}

	const requestedIndex = OpenAIReasoningEffortScale.indexOf(effort)
	if (requestedIndex === -1) {
		return supported[0]
	}

	return supported.reduce((closest, candidate) => {
		const candidateIndex = OpenAIReasoningEffortScale.indexOf(candidate)
		const closestIndex = OpenAIReasoningEffortScale.indexOf(closest)
		const candidateDistance = Math.abs(candidateIndex - requestedIndex)
		const closestDistance = Math.abs(closestIndex - requestedIndex)

		return candidateDistance < closestDistance ? candidate : closest
	})
}

export function shouldEnableSamplingParameters(
	mode: OpenAICredentials['sampling_parameters'],
	baseURL?: string,
	model?: string,
	reasoningEffort?: OpenAIReasoningEffort
): boolean {
	// An endpoint override must not send parameters forbidden by the official model contract.
	// GPT-5.2 and GPT-5.4 default to none when the request omits reasoning effort.
	const defaultsToNone = model?.trim() === 'gpt-5.2' || model?.trim() === 'gpt-5.4'
	const effectiveEffort = normalizeOpenAIReasoningEffort(model, reasoningEffort) ??
		(defaultsToNone ? 'none' : undefined)
	if (isOpenAIOfficialBaseUrl(baseURL) && getSupportedOpenAIReasoningEfforts(model) &&
		effectiveEffort !== 'none') {
		return false
	}
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

export function normalizeOpenAIMaxTokens(maxTokens?: number, baseURL?: string): number | undefined {
	if (maxTokens == null) {
		return undefined
	}

	if (!isOpenAIOfficialBaseUrl(baseURL)) {
		return maxTokens
	}

	return Math.max(maxTokens, OpenAIResponsesMinOutputTokens)
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
