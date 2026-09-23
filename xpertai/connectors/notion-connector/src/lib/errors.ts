export type NotionErrorCode =
  | 'CONNECTOR_UNAVAILABLE'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_EXCHANGE_FAILED'
  | 'TOKEN_EXPIRED'
  | 'NOTION_AUTH_REQUIRED'
  | 'NOTION_FORBIDDEN'
  | 'NOTION_NOT_FOUND'
  | 'NOTION_RATE_LIMITED'
  | 'NOTION_SERVICE_UNAVAILABLE'
  | 'NOTION_VALIDATION_ERROR'
  | 'NOTION_PROVIDER_ERROR'

export class NotionConnectorError extends Error {
  constructor(
    readonly code: NotionErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message)
    this.name = 'NotionConnectorError'
  }
}

export function providerError(status: number, message: string, retryAfter?: number): NotionConnectorError {
  if (status === 401)
    return new NotionConnectorError('NOTION_AUTH_REQUIRED', 'Notion authorization is required.', status)
  if (status === 403)
    return new NotionConnectorError('NOTION_FORBIDDEN', 'Notion denied access to this resource.', status)
  if (status === 404)
    return new NotionConnectorError('NOTION_NOT_FOUND', 'The requested Notion resource was not found.', status)
  if (status === 429)
    return new NotionConnectorError(
      'NOTION_RATE_LIMITED',
      retryAfter ? `Notion rate limit exceeded. Retry after ${retryAfter} seconds.` : 'Notion rate limit exceeded.',
      status,
      retryAfter
    )
  if (status === 529 || status >= 500)
    return new NotionConnectorError('NOTION_SERVICE_UNAVAILABLE', 'Notion is temporarily unavailable.', status)
  if (status >= 400 && status < 500) return new NotionConnectorError('NOTION_VALIDATION_ERROR', message, status)
  return new NotionConnectorError('NOTION_PROVIDER_ERROR', message, status)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function requireString(value: unknown, message: string): string {
  const result = readString(value)
  if (!result) throw new NotionConnectorError('NOTION_VALIDATION_ERROR', message)
  return result
}

export function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
