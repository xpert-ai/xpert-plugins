import type { JsonObject, JsonValue } from './types'

export function unwrapRemoteResponse(response: JsonObject): JsonValue {
  const payload = response.payload ?? response.data ?? response.result ?? response
  if (!isJsonObject(payload)) return payload
  if (isJsonObject(payload.data)) return payload.data
  if (isJsonObject(payload.meta)) return payload.meta
  return payload
}

function isJsonObject(value: JsonValue | object | undefined): value is JsonObject {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
