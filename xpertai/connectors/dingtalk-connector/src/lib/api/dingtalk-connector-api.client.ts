import { Injectable } from '@nestjs/common'

const API_BASE_URL = 'https://api.dingtalk.com'
const REQUEST_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_SKEW_SECONDS = 120

export type DingTalkAppCredential = {
  integrationId: string
  clientId: string
  clientSecret: string
}

@Injectable()
export class DingTalkConnectorApiClient {
  private readonly appTokens = new Map<string, { token: string; expiresAt: number }>()

  async getAppAccessToken(credential: DingTalkAppCredential): Promise<string> {
    const cached = this.appTokens.get(credential.integrationId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token
    }

    const payload = await this.request(`${API_BASE_URL}/v1.0/oauth2/accessToken`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ appKey: credential.clientId, appSecret: credential.clientSecret })
    })
    const token = requireString(
      payload,
      ['accessToken', 'access_token'],
      'DingTalk app token response is missing accessToken'
    )
    const expiresIn = readNumber(payload, ['expireIn', 'expiresIn', 'expires_in']) ?? 7_200
    this.appTokens.set(credential.integrationId, {
      token,
      expiresAt: Date.now() + Math.max(300, expiresIn - TOKEN_REFRESH_SKEW_SECONDS) * 1_000
    })
    return token
  }

  clear() {
    this.appTokens.clear()
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    } catch (error) {
      throw new Error(`DingTalk request failed: ${errorMessage(error)}`)
    }

    let payload: unknown
    try {
      const text = await response.text()
      payload = text ? JSON.parse(text) : {}
    } catch {
      throw new Error('DingTalk returned an invalid JSON response')
    }
    const record = readRecord(payload) ?? {}
    if (!response.ok) {
      const message = readString(record, ['message', 'errmsg', 'msg']) ?? `HTTP ${response.status}`
      throw new Error(`DingTalk request failed: ${message}`)
    }
    return record
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown, keys: string[]): string | null {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return null
}

function requireString(value: unknown, keys: string[], message: string) {
  const result = readString(value, keys)
  if (!result) throw new Error(message)
  return result
}

function readNumber(value: unknown, keys: string[]): number | null {
  const record = readRecord(value)
  for (const key of keys) {
    const candidate = record?.[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
    if (typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate)))
      return Number(candidate)
  }
  return null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
