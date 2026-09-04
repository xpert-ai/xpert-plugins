import { Injectable } from '@nestjs/common'
import {
  BAIDU_NETDISK_AUTHORIZE_URL,
  BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES,
  BAIDU_NETDISK_DEFAULT_TIMEOUT_MS,
  BAIDU_NETDISK_TOKEN_URL
} from '../constants.js'
import { BaiduNetdiskConnectorError, errorMessage, readString, requireString } from '../errors.js'
import type { BaiduNetdiskOAuthConfig } from '../plugin-config.js'
import type { BaiduNetdiskOAuthToken } from '../client/types.js'
import { readBoundedJsonObject } from '../services/bounded-json-response.js'

@Injectable()
export class BaiduNetdiskOAuthClient {
  buildAuthorizationUrl(
    config: BaiduNetdiskOAuthConfig,
    input: {
      redirectUri: string
      state: string
      scopes: string[]
    }
  ): string {
    const url = new URL(config.authorizationUrl || BAIDU_NETDISK_AUTHORIZE_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', config.appKey)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('scope', input.scopes.join(','))
    url.searchParams.set('state', input.state)
    url.searchParams.set('qrcode', '1')
    return url.toString()
  }

  async exchangeCode(
    config: BaiduNetdiskOAuthConfig,
    code: string,
    redirectUri: string
  ): Promise<BaiduNetdiskOAuthToken> {
    return this.request(config, {
      grant_type: 'authorization_code',
      code,
      client_id: config.appKey,
      client_secret: config.secretKey,
      redirect_uri: redirectUri
    })
  }

  async refresh(config: BaiduNetdiskOAuthConfig, refreshToken: string): Promise<BaiduNetdiskOAuthToken> {
    return this.request(config, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.appKey,
      client_secret: config.secretKey
    })
  }

  private async request(
    config: BaiduNetdiskOAuthConfig,
    values: Record<string, string>
  ): Promise<BaiduNetdiskOAuthToken> {
    const url = new URL(config.tokenUrl || BAIDU_NETDISK_TOKEN_URL)
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? BAIDU_NETDISK_DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'Xpert-Baidu-Netdisk-Connector/0.1.0' },
        redirect: 'error',
        signal: controller.signal
      })
      const body = await readBoundedJsonObject(
        response,
        config.responseMaxBytes ?? BAIDU_NETDISK_DEFAULT_RESPONSE_MAX_BYTES,
        'Baidu OAuth'
      )
      if (!response.ok || readString(body?.error)) {
        const code = readString(body?.error)
        const message =
          readString(body?.error_description) ?? readString(body?.error_msg) ?? 'Baidu OAuth request failed.'
        throw new BaiduNetdiskConnectorError(
          code === 'access_denied' ? 'OAUTH_ACCESS_DENIED' : 'OAUTH_EXCHANGE_FAILED',
          message,
          false,
          code
        )
      }
      return parseToken(body)
    } catch (error) {
      if (error instanceof BaiduNetdiskConnectorError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BaiduNetdiskConnectorError('UPSTREAM_TIMEOUT', 'Baidu OAuth request timed out.', true)
      }
      throw new BaiduNetdiskConnectorError(
        'OAUTH_EXCHANGE_FAILED',
        `Baidu OAuth request failed: ${errorMessage(error)}`
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

function parseToken(value: Record<string, unknown> | undefined): BaiduNetdiskOAuthToken {
  const accessToken = requireString(value?.access_token, 'Baidu OAuth response did not include access_token.')
  const refreshToken = requireString(value?.refresh_token, 'Baidu OAuth response did not include refresh_token.')
  const expiresIn = readPositiveInteger(value?.expires_in) ?? 30 * 24 * 60 * 60
  const refreshExpiresIn = readPositiveInteger(value?.refresh_token_expires_in)
  return {
    accessToken,
    refreshToken,
    expiresIn,
    ...(refreshExpiresIn ? { refreshExpiresIn } : {}),
    tokenType: (readString(value?.token_type) ?? 'Bearer').toLowerCase(),
    ...(readString(value?.uid) ? { userId: readString(value?.uid) } : {})
  }
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
  }
  return undefined
}
