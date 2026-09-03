export type CanvaErrorCode =
  | 'CANVA_CONNECTOR_UNAVAILABLE'
  | 'CANVA_CONFIGURATION_INVALID'
  | 'CANVA_OAUTH_DISCOVERY_FAILED'
  | 'CANVA_OAUTH_STATE_INVALID'
  | 'CANVA_CALLBACK_REJECTED'
  | 'CANVA_TOKEN_EXCHANGE_FAILED'
  | 'CANVA_TOKEN_EXPIRED'
  | 'CANVA_SCOPE_MISSING'
  | 'CANVA_TOOL_UNAVAILABLE'
  | 'CANVA_MCP_SESSION_LOST'
  | 'CANVA_MCP_TOOL_FAILED'
  | 'CANVA_RATE_LIMITED'
  | 'CANVA_AI_QUOTA_EXHAUSTED'
  | 'CANVA_CONFLICT'
  | 'CANVA_CONFIRMATION_REQUIRED'
  | 'CANVA_CONFIRMATION_INVALID'
  | 'CANVA_JOB_TIMEOUT'
  | 'CANVA_FILE_CAPABILITY_MISSING'
  | 'CANVA_FILE_DOWNLOAD_FAILED'
  | 'CANVA_RESPONSE_TOO_LARGE'
  | 'CANVA_INPUT_INVALID'

export class CanvaConnectorError extends Error {
  constructor(readonly code: CanvaErrorCode, message: string, readonly retryable = false, readonly upstreamCode?: string) {
    super(message)
    this.name = 'CanvaConnectorError'
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim() ? error.message : 'Unknown Canva error'
}

export function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function requireString(value: unknown, message: string): string {
  const result = readString(value)
  if (!result) throw new CanvaConnectorError('CANVA_INPUT_INVALID', message)
  return result
}
