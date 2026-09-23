export type KdocsConnectorErrorCode =
  | 'AUTHORIZATION_EXPIRED'
  | 'AUTHORIZATION_FAILED'
  | 'AUTHORIZATION_RESPONSE_INVALID'
  | 'CONNECTOR_UNAVAILABLE'
  | 'TOKEN_EXPIRED'
  | 'MCP_SESSION_LOST'
  | 'MCP_TOOL_UNAVAILABLE'
  | 'MCP_TOOL_FAILED'
  | 'RATE_LIMITED'
  | 'CIRCUIT_OPEN'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'WORKSPACE_FILES_UNAVAILABLE'
  | 'FILE_TOO_LARGE'
  | 'FILE_DOWNLOAD_REJECTED'

export class KdocsConnectorError extends Error {
  constructor(
    readonly code: KdocsConnectorErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message)
    this.name = 'KdocsConnectorError'
  }
}

export function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (!(cause instanceof Error)) return error.message
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined
  const detail = [code, cause.message === error.message ? undefined : cause.message].filter(Boolean).join(': ')
  return detail ? `${error.message} (${detail})` : error.message
}
