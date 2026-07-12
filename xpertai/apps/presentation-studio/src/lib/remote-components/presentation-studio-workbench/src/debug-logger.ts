import type { JsonObject } from './types'

let hostDefault = false
export function setDebugDefault(value: boolean) { hostDefault = value }

function enabled() {
  const stored = globalThis.localStorage?.getItem('xpert.debug.presentation-studio')
  if (stored === '0') return false
  if (stored === '1') return true
  return new URLSearchParams(globalThis.location?.search ?? '').get('xpertDebug') === 'presentation-studio' || hostDefault
}

function summarize(data?: JsonObject) {
  if (!data) return undefined
  const output: JsonObject = {}
  for (const [key, value] of Object.entries(data)) {
    if (/token|session|tenant|organization|html|base64/i.test(key)) output[key] = '[redacted]'
    else if (typeof value === 'string' && value.length > 180) output[key] = `${value.slice(0, 180)}…`
    else output[key] = value
  }
  return output
}

export const debug = {
  info(event: string, data?: JsonObject) { if (enabled()) console.info(`[presentation-studio] ${event}`, summarize(data)) },
  warn(event: string, data?: JsonObject) { if (enabled()) console.warn(`[presentation-studio] ${event}`, summarize(data)) },
  error(event: string, data?: JsonObject) { if (enabled()) console.error(`[presentation-studio] ${event}`, summarize(data)) }
}
