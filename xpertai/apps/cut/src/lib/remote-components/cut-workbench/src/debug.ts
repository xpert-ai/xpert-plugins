type DebugLevel = 'debug' | 'info' | 'warn' | 'error'
type DebugSettings = { enabled: boolean; production: boolean }
type DebugData = Record<string, string | number | boolean | null | undefined>

let hostSettings: DebugSettings = { enabled: false, production: true }

export function configureCutDebug(value: object | null | undefined) {
  const enabled = value && 'enabled' in value && typeof value.enabled === 'boolean' ? value.enabled : false
  const production = value && 'production' in value && typeof value.production === 'boolean' ? value.production : true
  hostSettings = { enabled, production }
}

function enabled() {
  const override = globalThis.localStorage?.getItem('xpert.debug.cut-workbench')
  if (override === '0') return false
  if (override === '1') return true
  if (new URLSearchParams(globalThis.location?.search ?? '').get('xpertDebug') === 'cut-workbench') return true
  return hostSettings.enabled && !hostSettings.production
}

function write(level: DebugLevel, event: string, data?: DebugData) {
  if ((level === 'debug' || level === 'info') && !enabled()) return
  const method = level === 'debug' ? console.debug : level === 'info' ? console.info : level === 'warn' ? console.warn : console.error
  method(`[cut-workbench] ${event}`, redactDebugData(data))
}

function redactDebugData(data?: DebugData) {
  if (!data) return undefined
  return Object.fromEntries(Object.entries(data).filter(([key]) => !/(token|credential|tenant|organization|url|buffer|data)/i.test(key)))
}

export const cutDebug = {
  debug(event: string, data?: DebugData) { write('debug', event, data) },
  info(event: string, data?: DebugData) { write('info', event, data) },
  warn(event: string, data?: DebugData) { write('warn', event, data) },
  error(event: string, data?: DebugData) { write('error', event, data) }
}
