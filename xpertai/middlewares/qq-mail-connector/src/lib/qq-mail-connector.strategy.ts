import { createHash, randomBytes } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import type { IIntegration } from '@xpert-ai/contracts'
import {
  ConnectorStrategyKey,
  type ConnectorAppCredentialField,
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
import { QQ_MAIL_ICON } from './branding.js'
import {
  QQ_MAIL_AUTH_METHOD,
  QQ_MAIL_BASE_SCOPES,
  QQ_MAIL_CONNECTOR_PROVIDER,
  QQ_MAIL_PROTOCOL_AUTH_METHOD,
  QQ_MAIL_RUNTIME_MIDDLEWARE_NAME,
  QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER,
  QQ_MAIL_RESOURCE
} from './constants.js'
import { QqMailConnectorError } from './errors.js'
import { QqMailMcpClient } from './mcp/qq-mail-mcp.client.js'
import type { QqMailAccount } from './mcp/types.js'
import { QqMailOAuthClient, type QqMailToken } from './oauth/qq-mail-oauth.client.js'
import { createQqMailProtocolCredential, readRequiredString } from './protocol/credential.js'
import { QqMailProtocolService } from './protocol/qq-mail-protocol.service.js'
import type { QqMailIntegrationOptions } from './qq-mail-integration.strategy.js'
import { QQ_MAIL_PLUGIN_CONTEXT } from './tokens.js'

type PendingOAuthMetadata = {
  clientId: string
  codeVerifier: string
  redirectUri: string
  tokenEndpoint: string
  resource: string
  scopes: string[]
}

type IntegrationCredentialField = Omit<ConnectorAppCredentialField, 'type'> & {
  type: 'integration'
  provider: string
}

// Remove this compatibility boundary once the published SDK includes integration credential fields.
function integrationCredentialField(field: IntegrationCredentialField): ConnectorAppCredentialField {
  return field as unknown as ConnectorAppCredentialField
}

@Injectable()
@ConnectorStrategyKey(QQ_MAIL_CONNECTOR_PROVIDER)
export class QqMailConnectorStrategy implements ConnectorMultiAuthStrategy {
  private _integrationPermissionService?: IntegrationPermissionService

  constructor(
    private readonly oauth: QqMailOAuthClient,
    private readonly mcp: QqMailMcpClient,
    private readonly mailService: QqMailProtocolService,
    @Inject(QQ_MAIL_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext
  ) {}

  private get integrationPermissionService(): IntegrationPermissionService {
    return (this._integrationPermissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN))
  }

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: QQ_MAIL_CONNECTOR_PROVIDER,
    label: { en_US: 'QQ Mail', zh_Hans: 'QQ 邮箱' },
    description: {
      en_US: 'Connect QQ Mail using QR-code OAuth or a System Integration with an IMAP/SMTP authorization code.',
      zh_Hans: '可使用 QQ 邮箱扫码 OAuth，或通过系统集成中的 IMAP/SMTP 授权码连接邮箱。'
    },
    icon: QQ_MAIL_ICON,
    legacyAuthMethodId: QQ_MAIL_AUTH_METHOD,
    auth: {
      type: 'oauth2',
      scopes: [...QQ_MAIL_BASE_SCOPES]
    },
    authMethods: [
      {
        id: QQ_MAIL_PROTOCOL_AUTH_METHOD,
        type: 'api_key',
        label: { en_US: 'IMAP/SMTP authentication', zh_Hans: 'IMAP/SMTP 认证' },
        credentials: {
          fields: [
            integrationCredentialField({
              name: 'integrationId',
              label: { en_US: 'QQ Mail System Integration', zh_Hans: 'QQ 邮箱系统集成' },
              type: 'integration',
              provider: QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER,
              required: true,
              placeholder: { en_US: 'Select a QQ Mail integration', zh_Hans: '选择 QQ 邮箱系统集成' },
              description: {
                en_US:
                  'Create or select credentials containing the full mailbox address and 16-character authorization code.',
                zh_Hans: '创建或选择包含完整邮箱地址和 16 位授权码的系统集成。'
              }
            })
          ],
          help: {
            label: {
              en_US: 'Enable IMAP/SMTP in QQ Mail before connecting',
              zh_Hans: '连接前请先在 QQ 邮箱中启用 IMAP/SMTP'
            },
            url: 'https://mail.qq.com/'
          }
        }
      },
      {
        id: QQ_MAIL_AUTH_METHOD,
        type: 'oauth2',
        label: { en_US: 'OAuth authentication', zh_Hans: 'OAuth 认证' }
      }
    ],
    permissions: [
      {
        key: 'qq-mail.access_token',
        label: { en_US: 'QQ Mail access token', zh_Hans: 'QQ 邮箱访问令牌' },
        identity: 'user',
        scopes: [...QQ_MAIL_BASE_SCOPES],
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      },
      {
        key: 'qq-mail.refresh_token',
        label: { en_US: 'QQ Mail refresh token', zh_Hans: 'QQ 邮箱刷新令牌' },
        identity: 'user',
        credential: 'refresh_token',
        storage: 'platform_vault',
        required: true
      },
      {
        key: 'qq-mail.imap-smtp-integration',
        label: { en_US: 'QQ Mail IMAP/SMTP System Integration', zh_Hans: 'QQ 邮箱 IMAP/SMTP 系统集成' },
        description: {
          en_US:
            'The connector stores only the System Integration ID; the authorization code remains in the platform vault.',
          zh_Hans: '连接器仅保存系统集成 ID，授权码始终保留在平台凭据库中。'
        },
        identity: 'user',
        scopes: [...QQ_MAIL_BASE_SCOPES],
        credential: 'app_credential',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    if (input.authMethodId === QQ_MAIL_PROTOCOL_AUTH_METHOD) {
      return this.connectProtocol(input)
    }
    const scopes = scopesForMethod(input.authMethodId)
    const metadata = await this.oauth.discover()
    const clientId = await this.oauth.registerClient(metadata, input.redirectUri)
    const codeVerifier = randomBytes(48).toString('base64url')
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
    const authorizationUrl = new URL(metadata.authorizationEndpoint)
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('client_id', clientId)
    authorizationUrl.searchParams.set('redirect_uri', input.redirectUri)
    authorizationUrl.searchParams.set('scope', scopes.join(' '))
    authorizationUrl.searchParams.set('state', input.state)
    authorizationUrl.searchParams.set('code_challenge', codeChallenge)
    authorizationUrl.searchParams.set('code_challenge_method', 'S256')
    authorizationUrl.searchParams.set('resource', metadata.resource)

    return {
      status: 'pending',
      authorizationUrl: authorizationUrl.toString(),
      scopes,
      metadata: {
        clientId,
        codeVerifier,
        redirectUri: input.redirectUri,
        tokenEndpoint: metadata.tokenEndpoint,
        resource: metadata.resource,
        scopes
      }
    }
  }

  async exchangeAuthorizationCode(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential> {
    const expectedScopes = scopesForMethod(input.authMethodId)
    const pending = readPendingMetadata(input.metadata)
    if (pending.redirectUri !== input.redirectUri) {
      throw new QqMailConnectorError(
        'CALLBACK_REJECTED',
        'QQ Mail OAuth callback URI does not match the authorization request'
      )
    }
    if (pending.resource !== QQ_MAIL_RESOURCE || !sameScopes(pending.scopes, expectedScopes)) {
      throw new QqMailConnectorError('OAUTH_STATE_INVALID', 'QQ Mail OAuth session metadata is invalid')
    }
    const token = await this.oauth.exchangeCode({
      tokenEndpoint: pending.tokenEndpoint,
      clientId: pending.clientId,
      code: input.code,
      codeVerifier: pending.codeVerifier,
      redirectUri: input.redirectUri
    })
    const account = await this.mcp.getAccount(`oauth:${pending.clientId}`, token.accessToken)
    ensureScopes(account, expectedScopes)
    return toCredential(pending.clientId, token, expectedScopes, toProfile(account))
  }

  async refreshConnectionCredential(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential> {
    scopesForMethod(input.authMethodId)
    const clientId = requireCredentialString(input.credential.data.clientId, 'QQ Mail OAuth client ID is missing')
    const refreshToken = requireCredentialString(input.credential.data.refreshToken, 'QQ Mail refresh token is missing')
    const token = await this.oauth.refresh({ clientId, refreshToken })
    return toCredential(
      clientId,
      { ...token, refreshToken: token.refreshToken ?? refreshToken },
      token.scopes.length ? token.scopes : input.credential.scopes ?? [],
      input.credential.profile ?? undefined
    )
  }

  async resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    if (input.authMethodId === QQ_MAIL_PROTOCOL_AUTH_METHOD) {
      const integrationId = readRequiredString(input.credential.data.integrationId, 'QQ Mail System Integration')
      const integration = await this.resolveIntegration(integrationId)
      const credential = this.integrationCredential(integration)
      return { protocol: 'imap-smtp', integrationId, ...credential }
    }
    scopesForMethod(input.authMethodId)
    return {
      accessToken: requireCredentialString(input.credential.data.accessToken, 'QQ Mail access token is missing'),
      tokenType: requireCredentialString(input.credential.data.tokenType, 'QQ Mail token type is missing'),
      resource: QQ_MAIL_RESOURCE
    }
  }

  private async connectProtocol(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    const integrationId = readRequiredString(input.values?.integrationId, 'QQ Mail System Integration')
    const integration = await this.resolveIntegration(integrationId)
    const credential = this.integrationCredential(integration)
    await this.mailService.verifyCredential(credential)
    return {
      status: 'active',
      credential: {
        data: { integrationId },
        scopes: [...QQ_MAIL_BASE_SCOPES],
        profile: {
          email: credential.email,
          name: credential.email,
          runtimeMiddleware: QQ_MAIL_RUNTIME_MIDDLEWARE_NAME,
          authentication: 'imap-smtp'
        }
      }
    }
  }

  private async resolveIntegration(id: string): Promise<IIntegration<QqMailIntegrationOptions>> {
    const integration = await this.integrationPermissionService.read<IIntegration<QqMailIntegrationOptions>>(id, {
      relations: ['tenant']
    })
    if (!integration) {
      throw new Error(`QQ Mail System Integration '${id}' was not found or is outside the current organization`)
    }
    if (integration.provider !== QQ_MAIL_SYSTEM_INTEGRATION_PROVIDER) {
      throw new Error(`System Integration '${id}' is not a QQ Mail IMAP/SMTP integration`)
    }
    return integration
  }

  private integrationCredential(integration: IIntegration<QqMailIntegrationOptions>) {
    const options = integration.options ?? ({} as QqMailIntegrationOptions)
    return createQqMailProtocolCredential(
      readRequiredString(options.email, 'Full QQ Mail address'),
      readRequiredString(options.authorizationCode, 'QQ Mail authorization code')
    )
  }
}

function scopesForMethod(authMethodId: string) {
  if (authMethodId === QQ_MAIL_AUTH_METHOD) return [...QQ_MAIL_BASE_SCOPES]
  throw new Error(`Unsupported QQ Mail connector authentication method '${authMethodId}'`)
}

function readPendingMetadata(value: Record<string, unknown> | null | undefined): PendingOAuthMetadata {
  const clientId = readString(value?.clientId)
  const codeVerifier = readString(value?.codeVerifier)
  const redirectUri = readString(value?.redirectUri)
  const tokenEndpoint = readString(value?.tokenEndpoint)
  const resource = readString(value?.resource)
  const scopes = Array.isArray(value?.scopes)
    ? value.scopes.map(readString).filter((scope): scope is string => !!scope)
    : []
  if (!clientId || !codeVerifier || !redirectUri || !tokenEndpoint || !resource || !scopes.length) {
    throw new QqMailConnectorError('OAUTH_STATE_INVALID', 'QQ Mail OAuth session metadata is missing or invalid')
  }
  return { clientId, codeVerifier, redirectUri, tokenEndpoint, resource, scopes }
}

function ensureScopes(account: QqMailAccount, expected: string[]) {
  const missing = expected.filter((scope) => !account.scopes.includes(scope))
  if (missing.length) {
    throw new QqMailConnectorError(
      'SCOPE_MISSING',
      `QQ Mail authorization is missing required scope: ${missing.join(', ')}`
    )
  }
}

function toCredential(
  clientId: string,
  token: QqMailToken,
  fallbackScopes: string[],
  profile?: ConnectorProfile
): ConnectorCredential {
  const now = Date.now()
  const scopes = token.scopes.length ? token.scopes : fallbackScopes
  return {
    data: {
      clientId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenType: token.tokenType,
      resource: QQ_MAIL_RESOURCE
    },
    expiresAt: token.expiresIn ? new Date(now + token.expiresIn * 1000).toISOString() : null,
    refreshExpiresAt: token.refreshExpiresIn ? new Date(now + token.refreshExpiresIn * 1000).toISOString() : null,
    scopes,
    profile
  }
}

function toProfile(account: QqMailAccount): ConnectorProfile {
  const primary = account.aliases.find((alias) => alias.isPrimary) ?? account.aliases[0]
  if (!primary) {
    throw new QqMailConnectorError('MCP_TOOL_FAILED', 'QQ Mail account does not expose an email alias')
  }
  return {
    email: primary.email,
    name: primary.name ?? primary.email,
    aliases: account.aliases.map((alias) => ({ email: alias.email, name: alias.name, isPrimary: alias.isPrimary }))
  }
}

function sameScopes(left: string[], right: string[]) {
  return left.length === right.length && left.every((scope) => right.includes(scope))
}

function requireCredentialString(value: unknown, message: string) {
  const result = readString(value)
  if (!result) throw new QqMailConnectorError('TOKEN_EXPIRED', message)
  return result
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
