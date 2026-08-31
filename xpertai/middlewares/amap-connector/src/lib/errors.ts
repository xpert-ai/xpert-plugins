export type AmapErrorCode =
  | 'CONFIGURATION_INVALID'
  | 'CREDENTIAL_INVALID'
  | 'CREDENTIAL_RESTRICTED'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_ARGUMENT'
  | 'NO_RESULT'
  | 'OUT_OF_SERVICE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_RESPONSE_INVALID'
  | 'UPSTREAM_REQUEST_FAILED'
  | 'RESPONSE_TOO_LARGE'

export class AmapConnectorError extends Error {
  constructor(
    readonly code: AmapErrorCode,
    message: string,
    readonly retryable = false,
    readonly upstreamCode?: string
  ) {
    super(message)
    this.name = 'AmapConnectorError'
  }
}

export function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return redactAmapSecrets(value).slice(0, 1_000)
}

export function redactAmapSecrets(value: string): string {
  return value
    .replace(/([?&](?:key|sig|privateKey)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/("(?:apiKey|privateKey|sig)"\s*:\s*")[^"]+("?)/gi, '$1[REDACTED]$2')
}
