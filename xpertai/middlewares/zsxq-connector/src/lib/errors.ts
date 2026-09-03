export type ZsxqConnectorErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTHORIZATION_INVALID'
  | 'CLI_UNAVAILABLE'
  | 'CLI_FAILED'
  | 'CONNECTOR_UNAVAILABLE'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_INVALID'
  | 'FILE_INVALID'
  | 'FILE_TOO_LARGE'
  | 'PERMISSION_DENIED'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'WRITES_DISABLED'
  | 'WORKSPACE_FILES_UNAVAILABLE'

export class ZsxqConnectorError extends Error {
  constructor(readonly code: ZsxqConnectorErrorCode, message: string, readonly retryable = false) {
    super(message)
    this.name = 'ZsxqConnectorError'
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
