import { Inject, Injectable, Logger } from '@nestjs/common'
import type { LarkSsoPluginConfig } from './plugin-config.js'
import { LARK_SSO_PLUGIN_CONFIG } from './tokens.js'
import { LarkSsoError, type LarkOAuthProfile } from './types.js'

const FEISHU_AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize'
const FEISHU_ACCESS_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token'
const FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info'

@Injectable()
export class LarkOAuthService {
  private readonly logger = new Logger(LarkOAuthService.name)

  constructor(
    @Inject(LARK_SSO_PLUGIN_CONFIG)
    private readonly config: LarkSsoPluginConfig
  ) {}

  buildAuthorizeUrl(options: { redirectUri: string; state: string }): string {
    const url = new URL(FEISHU_AUTHORIZE_URL)
    url.searchParams.set('app_id', this.config.appId)
    url.searchParams.set('redirect_uri', options.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('state', options.state)
    return url.toString()
  }

  async exchangeCodeForAccessToken(options: {
    code: string
    redirectUri: string
  }): Promise<string> {
    const body = JSON.stringify({
      grant_type: 'authorization_code',
      code: options.code,
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: options.redirectUri
    })

    const response = await this.fetchJson(FEISHU_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json; charset=utf-8'
      },
      body
    })

    const payload = this.unwrapPayload(response)
    const accessToken = this.readString(payload, ['access_token'])
    if (!accessToken) {
      throw new LarkSsoError('oauth_failed', 'Feishu OAuth token response did not include access_token.')
    }

    return accessToken
  }

  async fetchUserProfile(accessToken: string): Promise<LarkOAuthProfile> {
    const response = await this.fetchJson(FEISHU_USER_INFO_URL, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`
      }
    })

    const payload = this.unwrapPayload(response)
    return {
      unionId: this.readString(payload, ['union_id', 'unionId']),
      openId: this.readString(payload, ['open_id', 'openId']),
      name: this.readString(payload, ['name']),
      avatarUrl:
        this.readString(payload, ['avatar_url', 'avatarUrl']) ??
        this.readNestedString(payload, ['avatar', 'avatar_240']) ??
        this.readNestedString(payload, ['avatar', 'middle'])
    }
  }

  private async fetchJson(
    url: string,
    init: RequestInit
  ): Promise<Record<string, unknown>> {
    const isTokenEndpoint = url === FEISHU_ACCESS_TOKEN_URL
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error) {
      throw new LarkSsoError('oauth_failed', 'Failed to reach Feishu OAuth endpoint.', 400, error)
    }

    let responseText = ''
    try {
      responseText = await response.text()
    } catch (error) {
      if (isTokenEndpoint) {
        this.logger.error('[lark-oauth] token response body could not be read.')
      }
      throw new LarkSsoError('oauth_failed', 'Failed to read Feishu OAuth response body.', 400, error)
    }

    let json: unknown
    try {
      json = responseText ? JSON.parse(responseText) : {}
    } catch (error) {
      if (isTokenEndpoint) {
        this.logger.error(
          `[lark-oauth] token response is not JSON status=${response.status} body=${this.truncateForLog(responseText)}`
        )
      }
      throw new LarkSsoError('oauth_failed', 'Feishu OAuth response is not valid JSON.', 400, error)
    }

    if (!response.ok) {
      if (isTokenEndpoint) {
        this.logger.error(
          `[lark-oauth] token request failed status=${response.status} body=${this.truncateForLog(responseText)}`
        )
      }
      const message =
        this.readString(json, ['error_description', 'msg', 'message']) ??
        `Feishu OAuth request failed with HTTP ${response.status}.`
      throw new LarkSsoError('oauth_failed', message)
    }

    if (this.readNumber(json, ['code']) && this.readNumber(json, ['code']) !== 0) {
      if (isTokenEndpoint) {
        this.logger.error(
          `[lark-oauth] token request returned non-zero code body=${this.truncateForLog(responseText)}`
        )
      }
      const message =
        this.readString(json, ['error_description', 'msg', 'message']) ??
        'Feishu OAuth returned a non-zero code.'
      throw new LarkSsoError('oauth_failed', message)
    }

    return this.asRecord(json)
  }

  private unwrapPayload(value: unknown): Record<string, unknown> {
    const root = this.asRecord(value)
    const data = this.asRecord(root.data)
    return Object.keys(data).length > 0 ? data : root
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {}
    }
    return value as Record<string, unknown>
  }

  private readString(value: unknown, keys: string[]): string | null {
    const record = this.asRecord(value)
    for (const key of keys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate
      }
    }
    return null
  }

  private readNestedString(value: unknown, keys: string[]): string | null {
    let current: unknown = value
    for (const key of keys) {
      current = this.asRecord(current)[key]
      if (current === undefined) {
        return null
      }
    }

    return typeof current === 'string' && current.trim().length > 0 ? current : null
  }

  private readNumber(value: unknown, keys: string[]): number | null {
    const record = this.asRecord(value)
    for (const key of keys) {
      const candidate = record[key]
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate
      }
    }
    return null
  }

  private truncateForLog(value: string, maxLength = 1200) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...<truncated>` : value
  }
}
