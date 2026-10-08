import { Injectable } from '@nestjs/common'
import {
  KDOCS_AUTH_REQUEST_TIMEOUT_MS,
  KDOCS_AUTH_RESPONSE_MAX_BYTES,
  KDOCS_SKILLHUB_EXCHANGE_URL
} from './constants.js'
import { errorMessage, KdocsConnectorError } from './errors.js'

export type KdocsSkillHubExchangeResult =
  | { status: 'pending' }
  | { status: 'complete'; accessToken: string; expiresIn?: number }
  | { status: 'error'; message: string }

@Injectable()
export class KdocsSkillHubAuthClient {
  async exchange(code: string): Promise<KdocsSkillHubExchangeResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), KDOCS_AUTH_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(KDOCS_SKILLHUB_EXCHANGE_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Xpert-KDocs-Connector'
        },
        body: JSON.stringify({ code }),
        redirect: 'error',
        signal: controller.signal
      })
      const body = await readBoundedJson(response)
      const responseCode = readCode(body?.code)
      if (responseCode === '202') return { status: 'pending' }

      const token = readString(readObject(body?.data)?.token) ?? readString(body?.token)
      if (responseCode === '200' && token) {
        return {
          status: 'complete',
          accessToken: normalizeBearerToken(token),
          expiresIn: readPositiveInteger(readObject(body?.data)?.expires_in) ?? readPositiveInteger(body?.expires_in)
        }
      }

      if (responseCode === '400006' || response.status === 401 || response.status === 403) {
        return { status: 'error', message: 'WPS authorization was rejected or has expired' }
      }
      if (!response.ok) {
        return { status: 'error', message: `WPS authorization exchange failed with status ${response.status}` }
      }
      return {
        status: 'error',
        message: providerMessage(body) ?? 'WPS authorization exchange returned an unsupported response'
      }
    } catch (error) {
      if (error instanceof KdocsConnectorError) throw error
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'WPS authorization exchange timed out'
        : `WPS authorization exchange failed: ${errorMessage(error)}`
      throw new KdocsConnectorError('AUTHORIZATION_FAILED', message, true)
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown> | undefined> {
  const contentLength = readPositiveInteger(response.headers.get('content-length'))
  if (contentLength && contentLength > KDOCS_AUTH_RESPONSE_MAX_BYTES) {
    throw new KdocsConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization response is too large')
  }
  if (!response.body) return undefined
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > KDOCS_AUTH_RESPONSE_MAX_BYTES) {
        await reader.cancel()
        throw new KdocsConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization response is too large')
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  if (!text.trim()) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new KdocsConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization response is not valid JSON')
  }
  return readObject(parsed)
}

function normalizeBearerToken(value: string) {
  const match = value.match(/^Bearer\s+(.+)$/i)
  const token = (match?.[1] ?? value).trim()
  if (!token) throw new KdocsConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization token is empty')
  return token
}

function providerMessage(value: Record<string, unknown> | undefined) {
  return readString(value?.msg) ?? readString(value?.message) ?? readString(readObject(value?.data)?.message)
}

function readCode(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return readString(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readPositiveInteger(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
