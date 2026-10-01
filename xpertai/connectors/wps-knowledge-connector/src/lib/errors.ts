export type WpsKnowledgeErrorCode =
  | 'AUTH_METHOD_UNSUPPORTED'
  | 'AUTHORIZATION_FAILED'
  | 'AUTHORIZATION_RESPONSE_INVALID'
  | 'TOKEN_EXPIRED'
  | 'CONNECTOR_UNAVAILABLE'
  | 'SCOPE_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'EMPTY_RECALL'
  | 'CONTENT_REJECTED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'REQUEST_TIMEOUT'
  | 'RESPONSE_TOO_LARGE'

export class WpsKnowledgeConnectorError extends Error {
  constructor(
    readonly code: WpsKnowledgeErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'WpsKnowledgeConnectorError'
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
