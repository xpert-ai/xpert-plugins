import { Injectable } from '@nestjs/common'
import {
  QQ_MAIL_AUTHORIZATION_METADATA_URL,
  QQ_MAIL_AUTHORIZATION_URL,
  QQ_MAIL_ISSUER,
  QQ_MAIL_REGISTRATION_URL,
  QQ_MAIL_RESOURCE,
  QQ_MAIL_RESOURCE_METADATA_URL,
  QQ_MAIL_TOKEN_URL
} from '../constants.js'
import { errorMessage, QqMailConnectorError } from '../errors.js'

export type QqMailOAuthMetadata = {
  resource: string
  authorizationEndpoint: string
  tokenEndpoint: string
  registrationEndpoint: string
}

export type QqMailToken = {
  accessToken: string
  tokenType: string
  refreshToken?: string
  expiresIn?: number
  refreshExpiresIn?: number
  scopes: string[]
}

@Injectable()
export class QqMailOAuthClient {
  async discover(): Promise<QqMailOAuthMetadata> {
    try {
      const [resourceMetadata, authorizationMetadata] = await Promise.all([
        requestJson(QQ_MAIL_RESOURCE_METADATA_URL),
        requestJson(QQ_MAIL_AUTHORIZATION_METADATA_URL)
      ])
      validateResourceMetadata(resourceMetadata)
      validateAuthorizationMetadata(authorizationMetadata)
      return {
        resource: QQ_MAIL_RESOURCE,
        authorizationEndpoint: QQ_MAIL_AUTHORIZATION_URL,
        tokenEndpoint: QQ_MAIL_TOKEN_URL,
        registrationEndpoint: QQ_MAIL_REGISTRATION_URL
      }
    } catch (error) {
      if (error instanceof QqMailConnectorError) throw error
      throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', `QQ Mail OAuth discovery failed: ${errorMessage(error)}`)
    }
  }

  async registerClient(metadata: QqMailOAuthMetadata, redirectUri: string): Promise<string> {
    requireExactHttpsUrl(metadata.registrationEndpoint, QQ_MAIL_REGISTRATION_URL, 'registration endpoint')
    requireHttpsCallback(redirectUri)
    let response: Response
    try {
      response = await fetch(metadata.registrationEndpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Xpert-QQ-Mail-Connector'
        },
        body: JSON.stringify({
          client_name: 'Xpert QQ Mail Connector',
          redirect_uris: [redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none'
        })
      })
    } catch (error) {
      throw new QqMailConnectorError(
        'DYNAMIC_REGISTRATION_FAILED',
        `QQ Mail dynamic client registration failed: ${errorMessage(error)}`
      )
    }
    const body = await readResponseJson(response)
    if (!response.ok) {
      throw new QqMailConnectorError(
        'DYNAMIC_REGISTRATION_FAILED',
        providerError(body, response.status, 'QQ Mail rejected dynamic client registration')
      )
    }
    return requireString(body.client_id, 'DYNAMIC_REGISTRATION_FAILED', 'QQ Mail registration did not return client_id')
  }

  async exchangeCode(input: {
    tokenEndpoint: string
    clientId: string
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<QqMailToken> {
    requireExactHttpsUrl(input.tokenEndpoint, QQ_MAIL_TOKEN_URL, 'token endpoint')
    requireHttpsCallback(input.redirectUri)
    return this.requestToken(
      {
        grant_type: 'authorization_code',
        client_id: input.clientId,
        code: input.code,
        code_verifier: input.codeVerifier,
        redirect_uri: input.redirectUri,
        resource: QQ_MAIL_RESOURCE
      },
      'TOKEN_EXCHANGE_FAILED'
    )
  }

  async refresh(input: { clientId: string; refreshToken: string }): Promise<QqMailToken> {
    return this.requestToken(
      {
        grant_type: 'refresh_token',
        client_id: input.clientId,
        refresh_token: input.refreshToken,
        resource: QQ_MAIL_RESOURCE
      },
      'TOKEN_EXPIRED'
    )
  }

  private async requestToken(
    values: Record<string, string>,
    code: 'TOKEN_EXCHANGE_FAILED' | 'TOKEN_EXPIRED'
  ): Promise<QqMailToken> {
    let response: Response
    try {
      response = await fetch(QQ_MAIL_TOKEN_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Xpert-QQ-Mail-Connector'
        },
        body: new URLSearchParams(values)
      })
    } catch (error) {
      throw new QqMailConnectorError(
        code,
        `QQ Mail token request failed: ${errorMessage(error)}`,
        code === 'TOKEN_EXPIRED'
      )
    }
    const body = await readResponseJson(response)
    if (!response.ok || typeof body.error === 'string') {
      throw new QqMailConnectorError(code, providerError(body, response.status, 'QQ Mail token request was rejected'))
    }
    return {
      accessToken: requireString(body.access_token, code, 'QQ Mail token response did not include access_token'),
      tokenType: readString(body.token_type) ?? 'Bearer',
      refreshToken: readString(body.refresh_token),
      expiresIn: readPositiveInteger(body.expires_in),
      refreshExpiresIn: readPositiveInteger(body.refresh_expires_in),
      scopes: parseScopes(body.scope)
    }
  }
}

async function requestJson(url: string) {
  const response = await fetch(url, {
    redirect: 'error',
    headers: { Accept: 'application/json', 'User-Agent': 'Xpert-QQ-Mail-Connector' }
  })
  const body = await readResponseJson(response)
  if (!response.ok) {
    throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', `QQ Mail metadata returned HTTP ${response.status}`)
  }
  return body
}

async function readResponseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

function validateResourceMetadata(value: Record<string, unknown>) {
  requireExactHttpsUrl(value.resource, QQ_MAIL_RESOURCE, 'resource')
  const servers = readStringArray(value.authorization_servers)
  if (!servers.includes(QQ_MAIL_ISSUER)) {
    throw new QqMailConnectorError(
      'OAUTH_DISCOVERY_FAILED',
      'QQ Mail resource metadata has an unexpected authorization server'
    )
  }
  const scopes = readStringArray(value.scopes_supported)
  for (const scope of ['alias:read', 'mail:read', 'mail:send']) {
    if (!scopes.includes(scope)) {
      throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', `QQ Mail resource metadata does not advertise ${scope}`)
    }
  }
}

function validateAuthorizationMetadata(value: Record<string, unknown>) {
  requireExactHttpsUrl(value.issuer, QQ_MAIL_ISSUER, 'issuer')
  requireExactHttpsUrl(value.authorization_endpoint, QQ_MAIL_AUTHORIZATION_URL, 'authorization endpoint')
  requireExactHttpsUrl(value.token_endpoint, QQ_MAIL_TOKEN_URL, 'token endpoint')
  requireExactHttpsUrl(value.registration_endpoint, QQ_MAIL_REGISTRATION_URL, 'registration endpoint')
  if (!readStringArray(value.response_types_supported).includes('code')) {
    throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', 'QQ Mail does not advertise authorization code support')
  }
  if (!readStringArray(value.grant_types_supported).includes('refresh_token')) {
    throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', 'QQ Mail does not advertise refresh token support')
  }
  if (!readStringArray(value.code_challenge_methods_supported).includes('S256')) {
    throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', 'QQ Mail does not advertise PKCE S256 support')
  }
}

export function requireHttpsCallback(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new QqMailConnectorError('CALLBACK_REJECTED', 'QQ Mail callback URI is invalid')
  }
  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new QqMailConnectorError(
      'CALLBACK_REJECTED',
      'QQ Mail callback URI must use HTTPS outside loopback development'
    )
  }
  if (url.username || url.password || url.hash) {
    throw new QqMailConnectorError('CALLBACK_REJECTED', 'QQ Mail callback URI contains unsupported components')
  }
}

function requireExactHttpsUrl(value: unknown, expected: string, field: string) {
  if (readString(value) !== expected) {
    throw new QqMailConnectorError('OAUTH_DISCOVERY_FAILED', `QQ Mail metadata has an unexpected ${field}`)
  }
}

function providerError(body: Record<string, unknown>, status: number, fallback: string) {
  const description = readString(body.error_description) ?? readString(body.error) ?? readString(body.message)
  return description ? `${fallback} (HTTP ${status}): ${description.slice(0, 300)}` : `${fallback} (HTTP ${status})`
}

function parseScopes(value: unknown) {
  if (Array.isArray(value)) return readStringArray(value)
  const text = readString(value)
  return text ? [...new Set(text.split(/\s+/).filter(Boolean))] : []
}

function readPositiveInteger(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(number) && number > 0 ? number : undefined
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter((item): item is string => !!item) : []
}

function requireString(
  value: unknown,
  code: 'DYNAMIC_REGISTRATION_FAILED' | 'TOKEN_EXCHANGE_FAILED' | 'TOKEN_EXPIRED',
  message: string
) {
  const result = readString(value)
  if (!result) throw new QqMailConnectorError(code, message)
  return result
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
