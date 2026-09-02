import { getResponsePayload, isObject, resolveMessage } from './runtime.js'

export function requireSuccessfulActionResult(response: unknown, locale?: unknown) {
  const result = getResponsePayload(response)
  if (isObject(result) && result.success === false) {
    throw new Error(resolveMessage(result.message, locale) || 'Office Editor action failed.')
  }
  return result
}

export function getSuccessfulActionData(response: unknown, locale?: unknown) {
  const result = requireSuccessfulActionResult(response, locale)
  return isObject(result) && result.data !== undefined ? result.data : result
}
