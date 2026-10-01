export type CtripWendaoErrorCode =
  | 'WENDAO_AUTH_INVALID'
  | 'WENDAO_RATE_LIMITED'
  | 'WENDAO_TIMEOUT'
  | 'WENDAO_UPSTREAM_UNAVAILABLE'
  | 'WENDAO_QUERY_REJECTED'
  | 'WENDAO_INVALID_RESPONSE'
  | 'WENDAO_RESPONSE_TOO_LARGE'
  | 'WENDAO_RUNTIME_UNAVAILABLE'

export class CtripWendaoError extends Error {
  constructor(
    readonly code: CtripWendaoErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions
  ) {
    super(`[${code}] ${message}`, options)
    this.name = 'CtripWendaoError'
  }
}
