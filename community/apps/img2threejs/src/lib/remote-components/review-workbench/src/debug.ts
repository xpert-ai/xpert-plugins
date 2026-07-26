type DebugData = Record<string, string | number | boolean | null | undefined>

const SECRET = /token|secret|authorization|cookie|tenant|organization/i

function redact(data?: DebugData): DebugData | undefined {
  if (!data) return undefined
  return Object.fromEntries(
    Object.entries(data).slice(0, 16).map(([key, value]) => [
      key,
      SECRET.test(key) ? '[redacted]' : typeof value === 'string' && value.length > 180 ? `${value.slice(0, 177)}...` : value
    ])
  )
}

export function createRemoteLogger(hostDefault = false) {
  const key = 'xpert.debug.img2threejs'
  const enabled = () => {
    const override = globalThis.localStorage?.getItem(key)
    if (override === '0') return false
    if (override === '1') return true
    return new URLSearchParams(globalThis.location?.search ?? '').get('xpertDebug') === 'img2threejs' || hostDefault
  }
  return {
    debug(event: string, data?: DebugData): void {
      if (enabled()) console.debug(`[img2threejs] ${event}`, redact(data))
    },
    warn(event: string, data?: DebugData): void {
      console.warn(`[img2threejs] ${event}`, redact(data))
    }
  }
}
