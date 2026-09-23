import { createOAuth2Driver } from '@xpert-ai/connector-runtime'
import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorAuthorizationCodeInput,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorCredential,
  type ConnectorCredentialRefreshInput,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorProfile,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { BAIDU_NETDISK_AUTH_METHOD_OAUTH, BAIDU_NETDISK_CONNECTOR_PROVIDER, BAIDU_NETDISK_AUTHORIZE_URL, BAIDU_NETDISK_TOKEN_URL } from '../constants.js'
import { BAIDU_NETDISK_ICON } from '../branding.js'
import { BaiduNetdiskConnectorError, readString, requireString } from '../errors.js'
import { BaiduNetdiskOAuthClient } from './baidu-netdisk-oauth.client.js'
import { BaiduNetdiskOAuthConfigService } from './baidu-netdisk-oauth-config.service.js'

type PendingOAuthMetadata = {
  version: 1
  integrationId: string
  appKeyFingerprint: string
  redirectUri: string
  scopes: string[]
}

@Injectable()
@ConnectorStrategyKey(BAIDU_NETDISK_CONNECTOR_PROVIDER)
export class BaiduNetdiskConnectorStrategy implements ConnectorMultiAuthStrategy {
  readonly definition: ConnectorMultiAuthDefinition = {
    provider: BAIDU_NETDISK_CONNECTOR_PROVIDER,
    connectionScope: 'user',
    label: { en_US: 'Baidu Netdisk', zh_Hans: '百度网盘' },
    description: {
      en_US: 'Connect Baidu Netdisk through the platform-managed OAuth application.',
      zh_Hans: '通过平台内置的百度网盘 OAuth 应用连接百度网盘。'
    },
    icon: BAIDU_NETDISK_ICON,
    legacyAuthMethodId: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
    auth: { type: 'oauth2' },
    authMethods: [
      {
        id: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
        type: 'oauth2',
        label: { en_US: 'Baidu Netdisk OAuth', zh_Hans: '百度网盘 OAuth' },
        appCredentials: { fields: [] }
      }
    ],
    permissions: [
      {
        key: 'baidu-netdisk.read',
        label: { en_US: 'Read Baidu Netdisk files', zh_Hans: '读取百度网盘文件' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'baidu-netdisk.refresh',
        label: { en_US: 'Refresh Baidu Netdisk access', zh_Hans: '刷新百度网盘访问权限' },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault'
      },
      {
        key: 'baidu-netdisk.oauth-app',
        label: { en_US: 'Baidu Netdisk OAuth application', zh_Hans: '百度网盘 OAuth 应用' },
        identity: 'tenant',
        credential: 'app_credential',
        storage: 'platform_vault',
        required: true
      }
    ]
  } as unknown as ConnectorMultiAuthDefinition

  constructor(
    private readonly oauthConfig: BaiduNetdiskOAuthConfigService,
    private readonly oauth: BaiduNetdiskOAuthClient
  ) {}

  private driver(app: Awaited<ReturnType<BaiduNetdiskOAuthConfigService['resolve']>>) {
    return createOAuth2Driver({
      kind: 'oauth2', authMethodId: BAIDU_NETDISK_AUTH_METHOD_OAUTH,
      authorizationEndpoint: app.config.authorizationUrl || BAIDU_NETDISK_AUTHORIZE_URL,
      tokenEndpoint: app.config.tokenUrl || BAIDU_NETDISK_TOKEN_URL,
      encoding: 'query', clientAuthentication: 'client_secret_post', pkce: false,
      scopes: app.config.scopes, scopeSeparator: ',', authorizationParameters: { qrcode: '1' }
    }, {
      assertAuthMethod,
      stateError: oauthStateError,
      resolveApp: async () => ({ integrationId: app.integrationId, clientId: app.config.appKey, clientSecret: app.config.secretKey }),
      createMetadata: (_client, input): PendingOAuthMetadata => ({
        version: 1, integrationId: app.integrationId,
        appKeyFingerprint: fingerprint(app.config.appKey), redirectUri: input.redirectUri,
        scopes: resolveScopes(input.scopes, app.config.scopes)
      }),
      validateMetadata: (_client, input) => {
        const metadata = readPendingMetadata(input.metadata)
        if (fingerprint(app.config.appKey) !== metadata.appKeyFingerprint)
          throw oauthStateError('Baidu OAuth application configuration changed during authorization.')
        resolveScopes(metadata.scopes, app.config.scopes)
      },
      requestToken: (_client, values) => values.grant_type === 'refresh_token'
        ? this.oauth.refresh(app.config, values.refresh_token)
        : this.oauth.exchangeCode(app.config, requireString(values.code, 'Baidu authorization code'), values.redirect_uri),
      toCredential: (token, _client, previous, scopes) => toCredential(
        token, app.integrationId, app.config.appKey,
        resolveScopes(scopes, app.config.scopes), previous?.profile ?? undefined
      )
    })
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    assertAuthMethod(input.authMethodId)
    const app = await this.oauthConfig.resolve()
    return this.driver(app).connect({ ...input, scopes: resolveScopes(input.scopes, app.config.scopes) })
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    assertAuthMethod(input.authMethodId)
    const metadata = readPendingMetadata(input.metadata)
    if (metadata.redirectUri !== input.redirectUri)
      throw oauthStateError('Baidu OAuth redirect URI does not match the authorization request.')
    const app = await this.oauthConfig.resolve(metadata.integrationId)
    return this.driver(app).exchangeAuthorizationCode(input)
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    assertAuthMethod(input.authMethodId)
    const app = await this.oauthConfig.resolve(readString(input.credential.data.integrationId))
    return this.driver(app).refreshConnectionCredential(input)
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    assertAuthMethod(input.authMethodId)
    const integrationId = readString(input.credential.data.integrationId)
    return {
      ...(integrationId ? { integrationId } : {}),
      accessToken: requireString(input.credential.data.accessToken, 'Baidu access token'),
      tokenType: readString(input.credential.data.tokenType) ?? 'bearer'
    }
  }
}

function assertAuthMethod(value: string): void {
  if (value !== BAIDU_NETDISK_AUTH_METHOD_OAUTH)
    throw new BaiduNetdiskConnectorError(
      'CONNECTOR_UNAVAILABLE',
      `Unsupported Baidu Netdisk authentication method '${value}'.`
    )
}

function readPendingMetadata(value: Record<string, unknown> | null | undefined): PendingOAuthMetadata {
  const version = value?.version
  const appKeyFingerprint = readString(value?.appKeyFingerprint)
  const redirectUri = readString(value?.redirectUri)
  const scopes = Array.isArray(value?.scopes)
    ? value.scopes.filter((scope): scope is string => typeof scope === 'string')
    : []
  const integrationId = readString(value?.integrationId)
  if (
    version !== 1 ||
    !integrationId ||
    !appKeyFingerprint ||
    !redirectUri ||
    !scopes.length ||
    scopes.length > 8 ||
    new Set(scopes).size !== scopes.length
  )
    throw oauthStateError('Baidu OAuth session metadata is missing or invalid.')
  return { version: 1, integrationId, appKeyFingerprint, redirectUri, scopes }
}

function resolveScopes(requested: string[] | undefined, configured: string[]): string[] {
  const scopes = requested?.length ? requested : configured
  const allowed = new Set(configured)
  if (
    !scopes.length ||
    scopes.length > 8 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !allowed.has(scope))
  ) {
    throw new BaiduNetdiskConnectorError(
      'PERMISSION_DENIED',
      'Requested Baidu OAuth scopes are not allowed by the tenant System Integration.'
    )
  }
  return [...scopes]
}

function toCredential(
  token: {
    accessToken: string
    refreshToken: string
    expiresIn: number
    refreshExpiresIn?: number
    tokenType: string
    userId?: string
  },
  integrationId: string,
  appKey: string,
  scopes: string[],
  profile?: ConnectorProfile
): ConnectorCredential {
  const now = Date.now()
  return {
    data: {
      integrationId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenType: token.tokenType,
      appKeyFingerprint: fingerprint(appKey),
      ...(token.userId ? { userId: token.userId } : {})
    },
    expiresAt: new Date(now + token.expiresIn * 1_000).toISOString(),
    ...(token.refreshExpiresIn
      ? { refreshExpiresAt: new Date(now + token.refreshExpiresIn * 1_000).toISOString() }
      : {}),
    scopes,
    profile: profile ?? (token.userId ? { userId: token.userId, name: 'Baidu Netdisk user' } : undefined)
  }
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function oauthStateError(message: string): BaiduNetdiskConnectorError {
  return new BaiduNetdiskConnectorError('OAUTH_STATE_INVALID', message)
}
