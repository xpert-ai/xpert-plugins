import type { BridgeMessage } from './types'

export function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function asObject(value: unknown): Record<string, any> | undefined {
  return isObject(value) ? value : undefined
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

/** View data comes back untouched on `data`, while action results are wrapped in `result`. */
export function viewData(message: BridgeMessage) {
  return asObject(message.data) ?? asObject(message.result) ?? {}
}

export interface ActionOutcome {
  success: boolean
  code?: string
  data: Record<string, any>
}

/**
 * `executeAction` resolves with `result = { success, message, refresh, data }`.
 * The plugin payload (including the failure `code`) always lives inside `result.data`.
 */
export function actionOutcome(message: BridgeMessage): ActionOutcome {
  const result = asObject(message.result) ?? asObject(message.data) ?? {}
  const data = asObject(result.data) ?? {}
  return {
    success: result.success !== false,
    code: asString(data.code),
    data
  }
}

export function newRequestId() {
  const cryptoApi = window.crypto as Crypto | undefined
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID()
  }
  return `st-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function formatDateTime(value?: string, locale = 'zh-Hans') {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(locale === 'en-US' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function optionLabel(
  options: Array<{ value: string; en_US: string; zh_Hans: string }> | undefined,
  value?: string,
  locale = 'zh-Hans'
) {
  if (!value) {
    return undefined
  }
  const match = options?.find((item) => item.value === value)
  if (!match) {
    return value
  }
  return locale === 'en-US' ? match.en_US : match.zh_Hans
}
