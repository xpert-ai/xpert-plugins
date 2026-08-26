export type NeteaseMailErrorCode =
  | 'MAIL_PROVIDER_UNSUPPORTED'
  | 'MAIL_AUTH_FAILED'
  | 'MAIL_IMAP_DISABLED'
  | 'MAIL_SMTP_DISABLED'
  | 'MAIL_CONNECTION_TIMEOUT'
  | 'MAIL_MESSAGE_NOT_FOUND'
  | 'MAIL_REFERENCE_INVALID'
  | 'MAIL_REFERENCE_STALE'
  | 'MAIL_QUERY_INVALID'
  | 'MAIL_ATTACHMENT_NOT_FOUND'
  | 'MAIL_ATTACHMENT_TOO_LARGE'
  | 'MAIL_SEND_REJECTED'
  | 'MAIL_DELIVERY_UNKNOWN'
  | 'MAIL_CONFIRMATION_INVALID'
  | 'MAIL_CONFIRMATION_EXPIRED'
  | 'MAIL_RUNTIME_UNAVAILABLE'

export class NeteaseMailError extends Error {
  constructor(readonly code: NeteaseMailErrorCode, message: string, options?: ErrorOptions) {
    super(`[${code}] ${message}`, options)
    this.name = 'NeteaseMailError'
  }
}

export function normalizeMailConnectionError(error: unknown, protocol: 'imap' | 'smtp'): NeteaseMailError {
  if (error instanceof NeteaseMailError) {
    return error
  }

  const code = readErrorString(error, 'code').toUpperCase()
  const responseCode = readErrorNumber(error, 'responseCode')
  const response = readErrorString(error, 'response').toUpperCase()
  const message = error instanceof Error ? error.message.toUpperCase() : ''

  if (
    code === 'EAUTH' ||
    code === 'AUTHENTICATIONFAILED' ||
    responseCode === 535 ||
    response.includes('AUTHENTICATIONFAILED') ||
    message.includes('AUTHENTICATION FAILED')
  ) {
    return new NeteaseMailError(
      'MAIL_AUTH_FAILED',
      'The mailbox address or client authorization code was rejected.',
      error instanceof Error ? { cause: error } : undefined
    )
  }

  if (code === 'CONNECT_TIMEOUT' || code === 'ETIMEDOUT' || message.includes('TIMEOUT')) {
    return new NeteaseMailError(
      'MAIL_CONNECTION_TIMEOUT',
      `The ${protocol.toUpperCase()} server did not respond before the connection timeout.`,
      error instanceof Error ? { cause: error } : undefined
    )
  }

  return new NeteaseMailError(
    protocol === 'imap' ? 'MAIL_IMAP_DISABLED' : 'MAIL_SMTP_DISABLED',
    protocol === 'imap'
      ? 'IMAP access is unavailable. Enable IMAP/SMTP in NetEase Mail and create a client authorization code.'
      : 'SMTP access is unavailable. Enable IMAP/SMTP in NetEase Mail and create a client authorization code.',
    error instanceof Error ? { cause: error } : undefined
  )
}

export function isUncertainSmtpDelivery(error: unknown): boolean {
  const command = readErrorString(error, 'command').toUpperCase()
  const code = readErrorString(error, 'code').toUpperCase()
  return command === 'DATA' && (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET')
}

export function normalizeMailSendError(error: unknown): NeteaseMailError {
  const normalized = normalizeMailConnectionError(error, 'smtp')
  if (normalized.code === 'MAIL_AUTH_FAILED' || normalized.code === 'MAIL_CONNECTION_TIMEOUT') {
    return normalized
  }

  const code = readErrorString(error, 'code').toUpperCase()
  const responseCode = readErrorNumber(error, 'responseCode')
  if (code === 'EENVELOPE' || code === 'EMESSAGE' || (responseCode !== undefined && responseCode >= 400)) {
    return new NeteaseMailError(
      'MAIL_SEND_REJECTED',
      'The SMTP server rejected the email or its recipients.',
      error instanceof Error ? { cause: error } : undefined
    )
  }
  return normalized
}

function readErrorString(error: unknown, key: string): string {
  if (!isRecord(error)) {
    return ''
  }
  const value = error[key]
  return typeof value === 'string' ? value : ''
}

function readErrorNumber(error: unknown, key: string): number | undefined {
  if (!isRecord(error)) {
    return undefined
  }
  const value = error[key]
  return typeof value === 'number' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
