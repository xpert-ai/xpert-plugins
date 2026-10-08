import { createHash } from 'node:crypto'
import type {
  ConnectorAuthorizationCodeInput, ConnectorConnectInput, ConnectorConnectResult,
  ConnectorCredential, ConnectorCredentialRefreshInput
} from '@xpert-ai/plugin-sdk/connector'
import { authorizationUrl, createPkce, oauthTokenRequest, type OAuthTokenRequest } from './oauth-http.js'

export type OAuth2Descriptor = {
  kind: 'oauth2'
  authMethodId: string
  authorizationEndpoint: string
  tokenEndpoint: string
  encoding: OAuthTokenRequest['encoding']
  clientAuthentication: 'none' | 'client_secret_basic' | 'client_secret_post'
  pkce: boolean
  scopes?: string[]
  scopeSeparator?: string
  resource?: string
  authorizationParameters?: Record<string, string>
}

export type OAuthClient = { clientId: string; clientSecret?: string; integrationId?: string }
export type OAuthAppContext =
  | { phase: 'connect'; input: ConnectorConnectInput }
  | { phase: 'exchange'; input: ConnectorAuthorizationCodeInput }
  | { phase: 'refresh'; input: ConnectorCredentialRefreshInput }

export type OAuth2Adapter<T> = {
  resolveApp: (context: OAuthAppContext) => Promise<OAuthClient>
  assertAuthMethod?: (id: string) => void
  stateError?: (message: string) => Error
  requestToken: (app: OAuthClient, values: Record<string, string>) => Promise<T>
  toCredential: (token: T, app: OAuthClient, previous?: ConnectorCredential, scopes?: string[]) => ConnectorCredential | Promise<ConnectorCredential>
  /** Compatibility codec for existing pending authorizations. Never stores client secrets. */
  createMetadata?: (app: OAuthClient, input: ConnectorConnectInput, verifier?: string) => Record<string, unknown>
  validateMetadata?: (app: OAuthClient, input: ConnectorAuthorizationCodeInput) => void
}

/** Standard authorization-code/refresh flow; vendor adapters own app lookup and token codecs. */
export function createOAuth2Driver<T>(descriptor: OAuth2Descriptor, adapter: OAuth2Adapter<T>) {
  if (descriptor.kind !== 'oauth2' || !descriptor.authMethodId?.trim() || typeof descriptor.pkce !== 'boolean'
    || !['form', 'json', 'query'].includes(descriptor.encoding)
    || !['none', 'client_secret_basic', 'client_secret_post'].includes(descriptor.clientAuthentication)) {
    throw new Error('Invalid OAuth connector descriptor')
  }
  // Fail before contacting a provider when a descriptor is invalid.
  authorizationUrl(descriptor.authorizationEndpoint, {})
  authorizationUrl(descriptor.tokenEndpoint, {})
  const assertMethod = (id: string) => {
    adapter.assertAuthMethod?.(id)
    if (id !== descriptor.authMethodId) throw new Error(`Unsupported connector authentication method '${id}'`)
  }
  return {
    kind: descriptor.kind,
    async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
      assertMethod(input.authMethodId)
      const app = await adapter.resolveApp({ phase: 'connect', input })
      const scopes = input.scopes?.length ? input.scopes : descriptor.scopes
      if (scopes?.some((scope) => !descriptor.scopes?.includes(scope))) throw new Error('Requested OAuth scopes are not allowed')
      const pkce = descriptor.pkce ? createPkce() : undefined
      const metadata = adapter.createMetadata?.(app, input, pkce?.codeVerifier) ?? {
        version: 1, integrationId: app.integrationId, clientIdFingerprint: fingerprint(app.clientId),
        redirectUri: input.redirectUri, ...(scopes ? { scopes: [...scopes] } : {}), ...(pkce ? { codeVerifier: pkce.codeVerifier } : {})
      }
      return {
        status: 'pending',
        authorizationUrl: authorizationUrl(descriptor.authorizationEndpoint, {
          ...descriptor.authorizationParameters,
          response_type: 'code', client_id: app.clientId, redirect_uri: input.redirectUri, state: input.state,
          scope: scopes?.length ? scopes.join(descriptor.scopeSeparator ?? ' ') : undefined,
          resource: descriptor.resource,
          code_challenge: pkce?.codeChallenge, code_challenge_method: pkce ? 'S256' : undefined
        }),
        ...(scopes ? { scopes: [...scopes] } : {}), metadata
      }
    },
    async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
      assertMethod(input.authMethodId)
      // Callback state itself is verified by the host before invoking a driver.
      if (input.metadata?.redirectUri !== input.redirectUri) {
        const message = 'OAuth redirect URI does not match the authorization request'
        throw adapter.stateError?.(message) ?? new Error(message)
      }
      const app = await adapter.resolveApp({ phase: 'exchange', input })
      if (adapter.validateMetadata) adapter.validateMetadata(app, input)
      else if (input.metadata?.version !== 1 || input.metadata?.clientIdFingerprint !== fingerprint(app.clientId)) {
        throw new Error('OAuth application configuration changed during authorization')
      }
      const scopes = input.metadata?.scopes === undefined ? descriptor.scopes : readScopes(input.metadata.scopes)
      if (scopes?.some((scope) => !descriptor.scopes?.includes(scope))) throw new Error('Requested OAuth scopes are not allowed')
      const token = await adapter.requestToken(app, {
        grant_type: 'authorization_code', code: requiredString(input.code, 'OAuth code'), redirect_uri: input.redirectUri,
        ...(descriptor.pkce ? { code_verifier: requiredString(input.metadata?.codeVerifier, 'OAuth PKCE verifier') } : {}),
        ...(descriptor.resource ? { resource: descriptor.resource } : {})
      })
      return adapter.toCredential(token, app, undefined, scopes)
    },
    async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
      assertMethod(input.authMethodId)
      const app = await adapter.resolveApp({ phase: 'refresh', input })
      const token = await adapter.requestToken(app, {
        grant_type: 'refresh_token', refresh_token: requiredString(input.credential.data.refreshToken, 'OAuth refresh token'),
        ...(descriptor.resource ? { resource: descriptor.resource } : {})
      })
      return adapter.toCredential(token, app, input.credential, input.credential.scopes ?? undefined)
    }
  }
}

/** Transport for descriptor-only providers. Vendor codecs can reuse this with custom response parsing. */
export function requestOAuth2Token(descriptor: OAuth2Descriptor, app: OAuthClient, values: Record<string, string>) {
  if (descriptor.clientAuthentication !== 'none') requiredString(app.clientSecret, 'OAuth client secret')
  const { client_id: _clientId, client_secret: _clientSecret, ...grantValues } = values
  return oauthTokenRequest({
    endpoint: descriptor.tokenEndpoint, encoding: descriptor.encoding,
    values: {
      ...grantValues,
      ...(descriptor.clientAuthentication === 'client_secret_basic' ? {} : { client_id: app.clientId }),
      ...(descriptor.clientAuthentication === 'client_secret_post' ? { client_secret: app.clientSecret! } : {})
    },
    ...(descriptor.clientAuthentication === 'client_secret_basic'
      ? { basicAuth: { clientId: app.clientId, clientSecret: app.clientSecret! } } : {})
  })
}

function fingerprint(value: string): string { return createHash('sha256').update(value).digest('hex') }
function readScopes(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((scope): scope is string => typeof scope === 'string' && !!scope.trim())) {
    throw new Error('Invalid OAuth authorization scopes')
  }
  return [...new Set(value)]
}
function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is missing`)
  return value.trim()
}
