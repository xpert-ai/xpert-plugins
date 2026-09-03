import { createHash, randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  CANVA_CONNECT_AUTHORIZE_URL,
  CANVA_CONNECT_REVOKE_URL,
  CANVA_CONNECT_TOKEN_URL,
  CANVA_DEFAULT_SCOPES,
  CANVA_MCP_CN_AUTHORIZE_URL,
  CANVA_MCP_CN_METADATA_URL,
  CANVA_MCP_CN_REGISTER_URL,
  CANVA_MCP_CN_RESOURCE,
  CANVA_MCP_CN_REVOKE_URL,
  CANVA_MCP_CN_TOKEN_URL
} from '../constants.js'
import { CanvaConnectorError, errorMessage, readString, requireString } from '../errors.js'

export type CanvaOAuthMode = 'mcp-cn' | 'connect-global'
export type CanvaOAuthClientAuthentication = 'none' | 'client_secret_basic'
export type CanvaOAuthApp = {
  integrationId?: string
  clientId: string
  clientSecret?: string
  clientAuthentication?: CanvaOAuthClientAuthentication
  mode: CanvaOAuthMode
}
export type CanvaOAuthToken = {
  accessToken: string
  refreshToken?: string
  tokenType: string
  expiresIn?: number
  refreshExpiresIn?: number
  scopes: string[]
  resource: string
  revokeEndpoint: string
}

export type CanvaPendingOAuth = {
  version: 1
  mode: CanvaOAuthMode
  /** Present for legacy System Integration flows; omitted for public DCR clients. */
  integrationId?: string
  /** Persisted so a DCR client can be used when the callback is handled. */
  clientId?: string
  clientAuthentication?: CanvaOAuthClientAuthentication
  clientIdFingerprint: string
  codeVerifier: string
  redirectUri: string
  authorizationEndpoint: string
  tokenEndpoint: string
  resource: string
  revokeEndpoint: string
  scopes: string[]
}

@Injectable()
export class CanvaOAuthClient {
  async buildAuthorization(app: CanvaOAuthApp, redirectUri: string, state: string) {
    requireHttpsCallback(redirectUri)
    const mode = app.mode
    const codeVerifier = randomBytes(48).toString('base64url')
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
    const endpoints = endpointsFor(mode)
    const scopes = [...CANVA_DEFAULT_SCOPES]
    const url = new URL(endpoints.authorizationEndpoint)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', app.clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', scopes.join(' '))
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    if (endpoints.resource) url.searchParams.set('resource', endpoints.resource)
    return {
      authorizationUrl: url.toString(),
      scopes,
      metadata: {
        version: 1 as const,
        mode,
        integrationId: app.integrationId,
        clientId: app.clientId,
        clientAuthentication: app.clientAuthentication ?? (app.clientSecret ? 'client_secret_basic' : 'none'),
        clientIdFingerprint: fingerprint(app.clientId),
        codeVerifier,
        redirectUri,
        authorizationEndpoint: endpoints.authorizationEndpoint,
        tokenEndpoint: endpoints.tokenEndpoint,
        resource: endpoints.resource,
        revokeEndpoint: endpoints.revokeEndpoint,
        scopes
      } satisfies CanvaPendingOAuth
    }
  }

  async exchangeCode(input: { pending: CanvaPendingOAuth; app: CanvaOAuthApp; code: string }): Promise<CanvaOAuthToken> {
    validatePending(input.pending, input.app, input.pending.redirectUri)
    const token = await this.requestToken(input.pending.tokenEndpoint, {
      grant_type: 'authorization_code',
      client_id: input.app.clientId,
      code: input.code,
      code_verifier: input.pending.codeVerifier,
      redirect_uri: input.pending.redirectUri,
      ...(input.pending.resource ? { resource: input.pending.resource } : {})
    }, 'CANVA_TOKEN_EXCHANGE_FAILED', clientAuthorization(input.app))
    return { ...token, resource: input.pending.resource, revokeEndpoint: input.pending.revokeEndpoint }
  }

  async refresh(input: { app: CanvaOAuthApp; refreshToken: string; pending?: Partial<CanvaPendingOAuth> }): Promise<CanvaOAuthToken> {
    const endpoints = endpointsFor(input.app.mode)
    const token = await this.requestToken(endpoints.tokenEndpoint, {
      grant_type: 'refresh_token',
      client_id: input.app.clientId,
      refresh_token: input.refreshToken,
      ...(endpoints.resource ? { resource: endpoints.resource } : {})
    }, 'CANVA_TOKEN_EXPIRED', clientAuthorization(input.app))
    return { ...token, resource: endpoints.resource, revokeEndpoint: input.pending?.revokeEndpoint ?? endpoints.revokeEndpoint }
  }

  async revoke(input: { endpoint: string; accessToken: string; clientId: string; clientSecret?: string }) {
    if (!isKnownRevokeEndpoint(input.endpoint)) throw new CanvaConnectorError('CANVA_CONFIGURATION_INVALID', 'Canva revoke endpoint is not approved')
    try {
      const authorization = clientAuthorization(input)
      const response = await fetch(input.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Xpert-Canva-Connector', ...(authorization ? { Authorization: authorization } : {}) },
        body: new URLSearchParams({
          token: input.accessToken,
          client_id: input.clientId
        })
      })
      if (!response.ok && response.status !== 404) throw new CanvaConnectorError('CANVA_MCP_TOOL_FAILED', `Canva token revocation returned HTTP ${response.status}`)
    } catch (error) {
      if (error instanceof CanvaConnectorError) throw error
      throw new CanvaConnectorError('CANVA_MCP_TOOL_FAILED', `Canva token revocation failed: ${errorMessage(error)}`, true)
    }
  }

  async discoverMcp() {
    const response = await fetch(CANVA_MCP_CN_METADATA_URL, { redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'Xpert-Canva-Connector' } })
    const body = await readJson(response)
    if (!response.ok) throw new CanvaConnectorError('CANVA_OAUTH_DISCOVERY_FAILED', `Canva OAuth metadata returned HTTP ${response.status}`)
    const authorizationEndpoint = readString(body.authorization_endpoint)
    const tokenEndpoint = readString(body.token_endpoint)
    const revokeEndpoint = readString(body.revocation_endpoint)
    if (authorizationEndpoint !== CANVA_MCP_CN_AUTHORIZE_URL || tokenEndpoint !== CANVA_MCP_CN_TOKEN_URL || revokeEndpoint !== CANVA_MCP_CN_REVOKE_URL) {
      throw new CanvaConnectorError('CANVA_OAUTH_DISCOVERY_FAILED', 'Canva MCP OAuth metadata endpoints are not approved')
    }
    return { authorizationEndpoint, tokenEndpoint, resource: CANVA_MCP_CN_RESOURCE, revokeEndpoint }
  }

  async registerClient(redirectUri: string) {
    requireHttpsCallback(redirectUri)
    const response = await fetch(CANVA_MCP_CN_REGISTER_URL, {
      method: 'POST', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'Xpert-Canva-Connector' },
      body: JSON.stringify({ client_name: 'Xpert Canva Connector', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' })
    })
    const body = await readJson(response)
    if (!response.ok) throw new CanvaConnectorError('CANVA_OAUTH_DISCOVERY_FAILED', `Canva dynamic registration returned HTTP ${response.status}`)
    return requireString(body.client_id, 'Canva registration did not return client_id')
  }

  private async requestToken(endpoint: string, values: Record<string, string>, code: 'CANVA_TOKEN_EXCHANGE_FAILED' | 'CANVA_TOKEN_EXPIRED', authorization?: string) {
    if (![CANVA_MCP_CN_TOKEN_URL, CANVA_CONNECT_TOKEN_URL].includes(endpoint)) throw new CanvaConnectorError('CANVA_CONFIGURATION_INVALID', 'Canva token endpoint is not approved')
    try {
      // RFC 6749 client_secret_basic authenticates the client in the header;
      // do not duplicate client_id in the form body for strict OAuth servers.
      const formValues = authorization ? { ...values, client_id: undefined } : values
      const form = new URLSearchParams()
      for (const [key, value] of Object.entries(formValues)) {
        if (value !== undefined) form.set(key, value)
      }
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Xpert-Canva-Connector', ...(authorization ? { Authorization: authorization } : {}) }, body: form })
      const body = await readJson(response)
      if (!response.ok || body.error) {
        const detail = readString(body.error_description) ?? readString(body.error)
        throw new CanvaConnectorError(code, `Canva token request was rejected (HTTP ${response.status}${detail ? `: ${detail}` : ''})`, code === 'CANVA_TOKEN_EXPIRED')
      }
      return {
        accessToken: requireString(body.access_token, 'Canva token response did not include access_token'),
        refreshToken: readString(body.refresh_token),
        tokenType: readString(body.token_type) ?? 'Bearer',
        expiresIn: positiveInteger(body.expires_in),
        refreshExpiresIn: positiveInteger(body.refresh_expires_in),
        scopes: parseScopes(body.scope)
      }
    } catch (error) {
      if (error instanceof CanvaConnectorError) throw error
      throw new CanvaConnectorError(code, `Canva token request failed: ${errorMessage(error)}`, code === 'CANVA_TOKEN_EXPIRED')
    }
  }
}

function endpointsFor(mode: CanvaOAuthMode) {
  return mode === 'mcp-cn'
    ? { authorizationEndpoint: CANVA_MCP_CN_AUTHORIZE_URL, tokenEndpoint: CANVA_MCP_CN_TOKEN_URL, resource: CANVA_MCP_CN_RESOURCE, revokeEndpoint: CANVA_MCP_CN_REVOKE_URL }
    : { authorizationEndpoint: CANVA_CONNECT_AUTHORIZE_URL, tokenEndpoint: CANVA_CONNECT_TOKEN_URL, resource: 'https://api.canva.com', revokeEndpoint: CANVA_CONNECT_REVOKE_URL }
}

function validatePending(pending: CanvaPendingOAuth, app: CanvaOAuthApp, redirectUri: string) {
  const endpoints = endpointsFor(app.mode)
  if (
    pending.version !== 1 ||
    pending.mode !== app.mode ||
    (pending.integrationId ?? null) !== (app.integrationId ?? null) ||
    (pending.clientId !== undefined && pending.clientId !== app.clientId) ||
    (pending.clientAuthentication !== undefined && pending.clientAuthentication !== (app.clientAuthentication ?? (app.clientSecret ? 'client_secret_basic' : 'none'))) ||
    pending.clientIdFingerprint !== fingerprint(app.clientId) ||
    pending.redirectUri !== redirectUri ||
    pending.authorizationEndpoint !== endpoints.authorizationEndpoint ||
    pending.tokenEndpoint !== endpoints.tokenEndpoint ||
    pending.resource !== endpoints.resource ||
    pending.revokeEndpoint !== endpoints.revokeEndpoint ||
    !pending.codeVerifier ||
    pending.scopes.length === 0
  ) {
    throw new CanvaConnectorError('CANVA_OAUTH_STATE_INVALID', 'Canva OAuth session metadata is invalid')
  }
}

function fingerprint(value: string) { return createHash('sha256').update(value).digest('base64url') }
function clientAuthorization(app: Pick<CanvaOAuthApp, 'clientId' | 'clientSecret' | 'clientAuthentication'>) {
  const authentication = app.clientAuthentication ?? (app.clientSecret ? 'client_secret_basic' : 'none')
  return authentication === 'client_secret_basic' && app.clientSecret
    ? `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64')}`
    : undefined
}
function positiveInteger(value: unknown) { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined }
function parseScopes(value: unknown) { return typeof value === 'string' ? value.split(/[ ,]+/).map((item) => item.trim()).filter(Boolean).slice(0, 100) : [...CANVA_DEFAULT_SCOPES] }
function isKnownRevokeEndpoint(value: string) { return value === CANVA_MCP_CN_REVOKE_URL || value === CANVA_CONNECT_REVOKE_URL }

export function requireHttpsCallback(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new CanvaConnectorError('CANVA_CALLBACK_REJECTED', 'Canva callback URI is invalid') }
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new CanvaConnectorError('CANVA_CALLBACK_REJECTED', 'Canva callback URI must use HTTPS outside loopback development')
  if (url.username || url.password || url.hash) throw new CanvaConnectorError('CANVA_CALLBACK_REJECTED', 'Canva callback URI contains forbidden URL components')
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text.trim()) return {}
  try { const value: unknown = JSON.parse(text); return isRecord(value) ? value : {} } catch { return {} }
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
