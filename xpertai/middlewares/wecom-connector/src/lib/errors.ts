export type WeComConnectorErrorCode =
  | 'CONFIRMATION_EXPIRED'
  | 'CONFIRMATION_INVALID'
  | 'FILE_TOO_LARGE'
  | 'INVALID_ARGUMENT'
  | 'NETWORK_ERROR'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'PROVIDER_REJECTED'
  | 'RATE_LIMITED'
  | 'RUNTIME_UNAVAILABLE'
  | 'TOKEN_EXPIRED'
  | 'WORKSPACE_FILES_UNAVAILABLE'

export class WeComConnectorError extends Error {
  constructor(
    public readonly code: WeComConnectorErrorCode,
    message: string,
    public readonly providerCode?: number,
    public readonly retryable = false
  ) {
    super(message)
    this.name = 'WeComConnectorError'
  }
}

export function providerError(code: number, message?: string) {
  const safeMessage = sanitizeProviderMessage(message)
  if (code === 40014 || code === 42001) {
    return new WeComConnectorError(
      'TOKEN_EXPIRED',
      'The WeCom access token is invalid or expired. Reconnect the connector and retry.',
      code,
      true
    )
  }
  if ([48002, 60011, 60020].includes(code)) {
    const errorCode = code === 48002 ? 'PERMISSION_DENIED' : 'NOT_FOUND'
    return new WeComConnectorError(errorCode, safeMessage || 'The requested WeCom resource is unavailable.', code)
  }
  if ([40058, 40068, 60111].includes(code)) {
    return new WeComConnectorError(
      code === 60111 || code === 40068 ? 'NOT_FOUND' : 'INVALID_ARGUMENT',
      safeMessage || 'WeCom rejected an identifier or request argument.',
      code
    )
  }
  if ([45009, 45011].includes(code)) {
    return new WeComConnectorError('RATE_LIMITED', 'WeCom rate limited this request. Retry later.', code, true)
  }
  return new WeComConnectorError(
    'PROVIDER_REJECTED',
    safeMessage || `WeCom rejected the request with provider code ${code}.`,
    code
  )
}

function sanitizeProviderMessage(value?: string) {
  if (!value) return undefined
  return value
    .replace(/access_token=[^\s&]+/gi, 'access_token=[redacted]')
    .replace(/\bww[A-Za-z0-9_-]{16,}\b/g, '[redacted]')
    .slice(0, 300)
}
