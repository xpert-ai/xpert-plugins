import { channelName } from '@xpert-ai/contracts'
import type { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { SENSITIVE_FILTER_MIDDLEWARE_NAME } from './constants.js'
import type { MatchPhase } from './runtime-types.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function extractPrimitiveText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (isRecord(item) && typeof item['text'] === 'string') {
          return item['text'] as string
        }
        return ''
      })
      .join('')
  }

  return ''
}

export function toSnippet(text: string, maxLength = 200): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) {
    return ''
  }
  if (compact.length <= maxLength) {
    return compact
  }
  return `${compact.slice(0, maxLength)}...`
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs?: number | null): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`LLM filter timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export function normalizeConfigurable(input: unknown): TAgentRunnableConfigurable | null {
  if (!isRecord(input)) {
    return null
  }

  return input as TAgentRunnableConfigurable
}

export function resolveAgentChannelName(configurable: TAgentRunnableConfigurable | null): string | undefined {
  if (!configurable) {
    return undefined
  }

  const rootAgentKey = isRecord(configurable) ? toNonEmptyString(configurable['rootAgentKey']) : null
  const agentKey = toNonEmptyString(configurable.agentKey)
  const key = rootAgentKey ?? agentKey

  return key ? channelName(key) : undefined
}

export function formatPhaseExecutionTitle(title: string | undefined, phase: MatchPhase): string {
  const baseTitle = toNonEmptyString(title) ?? SENSITIVE_FILTER_MIDDLEWARE_NAME
  const phaseLabel = phase === 'input' ? '输入审核' : '输出审核'

  return `${baseTitle} ${phaseLabel}`
}

export function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? '')
}

export function isMissingWrapWorkflowHandlerError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase()
  return message.includes('no handler found') && message.includes('wrapworkflownodeexecutioncommand')
}

export function isMissingCreateModelHandlerError(error: unknown): boolean {
  const message = getErrorText(error).toLowerCase()
  return (
    message.includes('no handler found') &&
    (message.includes('createmodelclientcommand') || message.includes('create model client'))
  )
}

export function shouldFailOpenOnLlmError(error: unknown): boolean {
  return isMissingWrapWorkflowHandlerError(error) || isMissingCreateModelHandlerError(error)
}

export async function runWithWrapWorkflowFallback<T>(
  runTracked: () => Promise<T>,
  runFallback: () => Promise<T>,
): Promise<T> {
  try {
    return await runTracked()
  } catch (error) {
    if (isMissingWrapWorkflowHandlerError(error)) {
      return runFallback()
    }
    throw error
  }
}
