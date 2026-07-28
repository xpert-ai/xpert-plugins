import {
  parseHandoffView,
  type HandoffView
} from './production-panel'
import {
  isRemoteObject,
  type RemoteValue
} from './runtime'

export function readHostThemeMode(
  value: RemoteValue
): 'light' | 'dark' {
  if (typeof value === 'string') {
    return value.toLowerCase().includes('dark') ? 'dark' : 'light'
  }
  if (isRemoteObject(value)) {
    const mode = value.mode
    if (
      typeof mode === 'string' &&
      mode.toLowerCase().includes('dark')
    ) {
      return 'dark'
    }
  }
  return 'light'
}

export function findHandoff(
  value: RemoteValue
): HandoffView | null {
  const direct = parseHandoffView(value)
  if (direct) return direct
  if (!isRemoteObject(value)) return null
  return (
    parseHandoffView(value.handoff) ??
    findHandoff(value.data) ??
    findHandoff(value.result) ??
    findHandoff(value.payload)
  )
}
