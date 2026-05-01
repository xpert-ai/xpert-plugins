import { TWeComLongDisabledReason } from './types.js'

const UNRECOVERABLE_PATTERNS = [
  'missing botid/secret',
  'missing bot id',
  'missing secret',
  'botid is required',
  'secret is required',
  'invalid bot',
  'invalid secret',
  'unauthorized',
  'forbidden',
  'permission denied',
  'not enabled',
  'deleted',
  'errcode=400',
  'errcode=401',
  'errcode=403'
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
  'connection closed',
  'connect etimedout',
  'ws close',
  'socket error',
  'ping failed'
]

function toReasonMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function getWeComLongConnectionRegistryKey(): string {
  return 'wecom:ws:registry'
}

export function getWeComLongConnectionLockKey(options?: { botId?: string | null }): string {
  return `wecom:ws:bot:${String(options?.botId || 'unknown').trim() || 'unknown'}`
}

export function getWeComLongConnectionOwnerKey(options?: { botId?: string | null }): string {
  return `wecom:ws:bot-owner:${String(options?.botId || 'unknown').trim() || 'unknown'}`
}

export function getWeComLongConnectionStatusKey(integrationId: string): string {
  return `wecom:ws:status:${integrationId}`
}

export function classifyWeComLongConnectionError(error: unknown): {
  recoverable: boolean
  disabledReason: TWeComLongDisabledReason
  reason: string
} {
  const message = toReasonMessage(error)
  const normalized = message.toLowerCase()

  if (UNRECOVERABLE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return {
      recoverable: false,
      disabledReason: 'config_invalid',
      reason: message
    }
  }

  if (RECOVERABLE_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return {
      recoverable: true,
      disabledReason: 'runtime_error',
      reason: message
    }
  }

  return {
    recoverable: false,
    disabledReason: 'config_invalid',
    reason: message
  }
}
