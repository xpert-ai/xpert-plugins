import type { ConnectorCredential, ConnectorProfile, ConnectorRuntimeCredentialResolveInput } from '@xpert-ai/plugin-sdk/connector'
import { createOAuth2Driver, requestOAuth2Token, type OAuth2Adapter, type OAuth2Descriptor } from './oauth2.js'

type StandardToken = {
  accessToken: string; tokenType: string; refreshToken?: string
  expiresIn?: number; refreshExpiresIn?: number; scopes?: string[]
}

/** A new RFC-style provider needs a descriptor and the host's authorized client resolver. */
export function createStandardOAuth2Driver(
  descriptor: OAuth2Descriptor,
  services: Pick<OAuth2Adapter<StandardToken>, 'resolveApp'> & {
    profile?: (accessToken: string) => Promise<ConnectorProfile>
  }
) {
  const driver = createOAuth2Driver(descriptor, {
    resolveApp: services.resolveApp,
    async requestToken(app, values): Promise<StandardToken> {
      const response = await requestOAuth2Token(descriptor, app, values)
      // Do not include token responses or transport errors (which may include secrets) in errors.
      const body: unknown = await response.json().catch(() => undefined)
      if (!response.ok || !isRecord(body) || body.error) throw new Error(`OAuth token request rejected (HTTP ${response.status})`)
      return {
        accessToken: required(body.access_token), tokenType: optional(body.token_type) ?? 'Bearer',
        refreshToken: optional(body.refresh_token), expiresIn: seconds(body.expires_in),
        refreshExpiresIn: seconds(body.refresh_token_expires_in),
        scopes: typeof body.scope === 'string' ? [...new Set(body.scope.split(/\s+/).filter(Boolean))] : undefined
      }
    },
    async toCredential(token, app, previous, scopes): Promise<ConnectorCredential> {
      const refreshToken = token.refreshToken ?? optional(previous?.data.refreshToken)
      const now = Date.now()
      return {
        data: {
          ...(app.integrationId ? { integrationId: app.integrationId } : {}),
          accessToken: token.accessToken, tokenType: token.tokenType,
          ...(refreshToken ? { refreshToken } : {})
        },
        expiresAt: token.expiresIn === undefined ? undefined : new Date(now + token.expiresIn * 1000).toISOString(),
        refreshExpiresAt: token.refreshExpiresIn === undefined ? previous?.refreshExpiresAt : new Date(now + token.refreshExpiresIn * 1000).toISOString(),
        scopes: token.scopes ?? scopes,
        profile: previous?.profile ?? (services.profile ? await services.profile(token.accessToken) : undefined)
      }
    }
  })
  return {
    ...driver,
    resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
      if (input.authMethodId !== descriptor.authMethodId) throw new Error('Unsupported OAuth authentication method')
      return { accessToken: required(input.credential.data.accessToken), tokenType: optional(input.credential.data.tokenType) ?? 'Bearer' }
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function optional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
function required(value: unknown): string {
  const result = optional(value)
  if (!result) throw new Error('OAuth access token is missing')
  return result
}
function seconds(value: unknown): number | undefined {
  const result = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(result) && result >= 0 && result <= 10 * 365 * 24 * 60 * 60 ? result : undefined
}
