import { Inject, Injectable } from '@nestjs/common'
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
  type ConnectorRuntimeCredentialResolveInput,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import { CANVA_ICON } from './branding.js'
import { CANVA_CONNECT_INTEGRATION_PROVIDER } from './canva-connect-integration.strategy.js'
import { CANVA_MCP_INTEGRATION_PROVIDER } from './canva-mcp-integration.strategy.js'
import {
  CANVA_CONNECT_GLOBAL_AUTH_METHOD,
  CANVA_CONNECT_REVOKE_URL,
  CANVA_CONNECTOR_PROVIDER,
  CANVA_DEFAULT_SCOPES,
  CANVA_MCP_CN_AUTH_METHOD,
  CANVA_MCP_CN_PUBLIC_AUTH_METHOD,
  CANVA_MCP_CN_REVOKE_URL,
  CANVA_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { CanvaConnectorError, readString, requireString } from './errors.js'
import { CanvaMcpClient } from './mcp/canva-mcp.client.js'
import {
  CanvaOAuthClient,
  type CanvaOAuthApp,
  type CanvaOAuthMode,
  type CanvaOAuthToken,
  type CanvaPendingOAuth
} from './oauth/canva-oauth.client.js'
import { CanvaPluginConfigSchema, type CanvaPluginConfig } from './plugin-config.js'
import { CANVA_PLUGIN_CONTEXT } from './tokens.js'

type ConnectorCredentialRevocationInput = {
  connectorId: string
  workspaceId: string
  authMethodId: string
  credential: ConnectorCredential
  reason: 'disconnect' | 'replace'
}

type CanvaIntegrationOptions = { clientId?: string; clientSecret?: string }
type CanvaIntegration = IIntegration<CanvaIntegrationOptions>
type CanvaIntegrationWithId = CanvaIntegration & { id: string }

@Injectable()
@ConnectorStrategyKey(CANVA_CONNECTOR_PROVIDER)
export class CanvaConnectorStrategy implements ConnectorMultiAuthStrategy {
  private _permissionService?: IntegrationPermissionService

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: CANVA_CONNECTOR_PROVIDER,
    connectionScope: 'user',
    label: { en_US: 'Canva', zh_Hans: 'Canva 可画' },
    description: {
      en_US: "Connect each user's Canva account through the Canva MCP service.",
      zh_Hans: '通过 Canva MCP 服务连接每位用户自己的 Canva 账号。'
    },
    icon: CANVA_ICON,
    auth: { type: 'oauth2', scopes: [...CANVA_DEFAULT_SCOPES] },
    authMethods: [
      {
        id: CANVA_MCP_CN_AUTH_METHOD,
        type: 'oauth2',
        label: { en_US: 'Canva China MCP OAuth', zh_Hans: 'Canva 中国区 MCP OAuth' }
      }
    ] as unknown as ConnectorMultiAuthDefinition['authMethods'],
    permissions: [
      {
        key: 'canva.design.read',
        label: { en_US: 'Read Canva designs', zh_Hans: '读取 Canva 设计' },
        identity: 'user',
        scopes: [...CANVA_DEFAULT_SCOPES],
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'canva.design.write',
        label: { en_US: 'Edit Canva designs', zh_Hans: '编辑 Canva 设计' },
        identity: 'user',
        scopes: ['design:content:write'],
        credential: 'access_token',
        storage: 'runtime_only'
      },
      {
        key: 'canva.refresh_token',
        label: { en_US: 'Canva refresh token', zh_Hans: 'Canva 刷新令牌' },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault',
        required: true
      },
      {
        key: 'canva.oauth_app',
        label: { en_US: 'Canva OAuth application', zh_Hans: 'Canva OAuth 应用' },
        identity: 'tenant',
        credential: 'app_credential',
        storage: 'platform_vault'
      }
    ]
  } as unknown as ConnectorMultiAuthDefinition

  constructor(
    private readonly oauth: CanvaOAuthClient,
    private readonly mcp: CanvaMcpClient,
    @Inject(CANVA_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext<CanvaPluginConfig>
  ) {}

  private get permissionService() {
    return (this._permissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN))
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireSystemIntegrationAuthMethod(input.authMethodId)
    const mode = 'mcp-cn' as const
    const app = await this.resolveApp(readString(input.values?.integrationId), mode)
    const authorization = await this.oauth.buildAuthorization(app, input.redirectUri, input.state)
    return {
      status: 'pending',
      authorizationUrl: authorization.authorizationUrl,
      scopes: authorization.scopes,
      metadata: authorization.metadata
    }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    const mode = modeForAuthMethod(input.authMethodId)
    const pending = readPending(input.metadata)
    if (pending.mode !== mode || pending.redirectUri !== input.redirectUri)
      throw new CanvaConnectorError(
        'CANVA_OAUTH_STATE_INVALID',
        'Canva OAuth callback does not match the authorization request'
      )
    const app =
      input.authMethodId === CANVA_MCP_CN_PUBLIC_AUTH_METHOD
        ? await this.resolvePublicApp({
            clientId: requireString(pending.clientId, 'Canva OAuth client id is missing from the authorization state')
          })
        : await this.resolveApp(
            requireString(pending.integrationId, 'Canva System Integration is missing from the authorization state'),
            mode
          )
    const token = await this.oauth.exchangeCode({ pending, app, code: input.code })
    ensureScopes(token.scopes)
    return credentialFrom(app, mode, token)
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    const mode = modeForAuthMethod(input.authMethodId)
    const refreshToken = requireString(input.credential.data.refreshToken, 'Canva refresh token is missing')
    const app =
      input.authMethodId === CANVA_MCP_CN_PUBLIC_AUTH_METHOD
        ? await this.resolvePublicApp({
            clientId: requireString(input.credential.data.clientId, 'Canva OAuth client id is missing')
          })
        : await this.resolveApp(
            requireString(input.credential.data.integrationId, 'Canva integration id is missing'),
            mode
          )
    const token = await this.oauth.refresh({
      app,
      refreshToken,
      pending: { revokeEndpoint: readString(input.credential.data.revokeEndpoint) }
    })
    return credentialFrom(app, mode, token, input.credential.profile)
  }

  async resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    const mode = modeForAuthMethod(input.authMethodId)
    const accessToken = requireString(input.credential.data.accessToken, 'Canva access token is missing')
    const resource = requireString(input.credential.data.resource, 'Canva token resource is missing')
    return { accessToken, resource, mode, runtimeMiddleware: CANVA_RUNTIME_MIDDLEWARE_NAME }
  }

  async revokeConnectionCredential(input: ConnectorCredentialRevocationInput): Promise<void> {
    const mode = modeForAuthMethod(input.authMethodId)
    const accessToken = readString(input.credential.data.accessToken)
    try {
      if (accessToken) {
        const app =
          input.authMethodId === CANVA_MCP_CN_PUBLIC_AUTH_METHOD
            ? await this.resolvePublicApp({
                clientId: requireString(input.credential.data.clientId, 'Canva OAuth client id is missing')
              })
            : await this.resolveApp(
                requireString(input.credential.data.integrationId, 'Canva integration id is missing'),
                mode
              )
        const endpoint =
          readString(input.credential.data.revokeEndpoint) ??
          (app.mode === 'mcp-cn' ? CANVA_MCP_CN_REVOKE_URL : CANVA_CONNECT_REVOKE_URL)
        await this.oauth.revoke({ endpoint, accessToken, clientId: app.clientId, clientSecret: app.clientSecret })
      }
    } finally {
      await this.mcp.closeByConnector(input.connectorId)
    }
  }

  private async resolveApp(integrationId: string | undefined, mode: CanvaOAuthMode): Promise<CanvaOAuthApp> {
    const expected = mode === 'mcp-cn' ? CANVA_MCP_INTEGRATION_PROVIDER : CANVA_CONNECT_INTEGRATION_PROVIDER
    const integration = await this.resolveIntegration(integrationId, expected, mode)
    const clientId = requireString(integration.options?.clientId, 'Canva OAuth client id is missing')
    const clientSecret = requireString(integration.options?.clientSecret, 'Canva OAuth client secret is missing')
    return { integrationId: integration.id, clientId, clientSecret, clientAuthentication: 'client_secret_basic', mode }
  }

  private async resolveIntegration(
    integrationId: string | undefined,
    provider: string,
    mode: CanvaOAuthMode
  ): Promise<CanvaIntegrationWithId> {
    const permissionService = this.permissionService
    if (integrationId) {
      if (!permissionService.read) {
        throw new CanvaConnectorError(
          'CANVA_CONNECTOR_UNAVAILABLE',
          'The host cannot read the Canva System Integration used by this authorization'
        )
      }
      // OAuth callbacks are public requests and may not have RequestContext user/tenant data.
      // Resolve the id directly, then enforce the plugin scope before using its secret.
      const readIntegration = permissionService.read.bind(permissionService)
      const integration = await readIntegration<CanvaIntegration>(integrationId)
      if (
        integration &&
        integration.id === integrationId &&
        integration.provider === provider &&
        isIntegrationInPluginScope(integration, this.pluginContext)
      ) {
        return { ...integration, id: integrationId }
      }
      throw new CanvaConnectorError(
        'CANVA_CONFIGURATION_INVALID',
        `System Integration '${integrationId}' is not a Canva ${mode === 'mcp-cn' ? 'MCP' : 'Connect'} integration`
      )
    }
    if (!permissionService.findAllWithInheritance) {
      throw new CanvaConnectorError(
        'CANVA_CONNECTOR_UNAVAILABLE',
        'The host cannot resolve inherited Canva System Integrations'
      )
    }
    // Keep the service receiver intact: host permission services are Nest providers
    // whose implementation resolves dependencies through `this`.
    const findAllWithInheritance = permissionService.findAllWithInheritance.bind(permissionService)
    const result = await findAllWithInheritance<CanvaIntegration>({
      where: { provider, ...(integrationId ? { id: integrationId } : {}) },
      order: { createdAt: 'ASC' }
    })
    const integrations = result.items.filter(
      (integration): integration is CanvaIntegrationWithId =>
        integration.provider === provider && typeof integration.id === 'string' && integration.id.trim().length > 0
    )
    const selected = selectAutomaticIntegration(integrations)
    if (selected) return selected

    throw new CanvaConnectorError(
      'CANVA_CONNECTOR_UNAVAILABLE',
      'Configure a Canva China MCP OAuth System Integration before connecting'
    )
  }

  private async resolvePublicApp(options: { redirectUri?: string; clientId?: string } = {}): Promise<CanvaOAuthApp> {
    const config = CanvaPluginConfigSchema.parse(this.pluginContext.config ?? {})
    if (config.mcpRegistration === 'static') {
      const configuredClientId = requireString(
        config.mcpClientId,
        'Canva public client id is missing from plugin configuration'
      )
      if (options.clientId && options.clientId !== configuredClientId) {
        throw new CanvaConnectorError(
          'CANVA_OAUTH_STATE_INVALID',
          'Canva OAuth client id does not match plugin configuration'
        )
      }
      return { clientId: configuredClientId, clientAuthentication: 'none', mode: 'mcp-cn' }
    }
    const registeredClientId =
      options.clientId ?? (options.redirectUri ? await this.oauth.registerClient(options.redirectUri) : undefined)
    return {
      clientId: requireString(registeredClientId, 'Canva dynamic registration did not return client id'),
      clientAuthentication: 'none',
      mode: 'mcp-cn'
    }
  }
}

function isIntegrationInPluginScope(integration: CanvaIntegration, context: PluginContext<CanvaPluginConfig>) {
  if (context.tenantId && integration.tenantId !== context.tenantId) return false
  // Organization plugins may use an integration inherited from their tenant.
  if (context.organizationId)
    return !integration.organizationId || integration.organizationId === context.organizationId
  return !integration.organizationId
}

function requireSystemIntegrationAuthMethod(value: string) {
  if (value !== CANVA_MCP_CN_AUTH_METHOD)
    throw new CanvaConnectorError(
      'CANVA_INPUT_INVALID',
      `Unsupported Canva authentication method for a new connection: '${value}'`
    )
}
function selectAutomaticIntegration(integrations: CanvaIntegrationWithId[]): CanvaIntegrationWithId | undefined {
  const organizationIntegrations = integrations.filter((integration) => !!integration.organizationId)
  if (organizationIntegrations.length > 1) {
    throw new CanvaConnectorError(
      'CANVA_CONFIGURATION_INVALID',
      'Multiple Canva China MCP OAuth System Integrations are configured for this organization'
    )
  }
  if (organizationIntegrations[0]) return organizationIntegrations[0]

  const tenantIntegrations = integrations.filter((integration) => !integration.organizationId)
  if (tenantIntegrations.length > 1) {
    throw new CanvaConnectorError(
      'CANVA_CONFIGURATION_INVALID',
      'Multiple Canva China MCP OAuth System Integrations are configured for this tenant'
    )
  }
  return tenantIntegrations[0]
}
function modeForAuthMethod(value: string) {
  if (value === CANVA_MCP_CN_PUBLIC_AUTH_METHOD || value === CANVA_MCP_CN_AUTH_METHOD) return 'mcp-cn' as const
  if (value === CANVA_CONNECT_GLOBAL_AUTH_METHOD) return 'connect-global' as const
  throw new CanvaConnectorError('CANVA_INPUT_INVALID', `Unsupported Canva authentication method '${value}'`)
}
function readPending(value: Record<string, unknown> | null | undefined): CanvaPendingOAuth {
  if (
    !value ||
    value.version !== 1 ||
    (value.mode !== 'mcp-cn' && value.mode !== 'connect-global') ||
    !readString(value.clientIdFingerprint) ||
    !readString(value.codeVerifier) ||
    !readString(value.redirectUri) ||
    !readString(value.authorizationEndpoint) ||
    !readString(value.tokenEndpoint) ||
    !readString(value.revokeEndpoint) ||
    !readString(value.resource) ||
    !Array.isArray(value.scopes) ||
    value.scopes.some((scope) => typeof scope !== 'string')
  )
    throw new CanvaConnectorError('CANVA_OAUTH_STATE_INVALID', 'Canva OAuth session metadata is missing or invalid')
  return {
    version: 1,
    mode: value.mode,
    ...(readString(value.integrationId) ? { integrationId: value.integrationId as string } : {}),
    ...(readString(value.clientId) ? { clientId: value.clientId as string } : {}),
    ...(value.clientAuthentication === 'none' || value.clientAuthentication === 'client_secret_basic'
      ? { clientAuthentication: value.clientAuthentication }
      : {}),
    clientIdFingerprint: value.clientIdFingerprint as string,
    codeVerifier: value.codeVerifier as string,
    redirectUri: value.redirectUri as string,
    authorizationEndpoint: value.authorizationEndpoint as string,
    tokenEndpoint: value.tokenEndpoint as string,
    revokeEndpoint: value.revokeEndpoint as string,
    resource: value.resource as string,
    scopes: value.scopes as string[]
  }
}
function ensureScopes(scopes: string[]) {
  const missing = CANVA_DEFAULT_SCOPES.filter((scope) => !scopes.includes(scope))
  if (missing.length)
    throw new CanvaConnectorError(
      'CANVA_SCOPE_MISSING',
      `Canva authorization is missing required scope: ${missing.join(', ')}`
    )
}
function credentialFrom(
  app: CanvaOAuthApp,
  mode: CanvaOAuthMode,
  token: CanvaOAuthToken,
  profile?: ConnectorCredential['profile']
): ConnectorCredential {
  const now = Date.now()
  return {
    data: {
      ...(app.integrationId ? { integrationId: app.integrationId } : {}),
      clientId: app.clientId,
      mode,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenType: token.tokenType,
      resource: token.resource,
      revokeEndpoint: token.revokeEndpoint
    },
    expiresAt: token.expiresIn ? new Date(now + token.expiresIn * 1000).toISOString() : null,
    refreshExpiresAt: token.refreshExpiresIn ? new Date(now + token.refreshExpiresIn * 1000).toISOString() : null,
    scopes: token.scopes,
    profile
  }
}
