import { TIntegrationLarkOptions } from './types.js'
import { stringifyErrorAsJson, toLarkApiErrorMessage, toNonEmptyString } from './utils.js'

export type TLarkLongConnectionErrorClassification = {
	recoverable: boolean
	reason: string
}

const UNRECOVERABLE_PATTERNS = [
	'tenant access token',
	'tenant_access_token',
	'app_access_token',
	'app id',
	'app secret',
	'invalid app',
	'app not found',
	'permission',
	'forbidden',
	'unauthorized',
	'not enabled',
	'not available',
	'not support',
	'deleted',
	'callback/ws/endpoint',
	'endpoint',
	'code: 99991663',
	'code: 99991661',
	'code: 20001',
	'code: 20006'
]

const RECOVERABLE_PATTERNS = [
	'timeout',
	'timed out',
	'econnreset',
	'enotfound',
	'eai_again',
	'network',
	'socket hang up',
	'gateway',
	'temporarily unavailable',
	'websocket',
	'close frame',
	'connection closed',
	'connect etimedout'
]

export function resolveLarkLongConnectionAppKey(
	options: Pick<TIntegrationLarkOptions, 'isLark' | 'appId'>
): string {
	const domain = options?.isLark ? 'larksuite' : 'feishu'
	const appId = toNonEmptyString(options?.appId) || 'unknown'
	return `${domain}:${appId}`
}

export function getLarkLongConnectionLockKey(
	options: Pick<TIntegrationLarkOptions, 'isLark' | 'appId'>
): string {
	return `lark:ws:app:${resolveLarkLongConnectionAppKey(options)}`
}

export function getLarkLongConnectionOwnerKey(
	options: Pick<TIntegrationLarkOptions, 'isLark' | 'appId'>
): string {
	return `lark:ws:app-owner:${resolveLarkLongConnectionAppKey(options)}`
}

export function getLarkLongConnectionStatusKey(integrationId: string): string {
	return `lark:ws:status:${integrationId}`
}

export function classifyLongConnectionError(error: unknown): TLarkLongConnectionErrorClassification {
	const message = `${toLarkApiErrorMessage(error)} | ${stringifyErrorAsJson(error)}`.toLowerCase()

	if (UNRECOVERABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
		return {
			recoverable: false,
			reason: toLarkApiErrorMessage(error)
		}
	}

	if (RECOVERABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
		return {
			recoverable: true,
			reason: toLarkApiErrorMessage(error)
		}
	}

	return {
		recoverable: false,
		reason: toLarkApiErrorMessage(error)
	}
}
