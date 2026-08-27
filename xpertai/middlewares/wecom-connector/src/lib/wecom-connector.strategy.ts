import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import {
  ConnectorStrategyKey,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type ConnectorAuthorizationCodeInput,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorCredential,
  type ConnectorCredentialRefreshInput,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorProfile,
  type ConnectorRuntimeCredentialResolveInput,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { WECOM_CONNECTOR_PLUGIN_CONTEXT } from './tokens.js'
import {
  WECOM_CONNECTOR_ACCESS_TOKEN_URL,
  WECOM_CONNECTOR_AUTHORIZE_URL,
  WECOM_CONNECTOR_AUTH_INTEGRATION_URL,
  WECOM_CONNECTOR_ICON_DEFINITION,
  WECOM_CONNECTOR_PROVIDER,
  WECOM_CONNECTOR_USER_DETAIL_URL,
  WECOM_CONNECTOR_USER_INFO_URL,
  WECOM_AUTH_INTEGRATION_PROVIDER,
  normalizeWeComAppCredentials,
  readNumber,
  readString,
  requireString,
  toExpiresAt,
  toWeComProfile,
  type WeComAccessTokenResponse,
  type WeComConnectorAppCredentials,
  type WeComUserDetail,
  type WeComUserInfo
} from './types.js'

const WECOM_AUTH_METHOD = 'wecom-qr'
const WECOM_INTEGRATION_REQUIRED_MESSAGE =
  'Configure a WeCom connector authentication integration at tenant or organization scope before connecting.'

type WeComAuthIntegration = IIntegration<WeComConnectorAppCredentials>

@Injectable()
@ConnectorStrategyKey(WECOM_CONNECTOR_PROVIDER)
export class WeComConnectorStrategy implements ConnectorMultiAuthStrategy {
  private _integrationPermissionService?: IntegrationPermissionService

  constructor(@Inject(WECOM_CONNECTOR_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    this._integrationPermissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    return this._integrationPermissionService
  }

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: WECOM_CONNECTOR_PROVIDER,
    label: {
      en_US: 'WeCom',
      zh_Hans: '企业微信'
    },
    description: {
      en_US: 'Connect WeCom by scanning a QR code using the current organization or tenant application.',
      zh_Hans: '使用当前组织或租户配置的企业微信应用扫码连接企业微信。'
    },
    icon: WECOM_CONNECTOR_ICON_DEFINITION,
    authMethods: [
      {
        id: WECOM_AUTH_METHOD,
        type: 'oauth2',
        label: {
          en_US: 'WeCom QR login',
          zh_Hans: '企业微信扫码登录'
        },
        appCredentials: {
          help: {
            label: { en_US: 'Configure WeCom OAuth', zh_Hans: '配置企业微信认证' },
            url: WECOM_CONNECTOR_AUTH_INTEGRATION_URL
          }
        }
      }
    ],
    permissions: [
      {
        key: 'wecom.user_access_token',
        label: { en_US: 'WeCom user access token', zh_Hans: '企业微信用户访问令牌' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'wecom.app_credential',
        label: { en_US: 'WeCom app credential', zh_Hans: '企业微信应用凭据' },
        identity: 'app',
        credential: 'app_credential',
        storage: 'platform_vault'
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireWeComAuthMethod(input.authMethodId)
    const app = await this.resolveWeComApp()
    const authorizationUrl = new URL(WECOM_CONNECTOR_AUTHORIZE_URL)
    authorizationUrl.searchParams.set('appid', app.corpId)
    authorizationUrl.searchParams.set('agentid', app.agentId)
    authorizationUrl.searchParams.set('redirect_uri', input.redirectUri)
    authorizationUrl.searchParams.set('state', input.state)

    return {
      status: 'pending',
      authorizationUrl: authorizationUrl.toString(),
      metadata: { integrationId: app.integrationId }
    }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    requireWeComAuthMethod(input.authMethodId)
    const integrationId = requireString(input.metadata?.integrationId, 'WeCom integration is missing from OAuth state')
    const app = await this.resolveWeComApp(integrationId)
    const token = await requestWeComAccessToken(app)
    const userInfo = await requestWeComUserInfo(token.accessToken, input.code)
    const detail = userInfo.userTicket ? await requestWeComUserDetail(token.accessToken, userInfo.userTicket) : null

    return toConnectorCredential(app, integrationId, token, toWeComProfile({ userInfo, detail }))
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    requireWeComAuthMethod(input.authMethodId)
    const integrationId = requireString(input.credential.data.integrationId, 'WeCom integration is missing')
    const app = await this.resolveWeComApp(integrationId)
    const token = await requestWeComAccessToken(app)
    return toConnectorCredential(app, integrationId, token, input.credential.profile ?? undefined)
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireWeComAuthMethod(input.authMethodId)
    return {
      accessToken: requireString(input.credential.data.accessToken, 'WeCom connector access token is missing'),
      corpId: requireString(input.credential.data.corpId, 'WeCom connector corpId is missing'),
      agentId: requireString(input.credential.data.agentId, 'WeCom connector agentId is missing'),
      userId: readString(input.credential.profile?.userId),
      openId: readString(input.credential.profile?.openId),
      unionId: readString(input.credential.profile?.unionId)
    }
  }

  private async resolveWeComApp(integrationId?: string): Promise<ResolvedWeComApp> {
    if (!this.integrationPermissionService.findAllWithInheritance) {
      throw new Error('The host does not support inherited integration lookup')
    }

    const result = await this.integrationPermissionService.findAllWithInheritance<WeComAuthIntegration>({
      where: {
        provider: WECOM_AUTH_INTEGRATION_PROVIDER,
        ...(integrationId ? { id: integrationId } : {})
      },
      order: { createdAt: 'ASC' }
    })
    const integrations = (result.items ?? []).filter(
      (integration) =>
        integration.provider === WECOM_AUTH_INTEGRATION_PROVIDER && (!integrationId || integration.id === integrationId)
    )
    const candidates = integrationId
      ? integrations
      : [...integrations].sort(
          (left, right) => Number(left.organizationId == null) - Number(right.organizationId == null)
        )

    for (const integration of candidates) {
      const app = readWeComApp(integration)
      if (app && integration.id) {
        return { ...app, integrationId: integration.id }
      }
    }

    if (integrationId && integrations.length) {
      throw new BadRequestException('The selected WeCom integration is missing CorpID, AgentID, or CorpSecret.')
    }
    throw new BadRequestException(WECOM_INTEGRATION_REQUIRED_MESSAGE)
  }
}

type ResolvedWeComApp = WeComConnectorAppCredentials & { integrationId: string }

function readWeComApp(integration: WeComAuthIntegration): WeComConnectorAppCredentials | null {
  try {
    return normalizeWeComAppCredentials(integration.options as Record<string, unknown> | undefined)
  } catch {
    return null
  }
}

async function requestWeComAccessToken(app: WeComConnectorAppCredentials): Promise<WeComAccessTokenResponse> {
  const payload = await fetchWeComJson(WECOM_CONNECTOR_ACCESS_TOKEN_URL, {
    corpid: app.corpId,
    corpsecret: app.corpSecret
  })
  const accessToken = requireString(payload.access_token, 'WeCom token response did not include access_token')
  return { accessToken, expiresIn: readNumber(payload.expires_in) }
}

async function requestWeComUserInfo(accessToken: string, code: string): Promise<WeComUserInfo> {
  const payload = await fetchWeComJson(WECOM_CONNECTOR_USER_INFO_URL, { access_token: accessToken, code })
  return {
    userId: readString(payload.userid) ?? readString(payload.UserId),
    openUserId: readString(payload.open_userid),
    userTicket: readString(payload.user_ticket)
  }
}

async function requestWeComUserDetail(accessToken: string, userTicket: string): Promise<WeComUserDetail> {
  const payload = await fetchWeComJson(
    `${WECOM_CONNECTOR_USER_DETAIL_URL}?access_token=${encodeURIComponent(accessToken)}`,
    {},
    {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ user_ticket: userTicket })
    }
  )
  return {
    userId: readString(payload.userid),
    name: readString(payload.name),
    avatarUrl: readString(payload.avatar),
    email: readString(payload.email),
    mobile: readString(payload.mobile),
    openUserId: readString(payload.open_userid),
    unionId: readString(payload.unionid)
  }
}

async function fetchWeComJson(url: string, query: Record<string, string>, init: RequestInit = {}) {
  const parsed = new URL(url)
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value)

  let response: Response
  try {
    response = await fetch(parsed.toString(), {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000)
    })
  } catch (error) {
    throw new Error(`WeCom request failed: ${networkErrorMessage(error)}.`)
  }

  const payload = await readJson(response)
  if (!response.ok) throw new Error(`WeCom request failed with HTTP ${response.status}.`)
  const errcode = readNumber(payload.errcode) ?? 0
  if (errcode !== 0) throw new Error(readString(payload.errmsg) ?? `WeCom request failed with errcode ${errcode}`)
  return payload
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json()
    return isRecord(value) ? value : {}
  } catch {
    return {}
  }
}

function toConnectorCredential(
  app: WeComConnectorAppCredentials,
  integrationId: string,
  token: WeComAccessTokenResponse,
  profile?: ConnectorProfile
): ConnectorCredential {
  return {
    data: {
      integrationId,
      corpId: app.corpId,
      agentId: app.agentId,
      accessToken: token.accessToken
    },
    expiresAt: toExpiresAt(token.expiresIn),
    profile
  }
}

function requireWeComAuthMethod(authMethodId: string) {
  if (authMethodId !== WECOM_AUTH_METHOD) {
    throw new Error(`Unsupported WeCom connector authentication method '${authMethodId}'`)
  }
}

function networkErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (!(cause instanceof Error)) return error.message
  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null
  const causeMessage = cause.message === error.message ? null : cause.message
  const detail = [code, causeMessage].filter(Boolean).join(': ')
  return detail ? `${error.message} (${detail})` : error.message
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
