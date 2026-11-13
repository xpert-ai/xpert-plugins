import type {
  HostContext,
  Locale,
  RadarData,
  RadarEntry,
  RadarMetrics,
  RadarRisk,
  RadarWeekly
} from './types'

export const PAGE_SIZE = 50

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function unwrap(response: unknown) {
  if (!isObject(response)) return {}
  if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
  if (Object.prototype.hasOwnProperty.call(response, 'result')) return response.result
  if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
  return response
}

export function buildQuery(context: HostContext, weekKey: string, search: string) {
  const payload = context.payload ?? {}
  const initialQuery = context.initialQuery ?? {}
  return {
    page: 1,
    pageSize: PAGE_SIZE,
    ...initialQuery,
    search: search || undefined,
    parameters: {
      ...(payload.parameters ?? {}),
      ...(initialQuery.parameters ?? {}),
      weekKey: weekKey || undefined
    }
  }
}

export function normalizeRadarData(raw: unknown): RadarData {
  const value = isObject(raw) ? raw : {}
  const summary = isObject(value.summary) ? value.summary : {}
  const metrics = isObject(summary.metrics) ? (summary.metrics as unknown as RadarMetrics) : null
  const weekly = isObject(summary.weekly) ? (summary.weekly as unknown as RadarWeekly) : null
  return {
    weekKey: typeof summary.weekKey === 'string' ? summary.weekKey : '',
    entries: Array.isArray(value.items) ? (value.items as RadarEntry[]) : [],
    total: typeof value.total === 'number' ? value.total : 0,
    metrics,
    risks: Array.isArray(summary.risks) ? (summary.risks as RadarRisk[]) : [],
    weekly,
    weeklies: Array.isArray(summary.weeklies) ? (summary.weeklies as RadarWeekly[]) : []
  }
}

export function getInitialWeekKey(context: HostContext) {
  const fromInitial = context.initialQuery?.parameters?.weekKey
  const fromPayload = context.payload?.parameters?.weekKey
  const value = Array.isArray(fromInitial) ? fromInitial[0] : fromInitial || fromPayload
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function formatDate(value: unknown, locale: Locale) {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString(locale === 'zh_Hans' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export function createOperationId() {
  const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `workbench-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
