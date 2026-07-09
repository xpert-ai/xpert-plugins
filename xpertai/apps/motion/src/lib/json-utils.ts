import type { MotionJsonObject, MotionJsonValue } from './types.js'

export function isJsonObject(value: MotionJsonValue | object | null | undefined): value is MotionJsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

export function normalizeJsonObject(value: MotionJsonValue | object | null | undefined): MotionJsonObject | null {
  return isJsonObject(value) ? value : null
}

export function normalizeStringArray(value: string[] | null | undefined) {
  if (!Array.isArray(value)) {
    return []
  }
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))).slice(0, 100)
}

export function compactJson(value: MotionJsonValue | undefined, maxLength = 2000): MotionJsonValue | undefined {
  if (value === undefined) {
    return undefined
  }
  const text = JSON.stringify(value)
  if (text.length <= maxLength) {
    return value
  }
  return {
    truncated: true,
    originalLength: text.length,
    preview: text.slice(0, maxLength)
  }
}

export function stableJson(value: MotionJsonValue | object | null | undefined) {
  return JSON.stringify(value ?? null)
}
