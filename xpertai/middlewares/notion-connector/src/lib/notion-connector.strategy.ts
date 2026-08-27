import { createHash } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import {
  ConnectorStrategyKey,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type ConnectorAuthorizationCodeInput,
  type ConnectorAppCredentialField,
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
import {
  NOTION_AUTHORIZE_URL,
  NOTION_CONNECTOR_PROVIDER,
  NOTION_PLUGIN_CONTEXT,
  NOTION_PUBLIC_OAUTH_AUTH_METHOD,
  NOTION_SYSTEM_INTEGRATION_PROVIDER
} from './constants.js'
import { NotionConnectorError, readString, requireString } from './errors.js'
import { NotionOAuthClient, type NotionOAuthToken } from './notion-oauth.client.js'
import { NOTION_ICON } from './branding.js'

const INTEGRATION_REQUIRED = 'Configure a Notion system integration before connecting.'

type NotionIntegrationOptions = {
  clientId?: string
  clientSecret?: string
}

type NotionIntegration = IIntegration<NotionIntegrationOptions>

type PendingOAuthMetadata = {
  version: 1
  integrationId: string
  clientIdFingerprint: string
  redirectUri: string
}

type IntegrationCredentialField = Omit<ConnectorAppCredentialField, 'type'> & { type: 'integration'; provider: string }

// Older published SDK declarations do not yet include the integration form field.
function integrationCredentialField(field: IntegrationCredentialField) {
  return field as unknown as ConnectorAppCredentialField
}

@Injectable()
@ConnectorStrategyKey(NOTION_CONNECTOR_PROVIDER)
export class NotionConnectorStrategy implements ConnectorMultiAuthStrategy {
  private integrationService?: IntegrationPermissionService

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: NOTION_CONNECTOR_PROVIDER,
    label: { en_US: 'Notion', zh_Hans: 'Notion' },
    description: {
      en_US: 'Connect a Notion workspace through Notion Public OAuth.',
      zh_Hans: '通过 Notion Public OAuth 连接 Notion 工作区。'
    },
    icon: NOTION_ICON,
    auth: {
      type: 'oauth2',
      authorizationUrl: NOTION_AUTHORIZE_URL,
      tokenUrl: 'https://api.notion.com/v1/oauth/token'
    },
    authMethods: [
      {
        id: NOTION_PUBLIC_OAUTH_AUTH_METHOD,
        type: 'oauth2',
        label: { en_US: 'Notion Public OAuth', zh_Hans: 'Notion Public OAuth' },
        appCredentials: {
          fields: [
            {
              ...integrationCredentialField({
                name: 'integrationId',
                type: 'integration',
                provider: NOTION_SYSTEM_INTEGRATION_PROVIDER,
                required: true,
                label: { en_US: 'Notion system integration', zh_Hans: 'Notion 系统集成' },
                description: {
                  en_US: 'Select the system integration containing the Public OAuth client ID and secret.',
                  zh_Hans: '选择包含 Public OAuth Client ID 和 Client Secret 的系统集成。'
                }
              })
            }
          ],
          help: {
            label: { en_US: 'Configure Notion system integration', zh_Hans: '配置 Notion 系统集成' },
            url: '/settings/integration'
          }
        }
      }
    ],
    permissions: [
      {
        key: 'notion.read_content',
        label: { en_US: 'Read Notion content', zh_Hans: '读取 Notion 内容' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'notion.refresh_token',
        label: { en_US: 'Notion refresh token', zh_Hans: 'Notion 刷新令牌' },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault'
      },
      {
        key: 'notion.oauth_app',
        label: { en_US: 'Notion OAuth application', zh_Hans: 'Notion OAuth 应用' },
        identity: 'tenant',
        credential: 'app_credential',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  constructor(
    @Inject(NOTION_PLUGIN_CONTEXT)
    private readonly pluginContext: PluginContext,
    private readonly oauth: NotionOAuthClient
  ) {}

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireAuthMethod(input.authMethodId)
    const integrationId = requireString(input.values?.integrationId, 'A Notion system integration is required.')
    const app = await this.resolveApp(integrationId)
    const metadata: PendingOAuthMetadata = {
      version: 1,
      integrationId: app.integrationId,
      clientIdFingerprint: fingerprint(app.clientId),
      redirectUri: input.redirectUri
    }
    const authorizationUrl = new URL(NOTION_AUTHORIZE_URL)
    authorizationUrl.searchParams.set('client_id', app.clientId)
    authorizationUrl.searchParams.set('redirect_uri', input.redirectUri)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('owner', 'user')
    authorizationUrl.searchParams.set('state', input.state)
    return { status: 'pending', authorizationUrl: authorizationUrl.toString(), metadata }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    requireAuthMethod(input.authMethodId)
    const pending = readPendingMetadata(input.metadata)
    if (pending.redirectUri !== input.redirectUri) {
      throw new NotionConnectorError(
        'OAUTH_STATE_INVALID',
        'Notion OAuth redirect URI does not match the authorization request.'
      )
    }
    const app = await this.resolveApp(pending.integrationId)
    if (fingerprint(app.clientId) !== pending.clientIdFingerprint) {
      throw new NotionConnectorError(
        'OAUTH_STATE_INVALID',
        'Notion OAuth application configuration changed during authorization.'
      )
    }
    const token = await this.oauth.exchangeCode({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code: input.code,
      redirectUri: input.redirectUri
    })
    return toCredential(app.integrationId, token)
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    requireAuthMethod(input.authMethodId)
    const integrationId = requireString(input.credential.data.integrationId, 'Notion integration ID is missing.')
    const app = await this.resolveApp(integrationId)
    const refreshToken = requireString(input.credential.data.refreshToken, 'Notion refresh token is missing.')
    const token = await this.oauth.refresh({
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      refreshToken
    })
    return toCredential(
      app.integrationId,
      {
        ...token,
        refreshToken: token.refreshToken ?? refreshToken
      },
      input.credential.profile ?? undefined
    )
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireAuthMethod(input.authMethodId)
    return {
      accessToken: requireString(input.credential.data.accessToken, 'Notion access token is missing.'),
      tokenType: readString(input.credential.data.tokenType) ?? 'bearer',
      workspaceId: readString(input.credential.data.workspaceId),
      botId: readString(input.credential.data.botId)
    }
  }

  private get integrationPermissionService(): IntegrationPermissionService {
    this.integrationService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    return this.integrationService
  }

  private async resolveApp(
    integrationId: string
  ): Promise<{ integrationId: string; clientId: string; clientSecret: string }> {
    const integration = await this.integrationPermissionService.read<NotionIntegration>(integrationId, {
      relations: ['tenant']
    })
    if (!integration || integration.provider !== NOTION_SYSTEM_INTEGRATION_PROVIDER) {
      throw new NotionConnectorError('CONNECTOR_UNAVAILABLE', INTEGRATION_REQUIRED)
    }
    const clientId = readString(integration.options?.clientId)
    const clientSecret = readString(integration.options?.clientSecret)
    if (!clientId || !clientSecret) {
      throw new NotionConnectorError(
        'CONNECTOR_UNAVAILABLE',
        'The selected Notion system integration is missing client credentials.'
      )
    }
    return { integrationId: requireString(integration.id, 'Notion integration ID is missing.'), clientId, clientSecret }
  }
}

function requireAuthMethod(authMethodId: string): void {
  if (authMethodId !== NOTION_PUBLIC_OAUTH_AUTH_METHOD) {
    throw new NotionConnectorError(
      'CONNECTOR_UNAVAILABLE',
      `Unsupported Notion authentication method '${authMethodId}'.`
    )
  }
}

function readPendingMetadata(value: Record<string, unknown> | null | undefined): PendingOAuthMetadata {
  const version = value?.version
  const integrationId = readString(value?.integrationId)
  const clientIdFingerprint = readString(value?.clientIdFingerprint)
  const redirectUri = readString(value?.redirectUri)
  if (version !== 1 || !integrationId || !clientIdFingerprint || !redirectUri) {
    throw new NotionConnectorError('OAUTH_STATE_INVALID', 'Notion OAuth session metadata is missing or invalid.')
  }
  return { version: 1, integrationId, clientIdFingerprint, redirectUri }
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function toCredential(integrationId: string, token: NotionOAuthToken, profile?: ConnectorProfile): ConnectorCredential {
  return {
    data: {
      integrationId,
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      botId: token.botId,
      workspaceId: token.workspaceId,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {})
    },
    profile: profile ?? toProfile(token)
  }
}

function toProfile(token: NotionOAuthToken): ConnectorProfile {
  const ownerUser = token.owner?.user
  const owner = ownerUser && typeof ownerUser === 'object' ? (ownerUser as Record<string, unknown>) : undefined
  return {
    userId: readString(owner?.id),
    name: token.workspaceName ?? 'Notion workspace',
    avatarUrl: token.workspaceIcon,
    email: readString((owner?.person as Record<string, unknown> | undefined)?.email),
    workspaceId: token.workspaceId,
    workspaceName: token.workspaceName,
    botId: token.botId
  }
}
