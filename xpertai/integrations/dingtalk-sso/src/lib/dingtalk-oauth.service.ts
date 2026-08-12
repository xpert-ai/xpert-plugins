import { Injectable, Logger } from '@nestjs/common'
import { DingTalkSsoError, type DingTalkOAuthProfile } from './types.js'

export const DINGTALK_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth'
export const DINGTALK_USER_ACCESS_TOKEN_URL =
  'https://api.dingtalk.com/v1.0/oauth2/userAccessToken'
export const DINGTALK_CURRENT_USER_URL = 'https://api.dingtalk.com/v1.0/contact/users/me'

const REQUEST_TIMEOUT_MS = 15_000

@Injectable()
export class DingTalkOAuthService {
  private readonly logger = new Logger(DingTalkOAuthService.name)

  buildAuthorizeUrl(options: { clientId: string; redirectUri: string; state: string }): string {
    const url = new URL(DINGTALK_AUTHORIZE_URL)
    url.searchParams.set('redirect_uri', options.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', options.clientId)
    url.searchParams.set('scope', 'openid')
    url.searchParams.set('state', options.state)
    url.searchParams.set('prompt', 'consent')
    return url.toString()
  }

  async exchangeCodeForAccessToken(options: { clientId: string; clientSecret: string; code: string }): Promise<string> {
    const payload = await this.fetchJson(DINGTALK_USER_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        code: options.code,
        grantType: 'authorization_code'
      })
    })

    const accessToken = this.readString(payload, ['accessToken', 'access_token'])
    if (!accessToken) {
      throw new DingTalkSsoError(
        'oauth_failed',
        'DingTalk OAuth token response did not include accessToken.'
      )
    }
    return accessToken
  }

  async fetchUserProfile(accessToken: string): Promise<DingTalkOAuthProfile> {
    const payload = await this.fetchJson(DINGTALK_CURRENT_USER_URL, {
      headers: {
        accept: 'application/json',
        'x-acs-dingtalk-access-token': accessToken
      }
    })

    return {
      unionId: this.readString(payload, ['unionId', 'union_id']),
      openId: this.readString(payload, ['openId', 'open_id']),
      name: this.readString(payload, ['nick', 'name']),
      avatarUrl: this.readString(payload, ['avatarUrl', 'avatar_url'])
    }
  }

  private async fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      throw new DingTalkSsoError('oauth_failed', 'Failed to reach DingTalk OAuth endpoint.', 400, error)
    }

    let responseText: string
    try {
      responseText = await response.text()
    } catch (error) {
      throw new DingTalkSsoError('oauth_failed', 'Failed to read DingTalk OAuth response.', 400, error)
    }

    let payload: unknown
    try {
      payload = responseText ? JSON.parse(responseText) : {}
    } catch (error) {
      this.logger.error(
        `[dingtalk-sso] non-JSON response status=${response.status} body=${this.truncate(responseText)}`
      )
      throw new DingTalkSsoError('oauth_failed', 'DingTalk returned an invalid JSON response.', 400, error)
    }

    if (!response.ok) {
      const message =
        this.readString(payload, ['message', 'error_description', 'errmsg']) ??
        `DingTalk OAuth request failed with HTTP ${response.status}.`
      throw new DingTalkSsoError('oauth_failed', message)
    }

    return this.asRecord(payload)
  }

  private readString(value: unknown, keys: string[]): string | null {
    const record = this.asRecord(value)
    for (const key of keys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }
    return null
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  }

  private truncate(value: string, maxLength = 1200): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...<truncated>` : value
  }
}
