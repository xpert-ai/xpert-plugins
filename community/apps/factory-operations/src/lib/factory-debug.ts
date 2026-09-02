import type { FactoryConfig } from './config.js'

type DebugData = Record<string, string | number | boolean | null | undefined>

export class FactoryDebugLogger {
  constructor(
    private readonly namespace: string,
    private readonly config: FactoryConfig
  ) {}

  debug(event: string, data: DebugData = {}) {
    if (!this.config.debug) return
    console.debug(`[factory-ops:${this.namespace}] ${event}`, redact(data))
  }

  warn(event: string, data: DebugData = {}) {
    console.warn(`[factory-ops:${this.namespace}] ${event}`, redact(data))
  }

  error(event: string, data: DebugData = {}) {
    console.error(`[factory-ops:${this.namespace}] ${event}`, redact(data))
  }
}

function redact(data: DebugData): DebugData {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !/tenant|organization|token|secret|credential/i.test(key))
      .map(([key, value]) => [
        key,
        typeof value === 'string' && value.length > 160
          ? `${value.slice(0, 157)}...`
          : value
      ])
  )
}
