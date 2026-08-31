import { createHash, randomBytes } from 'node:crypto'
import type { IIntegration } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  type ConnectorAppCredentialField,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorConnectionPollInput,
  type ConnectorConnectionPollResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput,
  type IntegrationPermissionService,
  type PluginContext
} from '@xpert-ai/plugin-sdk'
import {
  WECOM_AUTH_INTEGRATION_PROVIDER,
  WECOM_AUTH_INTEGRATION_URL,
  WECOM_CLI_AUTH_URL,
  WECOM_CLI_MANUAL_AUTH_METHOD,
  WECOM_CLI_QR_AUTH_METHOD,
  WECOM_CONNECTOR_ICON,
  WECOM_CONNECTOR_PROVIDER,
  WECOM_LEGACY_AUTH_METHOD,
  WECOM_QR_AUTHORIZATION_TTL_MS,
  WECOM_QR_GENERATE_URL,
  WECOM_QR_POLL_INTERVAL_SECONDS,
  WECOM_QR_QUERY_URL,
  WECOM_QR_SOURCE,
  isRecord,
  readNumber,
  readString,
  requireString,
  type WeComAuthIntegrationOptions,
  type WeComBotCredential
} from './types.js'
import { WECOM_CONNECTOR_PLUGIN_CONTEXT } from './tokens.js'

type PendingQrAuthorization = {
  version: 1
  scode: string
  issuedAt: string
  expiresAt: string
}

type WeComQrGenerateData = {
  scode: string
  authUrl: string
}

type WeComAuthIntegration = IIntegration<WeComAuthIntegrationOptions>

type IntegrationCredentialField = Omit<ConnectorAppCredentialField, 'type'> & {
  type: 'integration'
  provider: string
}

function integrationCredentialField(field: IntegrationCredentialField) {
  return field as unknown as ConnectorAppCredentialField
}

@Injectable()
@ConnectorStrategyKey(WECOM_CONNECTOR_PROVIDER)
export class WeComConnectorStrategy implements ConnectorMultiAuthStrategy {
  private _integrationPermissionService?: IntegrationPermissionService

  constructor(@Inject(WECOM_CONNECTOR_PLUGIN_CONTEXT) private readonly pluginContext: PluginContext) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: WECOM_CONNECTOR_PROVIDER,
    label: { en_US: 'WeCom', zh_Hans: '企业微信' },
    description: {
      en_US: 'Connect an official WeCom AI Bot by QR code or Bot ID and Secret for use with WeCom CLI.',
      zh_Hans: '通过扫码或 Bot ID 与 Secret 连接企业微信智能机器人，并供企业微信 CLI 使用。'
    },
    icon: { type: 'svg', value: WECOM_CONNECTOR_ICON },
    authMethods: [
      {
        id: WECOM_CLI_QR_AUTH_METHOD,
        type: 'oauth2',
        label: { en_US: 'WeCom AI Bot QR connection', zh_Hans: '企业微信智能机器人扫码连接' }
      },
      {
        id: WECOM_CLI_MANUAL_AUTH_METHOD,
        type: 'api_key',
        label: { en_US: 'WeCom AI Bot credentials', zh_Hans: '企业微信智能机器人凭据' },
        credentials: {
          fields: [
            integrationCredentialField({
              name: 'integrationId',
              type: 'integration',
              provider: WECOM_AUTH_INTEGRATION_PROVIDER,
              required: true,
              label: { en_US: 'WeCom system integration', zh_Hans: '企业微信系统集成' },
              description: {
                en_US: 'Select the system integration containing the WeCom AI Bot ID and Secret.',
                zh_Hans: '选择包含企业微信智能机器人 Bot ID 和 Secret 的系统集成。'
              }
            })
          ],
          help: {
            label: { en_US: 'Configure WeCom system integration', zh_Hans: '配置企业微信系统集成' },
            url: WECOM_AUTH_INTEGRATION_URL
          }
        }
      }
    ],
    permissions: [
      {
        key: 'wecom.ai_bot_credential',
        label: { en_US: 'WeCom AI Bot credential', zh_Hans: '企业微信智能机器人凭据' },
        description: {
          en_US: 'The Bot ID and Secret are encrypted by the platform and resolved only inside the connector runtime.',
          zh_Hans: 'Bot ID 与 Secret 由平台加密保存，仅在连接器运行时解析。'
        },
        identity: 'app',
        credential: 'app_credential',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    if (input.authMethodId === WECOM_CLI_MANUAL_AUTH_METHOD) {
      const integrationId = requireString(input.values?.integrationId, 'A WeCom system integration is required.')
      const configured = await this.resolveConfiguredCredential(integrationId)
      await validateBotCredential(configured.credential, 1)
      return activeCredential(configured.credential, configured.integrationId)
    }

    if (input.authMethodId === WECOM_LEGACY_AUTH_METHOD) {
      throw new Error(
        'This WeCom connection uses the retired application OAuth flow. Reconnect it with WeCom AI Bot QR authentication.'
      )
    }
    requireQrAuthMethod(input.authMethodId)

    const qr = await createQrAuthorization()
    const now = Date.now()
    const metadata: PendingQrAuthorization = {
      version: 1,
      scode: qr.scode,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + WECOM_QR_AUTHORIZATION_TTL_MS).toISOString()
    }
    return {
      status: 'pending',
      // The official endpoint returns the URL encoded by the QR itself. The
      // /ai/qc/gen page renders that QR again and would create a QR-in-QR flow.
      authorizationUrl: qr.authUrl,
      pollIntervalSeconds: WECOM_QR_POLL_INTERVAL_SECONDS,
      metadata
    }
  }

  async pollConnection(input: ConnectorConnectionPollInput): Promise<ConnectorConnectionPollResult> {
    requireQrAuthMethod(input.authMethodId)
    const pending = readPendingQrAuthorization(input.metadata)
    if (Date.now() >= Date.parse(pending.expiresAt)) {
      return { status: 'error', error: 'WeCom QR authorization timed out. Start the connection again.' }
    }

    const result = await queryQrAuthorization(pending.scode)
    if (!result) {
      return {
        status: 'pending',
        pollIntervalSeconds: WECOM_QR_POLL_INTERVAL_SECONDS,
        metadata: pending
      }
    }

    await validateBotCredential(result, 2)
    return { status: 'complete', credential: activeCredential(result).credential }
  }

  async resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput): Promise<WeComBotCredential> {
    if (input.authMethodId === WECOM_LEGACY_AUTH_METHOD) {
      throw new Error('This WeCom connection must be reauthorized with the official WeCom AI Bot connector.')
    }
    if (input.authMethodId !== WECOM_CLI_QR_AUTH_METHOD && input.authMethodId !== WECOM_CLI_MANUAL_AUTH_METHOD) {
      throw new Error(`Unsupported WeCom connector authentication method '${input.authMethodId}'.`)
    }
    const integrationId = readString(input.credential.data.integrationId)
    if (integrationId) {
      return (await this.resolveConfiguredCredential(integrationId)).credential
    }
    return {
      botId: requireString(input.credential.data.botId, 'WeCom connector Bot ID is missing.'),
      botSecret: requireString(input.credential.data.botSecret, 'WeCom connector Bot Secret is missing.')
    }
  }

  private get integrationPermissionService(): IntegrationPermissionService {
    this._integrationPermissionService ??= this.pluginContext.resolve(INTEGRATION_PERMISSION_SERVICE_TOKEN)
    return this._integrationPermissionService
  }

  private async resolveConfiguredCredential(
    integrationId?: unknown
  ): Promise<{ integrationId: string; credential: WeComBotCredential }> {
    const id = readString(integrationId)
    let integration: WeComAuthIntegration | null = null

    if (id) {
      integration = await this.integrationPermissionService.read<WeComAuthIntegration>(id, {
        relations: ['tenant']
      })
      if (!integration) throw new Error(`WeCom system integration '${id}' was not found.`)
      if (integration.provider !== WECOM_AUTH_INTEGRATION_PROVIDER) {
        throw new Error(`Integration '${id}' is not a WeCom AI Bot system integration.`)
      }
    } else {
      const result = this.integrationPermissionService.findAllWithInheritance
        ? await this.integrationPermissionService.findAllWithInheritance<WeComAuthIntegration>({
            where: { provider: WECOM_AUTH_INTEGRATION_PROVIDER },
            order: { updatedAt: 'DESC' },
            take: 10
          })
        : await this.integrationPermissionService.findAll<WeComAuthIntegration>({
            where: { provider: WECOM_AUTH_INTEGRATION_PROVIDER },
            order: { updatedAt: 'DESC' },
            take: 10
          })
      integration =
        result.items.find(
          (item) =>
            item.provider === WECOM_AUTH_INTEGRATION_PROVIDER &&
            readString(item.options?.botId) &&
            readString(item.options?.botSecret)
        ) ?? null
    }

    const botId = readString(integration?.options?.botId)
    const botSecret = readString(integration?.options?.botSecret)
    if (!integration || !botId || !botSecret) {
      throw new Error(
        'WeCom AI Bot system integration is missing Bot ID or Secret. Configure both fields in System Integrations.'
      )
    }
    return {
      integrationId: requireString(integration.id, 'WeCom system integration ID is missing.'),
      credential: { botId, botSecret }
    }
  }
}

function activeCredential(credential: WeComBotCredential, integrationId?: string) {
  return {
    status: 'active' as const,
    credential: {
      data: integrationId ? { integrationId } : credential,
      profile: {
        name: 'WeCom AI Bot',
        identityType: 'bot'
      }
    }
  }
}

async function createQrAuthorization(): Promise<WeComQrGenerateData> {
  const url = new URL(WECOM_QR_GENERATE_URL)
  url.searchParams.set('source', WECOM_QR_SOURCE)
  url.searchParams.set('plat', '3')
  const payload = await fetchJson(url.toString())
  const data = isRecord(payload.data) ? payload.data : {}
  return {
    scode: requireString(data.scode, 'WeCom QR response did not include a session code.'),
    authUrl: requireString(data.auth_url, 'WeCom QR response did not include an authorization URL.')
  }
}

async function queryQrAuthorization(scode: string): Promise<WeComBotCredential | null> {
  const url = new URL(WECOM_QR_QUERY_URL)
  url.searchParams.set('scode', scode)
  const payload = await fetchJson(url.toString())
  const data = isRecord(payload.data) ? payload.data : {}
  if (readString(data.status) !== 'success') return null
  const bot = isRecord(data.bot_info) ? data.bot_info : {}
  return {
    botId: requireString(bot.botid, 'WeCom QR authorization did not include Bot ID.'),
    botSecret: requireString(bot.secret, 'WeCom QR authorization did not include Bot Secret.')
  }
}

async function validateBotCredential(credential: WeComBotCredential, bindSource: 1 | 2): Promise<void> {
  const time = Math.floor(Date.now() / 1000)
  const nonce = `cli_${Date.now()}_${randomBytes(4).toString('hex')}`
  const signature = createHash('sha256')
    .update(`${credential.botSecret}${credential.botId}${time}${nonce}`)
    .digest('hex')
  const payload = await fetchJson(WECOM_CLI_AUTH_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      bot_id: credential.botId,
      time,
      nonce,
      signature,
      bind_source: bindSource
    })
  })
  const errcode = readNumber(payload.errcode) ?? 0
  if (errcode !== 0) {
    throw new Error(readString(payload.errmsg) ?? `WeCom AI Bot authentication failed with errcode ${errcode}.`)
  }
  requireString(payload.token, 'WeCom AI Bot authentication did not return a token.')
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) })
  } catch (error) {
    throw new Error(`WeCom request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok) throw new Error(`WeCom request failed with HTTP ${response.status}.`)
  return isRecord(payload) ? payload : {}
}

function readPendingQrAuthorization(value: Record<string, unknown> | null | undefined): PendingQrAuthorization {
  const scode = readString(value?.scode)
  const issuedAt = readString(value?.issuedAt)
  const expiresAt = readString(value?.expiresAt)
  if (
    value?.version !== 1 ||
    !scode ||
    !/^[A-Za-z0-9_-]{8,256}$/.test(scode) ||
    !issuedAt ||
    !expiresAt ||
    !Number.isFinite(Date.parse(issuedAt)) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) - Date.parse(issuedAt) !== WECOM_QR_AUTHORIZATION_TTL_MS
  ) {
    throw new Error('WeCom QR authorization session metadata is missing or invalid.')
  }
  return { version: 1, scode, issuedAt, expiresAt }
}

function requireQrAuthMethod(authMethodId: string): void {
  if (authMethodId !== WECOM_CLI_QR_AUTH_METHOD) {
    throw new Error(`Unsupported WeCom connector authentication method '${authMethodId}'.`)
  }
}
