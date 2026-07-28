type DebugData = Record<string, string | number | boolean | null | undefined>

const SECRET_KEY = /token|secret|password|authorization|cookie|tenant|organization/i

export function redactDebugData(data?: DebugData): DebugData | undefined {
  if (!data) return undefined
  const redacted: DebugData = {}
  for (const [key, value] of Object.entries(data).slice(0, 20)) {
    redacted[key] = SECRET_KEY.test(key)
      ? '[redacted]'
      : typeof value === 'string' && value.length > 240
        ? `${value.slice(0, 237)}...`
        : value
  }
  return redacted
}

export function createServerDebugLogger(enabled: boolean) {
  return {
    debug(event: string, data?: DebugData): void {
      if (enabled) console.debug(`[img2threejs] ${event}`, redactDebugData(data))
    },
    info(event: string, data?: DebugData): void {
      if (enabled) console.info(`[img2threejs] ${event}`, redactDebugData(data))
    },
    warn(event: string, data?: DebugData): void {
      console.warn(`[img2threejs] ${event}`, redactDebugData(data))
    },
    error(event: string, data?: DebugData): void {
      console.error(`[img2threejs] ${event}`, redactDebugData(data))
    }
  }
}
