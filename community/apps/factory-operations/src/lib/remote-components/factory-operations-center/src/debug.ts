import type { RemoteValue } from './types'

let enabled = false

export function configureDebug(value: RemoteValue) {
  enabled = Boolean(value && typeof value === 'object' && !Array.isArray(value) && Reflect.get(value, 'enabled') === true)
}

export function debug(event: string, detail: Record<string, unknown> = {}) {
  if (!enabled) return
  const safe = Object.fromEntries(
    Object.entries(detail)
      .filter(([key]) => !/token|secret|tenant|organization/i.test(key))
      .map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 160) : value])
  )
  console.debug('[factory-operations]', event, safe)
}

