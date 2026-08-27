import { Injectable } from '@nestjs/common'
import {
  WPS_AUTH_REQUEST_TIMEOUT_MS,
  WPS_DEFAULT_RESPONSE_MAX_BYTES,
  WPS_KWIKI_SKILL_VERSION,
  WPS_SKILLHUB_CODE_URL,
  WPS_SKILLHUB_EXCHANGE_URL
} from './constants.js'
import { errorMessage, WpsKnowledgeConnectorError } from './errors.js'

export type WpsSkillHubExchangeResult =
  | { status: 'pending' }
  | {
      status: 'complete'
      accessToken: string
      expiresIn?: number
      profile?: { userId?: string; name?: string; avatarUrl?: string }
    }
  | { status: 'error'; message: string }

@Injectable()
export class WpsSkillHubAuthClient {
  async generateCode(): Promise<string> {
    const response = await this.request(WPS_SKILLHUB_CODE_URL, {})
    const code = readString(readObject(response.body.data)?.code)
    if (!response.ok || readCode(response.body.code) !== '0' || !code) {
      throw new WpsKnowledgeConnectorError(
        'AUTHORIZATION_RESPONSE_INVALID',
        providerMessage(response.body) ?? 'WPS did not return a SkillHub authorization code.'
      )
    }
    return code
  }

  async exchange(code: string): Promise<WpsSkillHubExchangeResult> {
    const response = await this.request(WPS_SKILLHUB_EXCHANGE_URL, { code })
    const body = response.body
    if (response.status === 202 || /waiting for login/i.test(providerMessage(body) ?? '')) {
      return { status: 'pending' }
    }
    const data = readObject(body.data) ?? {}
    const token = readString(data.access_token) ?? readString(data.token) ?? readString(body.access_token) ?? readString(body.token)
    if (response.ok && readCode(body.code) === '0' && token) {
      const user = readObject(data.user) ?? readObject(data.profile)
      return {
        status: 'complete',
        accessToken: normalizeToken(token),
        expiresIn: readPositiveInteger(data.expires_in) ?? readPositiveInteger(body.expires_in),
        profile: user ? {
          userId: readString(user.user_id) ?? readString(user.id),
          name: readString(user.name) ?? readString(user.user_name),
          avatarUrl: safeWpsUrl(readString(user.avatar_url) ?? readString(user.avatar))
        } : undefined
      }
    }
    const codeClass = providerCodeClass(body.code)
    if (response.status === 401 || response.status === 403 || codeClass === 401 || codeClass === 403) {
      return { status: 'error', message: 'WPS authorization was rejected or has expired.' }
    }
    if (!response.ok) {
      return { status: 'error', message: `WPS authorization exchange failed with status ${response.status}.` }
    }
    return { status: 'error', message: providerMessage(body) ?? 'WPS authorization exchange returned an unsupported response.' }
  }

  private async request(url: string, body: Record<string, unknown>) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WPS_AUTH_REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Xpert-WPS-Knowledge-Connector',
          'X-Kwiki-Cli-Ver': WPS_KWIKI_SKILL_VERSION
        },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal
      })
      return {
        ok: response.ok,
        status: response.status,
        body: await readBoundedJson(response, WPS_DEFAULT_RESPONSE_MAX_BYTES)
      }
    } catch (error) {
      if (error instanceof WpsKnowledgeConnectorError) throw error
      const timedOut = error instanceof DOMException && error.name === 'AbortError'
      throw new WpsKnowledgeConnectorError(
        timedOut ? 'REQUEST_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
        timedOut ? 'WPS authorization request timed out.' : `WPS authorization request failed: ${errorMessage(error)}`,
        true
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<Record<string, unknown>> {
  const contentLength = readPositiveInteger(response.headers.get('content-length'))
  if (contentLength && contentLength > maxBytes) {
    throw new WpsKnowledgeConnectorError('RESPONSE_TOO_LARGE', 'WPS authorization response is too large.')
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
        throw new WpsKnowledgeConnectorError('RESPONSE_TOO_LARGE', 'WPS authorization response is too large.')
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
    return readObject(parsed) ?? {}
  } catch {
    throw new WpsKnowledgeConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization response is not valid JSON.')
  }
}

function normalizeToken(value: string): string {
  const match = value.match(/^Bearer\s+(.+)$/i)
  const token = (match?.[1] ?? value).trim()
  if (!token) throw new WpsKnowledgeConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization token is empty.')
  return token
}

function safeWpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !isWpsHost(url.hostname)) return undefined
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function isWpsHost(hostname: string): boolean {
  return ['wps.cn', 'kdocs.cn', 'wpscdn.cn'].some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
}

function providerMessage(value: Record<string, unknown>): string | undefined {
  return readString(value.msg) ?? readString(value.message) ?? readString(readObject(value.data)?.message)
}

function providerCodeClass(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) && number >= 100_000_000 ? Math.floor(number / 1_000_000) : null
}

function readCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return readString(value)
}

function readPositiveInteger(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isSafeInteger(number) && number > 0 ? number : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
