export type MotionDebugObject = Record<string, unknown>

let enabled = false

export function setMotionDebugHostConfig(value: unknown) {
  enabled =
    value === true ||
    (Boolean(value) &&
      value !== null &&
      typeof value === 'object' &&
      ('enabled' in value ? Boolean((value as { enabled?: unknown }).enabled) : Boolean((value as { motion?: unknown }).motion)))
}

export const motionWorkbenchDebug = {
  info(event: string, payload?: MotionDebugObject) {
    if (enabled) {
      console.info(`[motion] ${event}`, payload ?? {})
    }
  },
  warn(event: string, payload?: MotionDebugObject) {
    if (enabled) {
      console.warn(`[motion] ${event}`, payload ?? {})
    }
  },
  error(event: string, payload?: MotionDebugObject) {
    if (enabled) {
      console.error(`[motion] ${event}`, payload ?? {})
    }
  }
}
