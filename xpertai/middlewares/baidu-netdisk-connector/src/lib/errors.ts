export type BaiduNetdiskErrorCode =
  | 'PLUGIN_NOT_CONFIGURED'
  | 'CONFIGURATION_INVALID'
  | 'CONNECTOR_UNAVAILABLE'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_EXCHANGE_FAILED'
  | 'OAUTH_ACCESS_DENIED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REFRESH_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_ARGUMENT'
  | 'FILE_NOT_FOUND'
  | 'FILE_CONFLICT'
  | 'PATH_OUTSIDE_ALLOWED_ROOT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_RESPONSE_INVALID'
  | 'UPSTREAM_REQUEST_FAILED'
  | 'RESPONSE_TOO_LARGE'
  | 'CAPABILITY_DISABLED'

export class BaiduNetdiskConnectorError extends Error {
  constructor(
    readonly code: BaiduNetdiskErrorCode,
    message: string,
    readonly retryable = false,
    readonly upstreamCode?: string
  ) {
    super(message)
    this.name = 'BaiduNetdiskConnectorError'
  }
}

export function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return redactSecrets(value).slice(0, 1_000)
}

export function redactSecrets(value: string): string {
  return value
    .replace(/([?&](?:access_token|client_secret|refresh_token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/("(?:accessToken|refreshToken|secretKey)"\s*:\s*")[^"]+("?)/gi, '$1[REDACTED]$2')
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requireString(value: unknown, label: string): string {
  const result = readString(value)
  if (!result) throw new BaiduNetdiskConnectorError('INVALID_ARGUMENT', `${label} is required.`)
  return result
}
