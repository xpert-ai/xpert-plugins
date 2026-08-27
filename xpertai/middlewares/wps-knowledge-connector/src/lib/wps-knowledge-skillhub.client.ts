import { Injectable } from '@nestjs/common'
import {
  WPS_DEFAULT_REQUEST_TIMEOUT_MS,
  WPS_DEFAULT_RESPONSE_MAX_BYTES,
  WPS_DEFAULT_SSE_IDLE_TIMEOUT_MS,
  WPS_DEFAULT_SSE_MAX_BYTES,
  WPS_DEFAULT_SSE_TIMEOUT_MS,
  WPS_KWIKI_SKILL_VERSION,
  WPS_SKILLHUB_API_BASE_URL
} from './constants.js'
import { WpsKnowledgeConnectorError } from './errors.js'
import { parseWpsSse, type WpsSseEvent } from './sse-parser.js'

export type WpsKnowledgeRuntimeCredential = { accessToken: string }

@Injectable()
export class WpsKnowledgeSkillHubClient {
  async getJson(
    credential: WpsKnowledgeRuntimeCredential,
    path: string,
    query: Record<string, string | number | boolean | undefined>
  ): Promise<Record<string, unknown>> {
    const url = buildUrl(path, query)
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: requestHeaders(credential.accessToken, 'application/json'),
      redirect: 'error'
    }, WPS_DEFAULT_REQUEST_TIMEOUT_MS)
    const payload = await readBoundedJson(response, WPS_DEFAULT_RESPONSE_MAX_BYTES)
    assertProviderSuccess(response, payload)
    return payload
  }

  async postSse(
    credential: WpsKnowledgeRuntimeCredential,
    path: string,
    body: Record<string, unknown>
  ): Promise<AsyncGenerator<WpsSseEvent>> {
    const response = await fetchWithTimeout(buildUrl(path, {}), {
      method: 'POST',
      headers: requestHeaders(credential.accessToken, 'text/event-stream'),
      body: JSON.stringify(body),
      redirect: 'error'
    }, WPS_DEFAULT_SSE_TIMEOUT_MS)
    if (!response.ok) {
      const payload = await readBoundedJson(response, WPS_DEFAULT_RESPONSE_MAX_BYTES)
      throw providerError(response.status, payload.code)
    }
    if (!response.body) {
      throw new WpsKnowledgeConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS Knowledge stream has no body.')
    }
    return parseWpsSse(response.body, {
      maxBytes: WPS_DEFAULT_SSE_MAX_BYTES,
      totalTimeoutMs: WPS_DEFAULT_SSE_TIMEOUT_MS,
      idleTimeoutMs: WPS_DEFAULT_SSE_IDLE_TIMEOUT_MS
    })
  }
}

function requestHeaders(accessToken: string, accept: string): Record<string, string> {
  return {
    Accept: accept,
    'Content-Type': 'application/json',
    'User-Agent': 'Xpert-WPS-Knowledge-Connector',
    'X-Kwiki-Auth': accessToken,
    'X-Kwiki-Cli-Ver': WPS_KWIKI_SKILL_VERSION
  }
}

function buildUrl(path: string, query: Record<string, string | number | boolean | undefined>): string {
  if (!/^[a-z_]+(?:\/[a-z_]+)*$/.test(path)) {
    throw new WpsKnowledgeConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS Knowledge SkillHub path is invalid.')
  }
  const url = new URL(path, WPS_SKILLHUB_API_BASE_URL)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    throw new WpsKnowledgeConnectorError(
      timedOut ? 'REQUEST_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
      timedOut ? 'WPS Knowledge request timed out.' : 'WPS Knowledge request failed.',
      true
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = positiveInteger(response.headers.get('content-length'))
  if (contentLength && contentLength > maxBytes) {
    throw new WpsKnowledgeConnectorError('RESPONSE_TOO_LARGE', 'WPS Knowledge response is too large.')
  }
  if (!response.body) return {}
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new WpsKnowledgeConnectorError('RESPONSE_TOO_LARGE', 'WPS Knowledge response is too large.')
      }
      body += decoder.decode(part.value, { stream: true })
    }
    body += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  if (!body.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(body)
    return isObject(parsed) ? parsed : {}
  } catch {
    throw new WpsKnowledgeConnectorError('PROVIDER_RESPONSE_INVALID', 'WPS Knowledge response is not valid JSON.')
  }
}

function assertProviderSuccess(response: Response, payload: Record<string, unknown>): void {
  if (!response.ok) throw providerError(response.status, payload.code)
  if (payload.code === undefined || payload.code === 0 || payload.code === '0') return
  throw providerError(response.status, payload.code)
}

function providerError(status: number, code: unknown): WpsKnowledgeConnectorError {
  const codeClass = providerCodeClass(code)
  if (status === 401 || codeClass === 401) {
    return new WpsKnowledgeConnectorError('TOKEN_EXPIRED', 'WPS Knowledge SkillHub authorization has expired.')
  }
  if (status === 403 || codeClass === 403) {
    return new WpsKnowledgeConnectorError('PERMISSION_DENIED', 'WPS denied access to the requested knowledge resource.')
  }
  if (status === 429 || codeClass === 429) {
    return new WpsKnowledgeConnectorError('RATE_LIMITED', 'WPS Knowledge request was rate limited.', true)
  }
  const unavailable = status >= 500 || (codeClass !== null && codeClass >= 500)
  return new WpsKnowledgeConnectorError(
    unavailable ? 'PROVIDER_UNAVAILABLE' : 'PROVIDER_RESPONSE_INVALID',
    `WPS Knowledge request failed with status ${status}.`,
    unavailable
  )
}

function providerCodeClass(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) && number >= 100_000_000 ? Math.floor(number / 1_000_000) : null
}

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
