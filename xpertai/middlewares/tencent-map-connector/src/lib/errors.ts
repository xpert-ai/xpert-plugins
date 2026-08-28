export type TencentMapErrorCode =
  | 'CONFIGURATION_INVALID'
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_ARGUMENT'
  | 'NO_RESULT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_RESPONSE_INVALID'
  | 'UPSTREAM_REQUEST_FAILED'
  | 'RESPONSE_TOO_LARGE'

export class TencentMapConnectorError extends Error {
  constructor(
    readonly code: TencentMapErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'TencentMapConnectorError'
  }
}

export function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return redactTencentMapKey(value).slice(0, 1_000)
}

export function redactTencentMapKey(value: string): string {
  return value
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){5}\b/g, '[REDACTED]')
}
