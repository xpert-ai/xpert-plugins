export type QqMailErrorCode =
  | 'OAUTH_DISCOVERY_FAILED'
  | 'DYNAMIC_REGISTRATION_FAILED'
  | 'CALLBACK_REJECTED'
  | 'OAUTH_STATE_INVALID'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'TOKEN_EXPIRED'
  | 'SCOPE_MISSING'
  | 'MCP_UNAUTHORIZED'
  | 'MCP_SESSION_LOST'
  | 'MCP_TOOL_FAILED'
  | 'RATE_LIMITED'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_INVALID'
  | 'ATTACHMENT_TOO_LARGE'
  | 'ATTACHMENT_INTEGRITY_FAILED'
  | 'WORKSPACE_FILES_UNAVAILABLE'
  | 'MESSAGE_NOT_FOUND'

export class QqMailConnectorError extends Error {
  constructor(readonly code: QqMailErrorCode, message: string, readonly retryable = false) {
    super(`[${code}] ${message}`)
    this.name = 'QqMailConnectorError'
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}
