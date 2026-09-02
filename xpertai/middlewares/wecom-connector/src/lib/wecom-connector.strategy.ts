import { createHash, randomBytes } from 'node:crypto'
import * as tls from 'node:tls'
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorConnectionPollInput,
  type ConnectorConnectionPollResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput,
  type RuntimeI18nText
} from '@xpert-ai/plugin-sdk'
import { EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher, type RequestInit } from 'undici'
import {
  WECOM_CLI_AUTH_URL,
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
  type WeComBotCredential
} from './types.js'
import { WeComCliBootstrapService } from './wecom-cli-bootstrap.service.js'

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

type EmbeddedQrAuthorizationPresentation = {
  mode: 'embedded_qr'
  title: RuntimeI18nText
  description: RuntimeI18nText
  ariaLabel: RuntimeI18nText
  completionHint: RuntimeI18nText
  cancelLabel: RuntimeI18nText
  copyLinkLabel: RuntimeI18nText
  copyLinkError: RuntimeI18nText
}

type WeComConnectorDefinition = Omit<ConnectorMultiAuthDefinition, 'authMethods'> & {
  authMethods: Array<
    ConnectorMultiAuthDefinition['authMethods'][number] & {
      authorizationPresentation?: EmbeddedQrAuthorizationPresentation
    }
  >
}

@Injectable()
@ConnectorStrategyKey(WECOM_CONNECTOR_PROVIDER)
export class WeComConnectorStrategy implements ConnectorMultiAuthStrategy, OnModuleDestroy {
  private readonly dispatcher: Dispatcher

  constructor(bootstrap: WeComCliBootstrapService) {
    const { proxy } = bootstrap.resolveConfig()
    const requestCa = resolveRequestCa()
    this.dispatcher = new EnvHttpProxyAgent({
      httpProxy: proxy,
      httpsProxy: proxy,
      ...(requestCa ? { requestTls: { ca: requestCa } } : {})
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.dispatcher.close()
  }

  readonly definition: WeComConnectorDefinition = {
    provider: WECOM_CONNECTOR_PROVIDER,
    label: { en_US: 'WeCom', zh_Hans: '企业微信' },
    description: {
      en_US: 'Connect an official WeCom AI Bot by QR code for use with WeCom CLI.',
      zh_Hans: '通过扫码连接企业微信智能机器人，并供企业微信 CLI 使用。'
    },
    icon: { type: 'svg', value: WECOM_CONNECTOR_ICON },
    authMethods: [
      {
        id: WECOM_CLI_QR_AUTH_METHOD,
        type: 'oauth2',
        label: { en_US: 'WeCom AI Bot QR connection', zh_Hans: '企业微信智能机器人扫码连接' },
        authorizationPresentation: {
          mode: 'embedded_qr',
          title: { en_US: 'Connect WeCom intelligent robot', zh_Hans: '接入企业微信智能机器人' },
          description: {
            en_US: 'Use WeCom to scan the QR code and complete authorization.',
            zh_Hans: '请使用企业微信扫描二维码完成授权配置。'
          },
          ariaLabel: { en_US: 'WeCom authorization QR code', zh_Hans: '企业微信授权二维码' },
          completionHint: {
            en_US: 'The dialog will close automatically after authorization.',
            zh_Hans: '扫码完成后页面将自动关闭。'
          },
          cancelLabel: { en_US: 'Cancel authorization', zh_Hans: '取消授权' },
          copyLinkLabel: { en_US: 'Copy link', zh_Hans: '复制链接' },
          copyLinkError: {
            en_US: 'Could not copy authorization link.',
            zh_Hans: '无法复制授权链接。'
          }
        }
      }
    ],
    permissions: [
      {
        key: 'wecom.ai_bot_credential',
        label: { en_US: 'WeCom AI Bot access', zh_Hans: '企业微信智能机器人访问' },
        description: {
          en_US:
            'The QR authorization result is encrypted by the platform and resolved only inside the connector runtime.',
          zh_Hans: '扫码授权结果由平台加密保存，仅在连接器运行时解析。'
        },
        identity: 'app',
        credential: 'app_credential',
        storage: 'platform_vault',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    if (input.authMethodId === WECOM_LEGACY_AUTH_METHOD) {
      throw new Error(
        'This WeCom connection uses the retired application OAuth flow. Reconnect it with WeCom AI Bot QR authentication.'
      )
    }
    requireQrAuthMethod(input.authMethodId)

    const qr = await createQrAuthorization(this.dispatcher)
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

    const result = await queryQrAuthorization(pending.scode, this.dispatcher)
    if (!result) {
      return {
        status: 'pending',
        pollIntervalSeconds: WECOM_QR_POLL_INTERVAL_SECONDS,
        metadata: pending
      }
    }

    await validateBotCredential(result, 2, this.dispatcher)
    return { status: 'complete', credential: activeCredential(result).credential }
  }

  async resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput): Promise<WeComBotCredential> {
    if (input.authMethodId === WECOM_LEGACY_AUTH_METHOD) {
      throw new Error('This WeCom connection must be reauthorized with the official WeCom AI Bot connector.')
    }
    if (input.authMethodId !== WECOM_CLI_QR_AUTH_METHOD) {
      throw new Error(`Unsupported WeCom connector authentication method '${input.authMethodId}'.`)
    }
    return {
      botId: requireString(input.credential.data.botId, 'WeCom connector Bot ID is missing.'),
      botSecret: requireString(input.credential.data.botSecret, 'WeCom connector Bot Secret is missing.')
    }
  }
}

function activeCredential(credential: WeComBotCredential) {
  return {
    status: 'active' as const,
    credential: {
      data: credential,
      profile: {
        name: 'WeCom AI Bot',
        identityType: 'bot'
      }
    }
  }
}

async function createQrAuthorization(dispatcher: Dispatcher): Promise<WeComQrGenerateData> {
  const url = new URL(WECOM_QR_GENERATE_URL)
  url.searchParams.set('source', WECOM_QR_SOURCE)
  url.searchParams.set('plat', '3')
  const payload = await fetchJson(url.toString(), dispatcher)
  const data = isRecord(payload.data) ? payload.data : {}
  return {
    scode: requireString(data.scode, 'WeCom QR response did not include a session code.'),
    authUrl: requireString(data.auth_url, 'WeCom QR response did not include an authorization URL.')
  }
}

async function queryQrAuthorization(scode: string, dispatcher: Dispatcher): Promise<WeComBotCredential | null> {
  const url = new URL(WECOM_QR_QUERY_URL)
  url.searchParams.set('scode', scode)
  const payload = await fetchJson(url.toString(), dispatcher)
  const data = isRecord(payload.data) ? payload.data : {}
  if (readString(data.status) !== 'success') return null
  const bot = isRecord(data.bot_info) ? data.bot_info : {}
  return {
    botId: requireString(bot.botid, 'WeCom QR authorization did not include Bot ID.'),
    botSecret: requireString(bot.secret, 'WeCom QR authorization did not include Bot Secret.')
  }
}

async function validateBotCredential(
  credential: WeComBotCredential,
  bindSource: 1 | 2,
  dispatcher: Dispatcher
): Promise<void> {
  const time = Math.floor(Date.now() / 1000)
  const nonce = `cli_${Date.now()}_${randomBytes(4).toString('hex')}`
  const signature = createHash('sha256')
    .update(`${credential.botSecret}${credential.botId}${time}${nonce}`)
    .digest('hex')
  const payload = await fetchJson(WECOM_CLI_AUTH_URL, dispatcher, {
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

async function fetchJson(
  url: string,
  dispatcher: Dispatcher,
  init: RequestInit = {}
): Promise<Record<string, unknown>> {
  let response: Awaited<ReturnType<typeof undiciFetch>>
  try {
    const requestInit: RequestInit = {
      ...init,
      dispatcher,
      signal: init.signal ?? AbortSignal.timeout(15_000)
    }
    response = await undiciFetch(url, requestInit)
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

export function resolveRequestCa(
  getCACertificates: unknown = Reflect.get(tls, 'getCACertificates')
): string[] | undefined {
  if (typeof getCACertificates !== 'function') {
    return undefined
  }

  const readCertificates = (type: 'default' | 'system'): string[] | null => {
    const certificates: unknown = Reflect.apply(getCACertificates, tls, [type])
    return Array.isArray(certificates) &&
      certificates.every((certificate): certificate is string => typeof certificate === 'string')
      ? certificates
      : null
  }
  const defaultCertificates = readCertificates('default')
  if (!defaultCertificates?.length) {
    return undefined
  }
  const systemCertificates = readCertificates('system') ?? []

  return [...new Set([...defaultCertificates, ...systemCertificates])]
}
