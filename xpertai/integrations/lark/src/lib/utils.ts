import { type LarkFieldViolation, parseLarkClientError } from './types.js'

const LARK_TOKEN_ERROR_MESSAGE =
	'Failed to acquire Lark tenant access token. Please verify App ID, App Secret, and Is Lark configuration.'

export function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null
	}

	const trimmed = value.trim()
	return trimmed || null
}

export function stringifyErrorAsJson(error: unknown): string {
	const visited = new WeakSet<object>()
	const replacer = (_key: string, value: unknown) => {
		if (typeof value === 'bigint') {
			return value.toString()
		}

		if (value instanceof Error) {
			return {
				name: value.name,
				message: value.message,
				stack: value.stack,
				cause: value.cause
			}
		}

		if (typeof value === 'object' && value !== null) {
			if (visited.has(value)) {
				return '[Circular]'
			}
			visited.add(value)
		}

		return value
	}

	try {
		const serialized = JSON.stringify(error, replacer)
		return serialized ?? String(error)
	} catch {
		return String(error)
	}
}

export function parseErrorFromJsonString(errorJsonString: string): unknown {
	const normalized = errorJsonString.trim()
	if (!normalized) {
		return errorJsonString
	}

	try {
		const parsed = JSON.parse(normalized)
		if (typeof parsed === 'string') {
			const nested = parsed.trim()
			if (
				(nested.startsWith('{') && nested.endsWith('}')) ||
				(nested.startsWith('[') && nested.endsWith(']'))
			) {
				try {
					return JSON.parse(nested)
				} catch {
					return parsed
				}
			}
		}
		return parsed
	} catch {
		const objectStart = normalized.indexOf('{')
		const objectEnd = normalized.lastIndexOf('}')
		if (objectStart >= 0 && objectEnd > objectStart) {
			const candidate = normalized.slice(objectStart, objectEnd + 1)
			try {
				return JSON.parse(candidate)
			} catch {
				return errorJsonString
			}
		}

		const arrayStart = normalized.indexOf('[')
		const arrayEnd = normalized.lastIndexOf(']')
		if (arrayStart >= 0 && arrayEnd > arrayStart) {
			const candidate = normalized.slice(arrayStart, arrayEnd + 1)
			try {
				return JSON.parse(candidate)
			} catch {
				return errorJsonString
			}
		}

		return errorJsonString
	}
}

function formatFieldViolation(violation: LarkFieldViolation): string | null {
	const field = toNonEmptyString(violation.field)
	const reason =
		toNonEmptyString(violation.message) ||
		toNonEmptyString(violation.reason) ||
		toNonEmptyString(violation.msg)

	if (field && reason) {
		return `${field}: ${reason}`
	}

	return field || reason || null
}

export function toLarkApiErrorMessage(error: unknown): string {
	if (isLarkCredentialBootstrapError(error)) {
		return LARK_TOKEN_ERROR_MESSAGE
	}

	const parsed = parseLarkClientError(error)
	const segments: string[] = []

	for (const value of [parsed.msg, parsed.error?.message]) {
		const normalized = toNonEmptyString(value)
		if (normalized && !segments.includes(normalized)) {
			segments.push(normalized)
		}
	}

	const fieldViolations = parsed.error?.field_violations || parsed.field_violations
	if (fieldViolations?.length) {
		const violationMessage = fieldViolations
			.map((violation) => formatFieldViolation(violation))
			.filter((value): value is string => Boolean(value))
			.join('; ')

		if (violationMessage) {
			segments.push(`field_violations: ${violationMessage}`)
		}
	}

	const logId =
		toNonEmptyString(parsed.error?.log_id) ||
		toNonEmptyString(parsed.log_id)
	if (logId) {
		segments.push(`log_id: ${logId}`)
	}

	const troubleshooter =
		toNonEmptyString(parsed.error?.troubleshooter) ||
		toNonEmptyString(parsed.troubleshooter)
	if (troubleshooter) {
		segments.push(`troubleshooter: ${troubleshooter}`)
	}

	return segments.join(' | ') || 'Lark API request failed'
}

function isLarkCredentialBootstrapError(error: unknown): boolean {
	const message = extractErrorMessage(error)
	if (!message) {
		return false
	}

	return (
		message.includes("tenant_access_token") &&
		(message.includes('undefined') ||
			message.includes('Cannot destructure property') ||
			message.includes('Failed to get tenant_access_token'))
	)
}

function extractErrorMessage(error: unknown): string {
	if (typeof error === 'string') {
		return error
	}

	if (error instanceof Error) {
		return error.message || String(error)
	}

	const responseMessage = (error as any)?.response?.data?.msg
	if (typeof responseMessage === 'string' && responseMessage.trim()) {
		return responseMessage
	}

	const message = (error as any)?.message
	if (typeof message === 'string' && message.trim()) {
		return message
	}

	return String(error ?? '')
}
