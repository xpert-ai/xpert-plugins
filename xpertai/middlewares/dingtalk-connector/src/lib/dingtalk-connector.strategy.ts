import { Inject, Injectable, Logger } from '@nestjs/common'
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
  type ConnectorRuntimeCredentialResolveInput,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import type { IIntegration } from '@xpert-ai/contracts'
import { DINGTALK_CONNECTOR_ICON } from './branding.js'
import { DINGTALK_CONNECTOR_PLUGIN_CONTEXT } from './tokens.js'

export const DINGTALK_CONNECTOR_PROVIDER = 'dingtalk'
export const DINGTALK_CONNECTOR_AUTHORIZE_URL = 'https://login.dingtalk.com/oauth2/auth'
export const DINGTALK_CONNECTOR_TOKEN_URL = 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken'
export const DINGTALK_CONNECTOR_USER_INFO_URL = 'https://api.dingtalk.com/v1.0/contact/users/me'

const DEFAULT_DINGTALK_SCOPES = ['openid', 'corpid'] as const
const REQUEST_TIMEOUT_MS = 15_000
const DINGTALK_SYSTEM_INTEGRATION_PROVIDERS = ['dingtalk', 'dingtalk_long'] as const

@Injectable()
@ConnectorStrategyKey(DINGTALK_CONNECTOR_PROVIDER)
export class DingTalkConnectorStrategy implements ConnectorMultiAuthStrategy {
  private readonly logger = new Logger(DingTalkConnectorStrategy.name)
  private _integrationPermissionService: IntegrationPermissionService

  constructor(
    @Inject(DINGTALK_CONNECTOR_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    if (!this._integrationPermissionService) {
      this._integrationPermissionService = this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    }
    return this._integrationPermissionService
  }

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: DINGTALK_CONNECTOR_PROVIDER,
    label: {
      en_US: 'DingTalk',
      zh_Hans: '钉钉'
    },
    description: {
      en_US: 'Connect DingTalk using the configured system integration.',
      zh_Hans: '使用系统集成中配置的钉钉应用进行 OAuth 授权连接。'
    },
    icon: {
      type: 'svg',
      value: DINGTALK_CONNECTOR_ICON
    },
    authMethods: [
      {
        id: 'oauth2',
        type: 'oauth2',
        label: {
          en_US: 'DingTalk OAuth',
          zh_Hans: '钉钉 OAuth 授权'
        }
      }
    ],
    permissions: [
      {
        key: 'dingtalk.user_access_token',
        label: {
          en_US: 'DingTalk user access token',
          zh_Hans: '钉钉用户访问令牌'
        },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'dingtalk.refresh_token',
        label: {
          en_US: 'DingTalk refresh token',
          zh_Hans: '钉钉刷新令牌'
        },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault'
      },
      {
        key: 'dingtalk.app_credential',
        label: {
          en_US: 'DingTalk system integration',
          zh_Hans: '钉钉系统集成'
        },
        identity: 'app',
        credential: 'app_credential',
        storage: 'platform_vault'
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireDingTalkOAuthMethod(input.authMethodId)
    const app = await this.resolveConfiguredApp()
    const scopes = resolveDingTalkScopes(input.scopes)
    const url = new URL(DINGTALK_CONNECTOR_AUTHORIZE_URL)
    url.searchParams.set('client_id', app.clientId)
    url.searchParams.set('redirect_uri', input.redirectUri)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scopes.join(' '))
    url.searchParams.set('state', input.state)
    url.searchParams.set('prompt', 'consent')

    return {
      status: 'pending',
      authorizationUrl: url.toString(),
      scopes,
      metadata: {
        integrationId: app.integrationId
      }
    }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    requireDingTalkOAuthMethod(input.authMethodId)
    const app = await this.resolveConfiguredApp(input.metadata?.integrationId)
    const scopes = resolveDingTalkScopes(input.scopes)
    const token = await requestOAuthToken({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code: input.code,
      grantType: 'authorization_code'
    })
    const profile = await this.fetchUserProfile(token.accessToken)
    const corpId = resolveReturnedCorpId(token, profile)

    return toConnectorCredential(app, token, profile, scopes, corpId)
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    requireDingTalkOAuthMethod(input.authMethodId)
    const app = await this.resolveConfiguredApp(input.credential.data.integrationId)
    const refreshToken = requireString(input.credential.data.refreshToken, 'DingTalk refresh token is missing')
    const token = await requestOAuthToken({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      grantType: 'refresh_token',
      refreshToken
    })
    const profile = await this.fetchUserProfile(token.accessToken).catch((error) => {
      this.logger.warn(`Failed to refresh DingTalk profile: ${errorMessage(error)}`)
      return input.credential.profile ?? undefined
    })
    const corpId = resolveReturnedCorpId(token, profile) ?? readString(input.credential.data.corpId)

    return toConnectorCredential(
      app,
      { ...token, refreshToken: token.refreshToken ?? refreshToken },
      profile,
      input.credential.scopes,
      corpId
    )
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireDingTalkOAuthMethod(input.authMethodId)
    return {
      appId: requireString(input.credential.data.appId, 'DingTalk connector appId is missing'),
      brand: readString(input.credential.data.brand) ?? 'dingtalk',
      accessToken: requireString(input.credential.data.accessToken, 'DingTalk connector access token is missing')
    }
  }

  private async resolveConfiguredApp(integrationId?: unknown): Promise<ResolvedDingTalkApp> {
    const integration = await this.resolveIntegration(integrationId)
    const options = integration.options ?? ({} as DingTalkSystemIntegrationOptions)
    return {
      integrationId: integration.id,
      clientId: requireString(
        options.clientId,
        'DingTalk system integration Client ID (AppKey) is not configured'
      ),
      clientSecret: requireString(
        options.clientSecret,
        'DingTalk system integration Client Secret (AppSecret) is not configured'
      )
    }
  }

  private async resolveIntegration(integrationId?: unknown): Promise<IIntegration<DingTalkSystemIntegrationOptions>> {
    const id = readString(integrationId)
    if (id) {
      const integration = await this.integrationPermissionService.read<IIntegration<DingTalkSystemIntegrationOptions>>(id, {
        relations: ['tenant']
      })
      if (!integration) {
        throw new Error(`DingTalk system integration '${id}' was not found`)
      }
      if (!isDingTalkSystemIntegrationProvider(integration.provider)) {
        throw new Error(`Integration '${id}' is not a DingTalk system integration`)
      }
      return integration
    }

    const service = this.integrationPermissionService
    const result = service.findAllWithInheritance
      ? await service.findAllWithInheritance<IIntegration<DingTalkSystemIntegrationOptions>>({
          where: DINGTALK_SYSTEM_INTEGRATION_PROVIDERS.map((provider) => ({ provider })),
          order: { updatedAt: 'DESC' },
          take: 10
        })
      : await service.findAll<IIntegration<DingTalkSystemIntegrationOptions>>({
          where: DINGTALK_SYSTEM_INTEGRATION_PROVIDERS.map((provider) => ({ provider })),
          order: { updatedAt: 'DESC' },
          take: 10
        })
    const integration = result.items.find(
      (item) => isDingTalkSystemIntegrationProvider(item.provider) && item.options?.clientId && item.options?.clientSecret
    )
    if (!integration) {
      throw new Error(
        'DingTalk system integration is not configured. Configure Client ID (AppKey) and Client Secret (AppSecret) in a DingTalk HTTP or Stream system integration first.'
      )
    }
    return integration
  }

  private async fetchUserProfile(accessToken: string): Promise<ConnectorProfile> {
    const payload = await fetchJson(DINGTALK_CONNECTOR_USER_INFO_URL, {
      headers: {
        accept: 'application/json',
        'x-acs-dingtalk-access-token': accessToken
      }
    })

    return {
      corpId: readString(payload, ['corpId', 'corp_id']) ?? undefined,
      unionId: readString(payload, ['unionId', 'union_id']) ?? undefined,
      openId: readString(payload, ['openId', 'open_id']) ?? undefined,
      userId: readString(payload, ['unionId', 'union_id', 'openId', 'open_id']) ?? undefined,
      name: readString(payload, ['nick', 'name']) ?? undefined,
      avatarUrl: readString(payload, ['avatarUrl', 'avatar_url']) ?? undefined,
      email: readString(payload, ['email']) ?? undefined
    }
  }
}

function isDingTalkSystemIntegrationProvider(provider: string | null | undefined): boolean {
  return !!provider && DINGTALK_SYSTEM_INTEGRATION_PROVIDERS.includes(provider as (typeof DINGTALK_SYSTEM_INTEGRATION_PROVIDERS)[number])
}

type ResolvedDingTalkApp = {
  integrationId: string
  clientId: string
  clientSecret: string
}

type DingTalkSystemIntegrationOptions = {
  clientId?: string
  clientSecret?: string
}

type DingTalkOAuthToken = {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  refreshExpiresIn?: number
  corpId?: string
}

function requireDingTalkOAuthMethod(authMethodId: string) {
  if (authMethodId !== 'oauth2') {
    throw new Error(`Unsupported DingTalk connector authentication method '${authMethodId}'`)
  }
}

async function requestOAuthToken(input: {
  clientId: string
  clientSecret: string
  code?: string
  grantType: 'authorization_code' | 'refresh_token'
  refreshToken?: string
}): Promise<DingTalkOAuthToken> {
  const payload = await fetchJson(DINGTALK_CONNECTOR_TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      ...(input.code ? { code: input.code } : {}),
      grantType: input.grantType,
      ...(input.refreshToken ? { refreshToken: input.refreshToken } : {})
    })
  })

  const accessToken = readString(payload, ['accessToken', 'access_token'])
  if (!accessToken) {
    throw new Error('DingTalk token response did not include accessToken')
  }

  return {
    accessToken,
    refreshToken: readString(payload, ['refreshToken', 'refresh_token']) ?? undefined,
    expiresIn: readNumber(payload, ['expiresIn', 'expireIn', 'expires_in']) ?? undefined,
    refreshExpiresIn:
      readNumber(payload, ['refreshExpiresIn', 'refresh_expires_in', 'refresh_token_expires_in']) ?? undefined,
    corpId: readString(payload, ['corpId', 'corp_id']) ?? undefined
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })
  } catch (error) {
    throw new Error(`DingTalk request failed: ${errorMessage(error)}`)
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    throw new Error(`Failed to read DingTalk response: ${errorMessage(error)}`)
  }

  let payload: unknown
  try {
    payload = text ? JSON.parse(text) : {}
  } catch (error) {
    throw new Error(`DingTalk returned invalid JSON: ${errorMessage(error)}`)
  }

  if (!response.ok) {
    const message =
      readString(payload, ['message', 'error_description', 'errmsg', 'msg']) ??
      `DingTalk request failed with HTTP ${response.status}`
    throw new Error(message)
  }

  return isRecord(payload) ? payload : {}
}

function toConnectorCredential(
  app: ResolvedDingTalkApp,
  token: DingTalkOAuthToken,
  profile: ConnectorProfile | undefined,
  scopes?: string[],
  corpId?: string | null
): ConnectorCredential {
  return {
    data: {
      appId: app.clientId,
      integrationId: app.integrationId,
      brand: 'dingtalk',
      ...(corpId ? { corpId } : {}),
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {})
    },
    ...(token.expiresIn != null ? { expiresAt: toExpiresAt(token.expiresIn) } : {}),
    ...(token.refreshExpiresIn != null ? { refreshExpiresAt: toExpiresAt(token.refreshExpiresIn) } : {}),
    scopes: scopes ?? [...DEFAULT_DINGTALK_SCOPES],
    profile
  }
}

function resolveDingTalkScopes(scopes?: string[]) {
  const resolved: string[] = [...DEFAULT_DINGTALK_SCOPES]
  for (const scope of scopes ?? []) {
    const trimmed = typeof scope === 'string' ? scope.trim() : ''
    if (trimmed && !resolved.includes(trimmed)) {
      resolved.push(trimmed)
    }
  }
  return resolved
}

function resolveReturnedCorpId(token: DingTalkOAuthToken, profile?: ConnectorProfile | null) {
  return token.corpId ?? readString(profile?.corpId)
}

function readString(value: unknown, keys?: string[]) {
  if (keys) {
    const record = isRecord(value) ? value : {}
    for (const key of keys) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }
    return null
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function requireString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) {
    throw new Error(message)
  }
  return result
}

function readNumber(value: unknown, keys: string[]) {
  const record = isRecord(value) ? value : {}
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }
  return null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toExpiresAt(expiresInSeconds: number) {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}
