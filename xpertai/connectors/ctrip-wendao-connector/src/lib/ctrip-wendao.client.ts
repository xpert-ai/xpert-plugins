import { Injectable } from '@nestjs/common'
import {
  CTRIP_WENDAO_API_URL,
  CTRIP_WENDAO_CONNECT_TEST_QUERY,
  CTRIP_WENDAO_MAX_QUERY_LENGTH,
  CTRIP_WENDAO_MAX_RESPONSE_BYTES,
  CTRIP_WENDAO_MAX_RESULT_CHARS,
  CTRIP_WENDAO_REQUEST_TIMEOUT_MS
} from './constants.js'
import { CtripWendaoError } from './errors.js'
import type { CtripWendaoQueryResult } from './types.js'

@Injectable()
export class CtripWendaoClient {
  async validateCredential(apiToken: string): Promise<void> {
    await this.query(apiToken, CTRIP_WENDAO_CONNECT_TEST_QUERY)
  }

  async query(apiToken: string, query: string): Promise<CtripWendaoQueryResult> {
    const token = readRequiredString(apiToken, 'Ctrip Wendao API Token', 4_096)
    const normalizedQuery = readRequiredString(query, 'Travel query', CTRIP_WENDAO_MAX_QUERY_LENGTH)
    return requestWithTimeout(
      CTRIP_WENDAO_API_URL,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Xpert-Ctrip-Wendao-Connector/0.1.0'
        },
        body: JSON.stringify({ inputs: { token, query: normalizedQuery } }),
        redirect: 'error'
      },
      CTRIP_WENDAO_REQUEST_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined)
          throw httpStatusError(response.status)
        }
        const payload = await readBoundedJson(response, CTRIP_WENDAO_MAX_RESPONSE_BYTES)
        return extractQueryResult(payload)
      }
    )
  }
}

async function requestWithTimeout<TResult>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  handleResponse: (response: Response) => Promise<TResult>
): Promise<TResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return await handleResponse(response)
  } catch (error) {
    if (error instanceof CtripWendaoError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CtripWendaoError('WENDAO_TIMEOUT', 'Ctrip Wendao did not respond before the request timeout.', true)
    }
    throw new CtripWendaoError('WENDAO_UPSTREAM_UNAVAILABLE', 'Ctrip Wendao is currently unavailable.', true)
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = readPositiveInteger(response.headers.get('content-length'))
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw responseTooLargeError()
  }
  if (!response.body) {
    throw invalidResponseError()
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let byteLength = 0
  let text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      byteLength += part.value.byteLength
      if (byteLength > maxBytes) {
        await reader.cancel()
        throw responseTooLargeError()
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) {
      throw invalidResponseError()
    }
    return parsed
  } catch (error) {
    if (error instanceof CtripWendaoError) throw error
    throw invalidResponseError()
  }
}

function extractQueryResult(payload: Record<string, unknown>): CtripWendaoQueryResult {
  const topLevelError = readNonEmptyString(payload.error)
  if (topLevelError) {
    throw businessError(topLevelError)
  }

  const result = payload.result
  if (typeof result === 'string') {
    const content = result.trim()
    if (!content) throw invalidResponseError()

    const nested = parseJsonObject(content)
    const nestedError = nested ? readNonEmptyString(nested.error) : undefined
    if (nestedError) {
      throw businessError(nestedError)
    }
    return boundedResult(content)
  }

  if (isRecord(result)) {
    const nestedError = readNonEmptyString(result.error)
    if (nestedError) throw businessError(nestedError)
    const content = readNonEmptyString(result.content)
    if (content) return boundedResult(content)
  }

  throw invalidResponseError()
}

function boundedResult(content: string): CtripWendaoQueryResult {
  if (content.length > CTRIP_WENDAO_MAX_RESULT_CHARS) {
    throw responseTooLargeError()
  }
  return { content, format: 'markdown' }
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  if (!value.startsWith('{') || !value.endsWith('}')) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function businessError(message: string): CtripWendaoError {
  const normalized = message.trim().toLowerCase()
  if (normalized === 'invalid token.' || normalized === 'invalid token') {
    return new CtripWendaoError('WENDAO_AUTH_INVALID', 'The Ctrip Wendao API Token is invalid or expired.')
  }
  return new CtripWendaoError('WENDAO_QUERY_REJECTED', 'Ctrip Wendao rejected the travel query.')
}

function httpStatusError(status: number): CtripWendaoError {
  if (status === 401 || status === 403) {
    return new CtripWendaoError('WENDAO_AUTH_INVALID', 'The Ctrip Wendao API Token is invalid or expired.')
  }
  if (status === 429) {
    return new CtripWendaoError('WENDAO_RATE_LIMITED', 'Ctrip Wendao rate-limited the request.', true)
  }
  if (status >= 500) {
    return new CtripWendaoError('WENDAO_UPSTREAM_UNAVAILABLE', 'Ctrip Wendao is currently unavailable.', true)
  }
  return new CtripWendaoError('WENDAO_QUERY_REJECTED', 'Ctrip Wendao rejected the travel query.')
}

function readRequiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new CtripWendaoError('WENDAO_QUERY_REJECTED', `${label} is required.`)
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    throw new CtripWendaoError('WENDAO_QUERY_REJECTED', `${label} exceeds the supported length.`)
  }
  return normalized
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined
  return parsed !== undefined && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function responseTooLargeError(): CtripWendaoError {
  return new CtripWendaoError('WENDAO_RESPONSE_TOO_LARGE', 'Ctrip Wendao returned a response above the safe limit.')
}

function invalidResponseError(): CtripWendaoError {
  return new CtripWendaoError('WENDAO_INVALID_RESPONSE', 'Ctrip Wendao returned an invalid response.')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
