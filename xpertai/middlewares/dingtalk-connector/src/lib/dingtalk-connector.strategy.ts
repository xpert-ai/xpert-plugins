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
import { DINGTALK_CONNECTOR_ICON } from './branding.js'
import {
  DINGTALK_DWS_AUTHORIZE_URL,
  DINGTALK_DWS_MCP_BASE_URL,
  DingTalkDwsAuthClient,
  type DingTalkDwsOAuthToken
} from './api/dingtalk-dws-auth.client.js'

export const DINGTALK_CONNECTOR_PROVIDER = 'dingtalk'
export const DINGTALK_CONNECTOR_AUTH_METHOD_ID = 'oauth2'
export const DINGTALK_CONNECTOR_AUTHORIZE_URL = DINGTALK_DWS_AUTHORIZE_URL
export const DINGTALK_CONNECTOR_TOKEN_URL = `${DINGTALK_DWS_MCP_BASE_URL}/oauth2/getToken`
export const DINGTALK_DWS_MANAGED_OAUTH_APP_ID = 'dingtalk-dws-managed-oauth'

const DEFAULT_DINGTALK_SCOPES = ['openid', 'corpid'] as const

export type DingTalkDwsAuth = Pick<
  DingTalkDwsAuthClient,
  | 'startLoopbackAuthorization'
  | 'exchangeAuthorizationCode'
  | 'refreshToken'
  | 'assertCliAccess'
  | 'getOfficialClientId'
>

@Injectable()
@ConnectorStrategyKey(DINGTALK_CONNECTOR_PROVIDER)
export class DingTalkConnectorStrategy implements ConnectorMultiAuthStrategy {
  constructor(private readonly dwsAuth: DingTalkDwsAuthClient) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: DINGTALK_CONNECTOR_PROVIDER,
    label: { en_US: 'DingTalk', zh_Hans: '钉钉' },
    description: {
      en_US: 'Connect DingTalk with DWS managed OAuth. No user application setup is required.',
      zh_Hans: '使用 DWS 托管 OAuth 连接钉钉，用户无需配置应用凭据。'
    },
    icon: DINGTALK_CONNECTOR_ICON,
    auth: {
      type: 'oauth2',
      authorizationUrl: DINGTALK_CONNECTOR_AUTHORIZE_URL,
      tokenUrl: DINGTALK_CONNECTOR_TOKEN_URL,
      scopes: [...DEFAULT_DINGTALK_SCOPES],
      redirectPath: '/api/connector/oauth/callback'
    },
    authMethods: [
      {
        id: DINGTALK_CONNECTOR_AUTH_METHOD_ID,
        type: 'oauth2',
        label: { en_US: 'DingTalk OAuth', zh_Hans: '钉钉 OAuth 授权' }
      }
    ],
    permissions: [
      {
        key: 'dingtalk.user_access_token',
        label: { en_US: 'DingTalk user access token', zh_Hans: '钉钉用户访问令牌' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'dingtalk.refresh_token',
        label: { en_US: 'DingTalk refresh token', zh_Hans: '钉钉刷新令牌' },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault'
      },
      {
        key: 'dingtalk.dws_cli_access',
        label: { en_US: 'DingTalk DWS CLI access', zh_Hans: '钉钉 DWS 命令行访问权限' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireAuthMethod(input.authMethodId)
    const scopes = resolveScopes(input.scopes)
    const authorization = await this.dwsAuth.startLoopbackAuthorization({
      state: input.state,
      scopes,
      forwardRedirectUri: input.redirectUri
    })

    return {
      status: 'pending',
      authorizationUrl: authorization.authorizationUrl,
      scopes,
      metadata: {
        authMode: 'loopback',
        managedApp: DINGTALK_DWS_MANAGED_OAUTH_APP_ID,
        clientId: authorization.clientId,
        loopbackRedirectUri: authorization.redirectUri
      }
    }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    requireAuthMethod(input.authMethodId)
    const clientId = await resolveManagedClientId(this.dwsAuth, input.metadata)
    const token = await this.dwsAuth.exchangeAuthorizationCode(
      clientId,
      requireString(input.code, 'DingTalk authorization code is missing')
    )
    await this.dwsAuth.assertCliAccess(token.accessToken)
    const profile = toConnectorProfile(token)
    return toConnectorCredential(token, profile, resolveScopes(input.scopes), clientId)
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    requireAuthMethod(input.authMethodId)
    const clientId = readString(input.credential.data.appId) ?? (await this.dwsAuth.getOfficialClientId())
    const refreshToken = requireString(input.credential.data.refreshToken, 'DingTalk refresh token is missing')
    const token = await this.dwsAuth.refreshToken(clientId, refreshToken)
    await this.dwsAuth.assertCliAccess(token.accessToken)
    const profile = toConnectorProfile(token, input.credential.profile ?? undefined)
    return toConnectorCredential(
      { ...token, refreshToken: token.refreshToken ?? refreshToken },
      profile,
      input.credential.scopes ?? [...DEFAULT_DINGTALK_SCOPES],
      clientId
    )
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireAuthMethod(input.authMethodId)
    return {
      appId: requireString(input.credential.data.appId, 'DingTalk connector appId is missing'),
      brand: readString(input.credential.data.brand) ?? 'dingtalk',
      accessToken: requireString(input.credential.data.accessToken, 'DingTalk connector access token is missing')
    }
  }
}

function toConnectorProfile(token: DingTalkDwsOAuthToken, fallback?: ConnectorProfile): ConnectorProfile | undefined {
  const profile: ConnectorProfile = {
    ...(fallback ?? {}),
    ...(token.corpId ? { corpId: token.corpId } : {}),
    ...(token.userId ? { userId: token.userId } : {}),
    ...(token.userName ? { name: token.userName } : {})
  }
  return Object.keys(profile).length ? profile : undefined
}

function toConnectorCredential(
  token: DingTalkDwsOAuthToken,
  profile: ConnectorProfile | undefined,
  scopes: string[],
  clientId: string
): ConnectorCredential {
  return {
    data: {
      appId: clientId,
      brand: 'dingtalk',
      ...(token.corpId || profile?.corpId ? { corpId: token.corpId ?? profile?.corpId } : {}),
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {})
    },
    ...(token.expiresIn != null ? { expiresAt: toExpiresAt(token.expiresIn) } : {}),
    ...(token.refreshExpiresIn != null ? { refreshExpiresAt: toExpiresAt(token.refreshExpiresIn) } : {}),
    scopes,
    profile
  }
}

async function resolveManagedClientId(client: DingTalkDwsAuthClient, metadata?: Record<string, unknown> | null) {
  return readString(metadata?.clientId) ?? (await client.getOfficialClientId())
}

function resolveScopes(scopes?: string[]) {
  const resolved: string[] = [...DEFAULT_DINGTALK_SCOPES]
  for (const scope of scopes ?? []) {
    const value = readString(scope)
    if (value && !resolved.includes(value)) resolved.push(value)
  }
  return resolved
}

function requireAuthMethod(authMethodId: string) {
  if (authMethodId !== DINGTALK_CONNECTOR_AUTH_METHOD_ID) {
    throw new Error(`Unsupported DingTalk connector authentication method '${authMethodId}'`)
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) throw new Error(message)
  return result
}

function toExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}
