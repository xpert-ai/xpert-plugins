import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorConnectionPollInput,
  type ConnectorConnectionPollResult,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { KDOCS_ICON } from './branding.js'
import {
  KDOCS_ACCOUNT_LOGIN_URL,
  KDOCS_AUTH_METHOD_ID,
  KDOCS_AUTHORIZATION_TTL_MS,
  KDOCS_CONNECTOR_PROVIDER,
  KDOCS_SKILLHUB_CALLBACK_URL
} from './constants.js'
import { KdocsConnectorError } from './errors.js'
import { KdocsSkillHubAuthClient } from './kdocs-skillhub-auth.client.js'

type PendingKdocsAuthorization = {
  version: 1
  code: string
  issuedAt: string
  expiresAt: string
}

@Injectable()
@ConnectorStrategyKey(KDOCS_CONNECTOR_PROVIDER)
export class KdocsConnectorStrategy implements ConnectorMultiAuthStrategy {
  constructor(private readonly auth: KdocsSkillHubAuthClient) {}

  readonly definition: ConnectorMultiAuthDefinition = {
    provider: KDOCS_CONNECTOR_PROVIDER,
    label: { en_US: 'WPS Docs', zh_Hans: '金山文档' },
    description: {
      en_US: 'Sign in on the WPS web page and connect WPS Cloud Docs through its SkillHub MCP service.',
      zh_Hans: '跳转金山文档网页登录，并通过 SkillHub MCP 服务连接 WPS 云文档。'
    },
    icon: KDOCS_ICON,
    legacyAuthMethodId: KDOCS_AUTH_METHOD_ID,
    auth: { type: 'oauth2' },
    authMethods: [
      {
        id: KDOCS_AUTH_METHOD_ID,
        type: 'oauth2',
        label: { en_US: 'WPS web sign-in', zh_Hans: '金山文档网页登录' }
      }
    ],
    permissions: [
      {
        key: 'kdocs.skillhub_access_token',
        label: { en_US: 'WPS SkillHub access token', zh_Hans: '金山文档 SkillHub 访问令牌' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      }
    ]
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireAuthMethod(input.authMethodId)
    const now = Date.now()
    const pending: PendingKdocsAuthorization = {
      version: 1,
      code: randomUUID().toLowerCase(),
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + KDOCS_AUTHORIZATION_TTL_MS).toISOString()
    }
    const callbackUrl = new URL(KDOCS_SKILLHUB_CALLBACK_URL)
    callbackUrl.searchParams.set('code', pending.code)
    const authorizationUrl = new URL(KDOCS_ACCOUNT_LOGIN_URL)
    authorizationUrl.searchParams.set('cb', callbackUrl.toString())
    return {
      status: 'pending',
      authorizationUrl: authorizationUrl.toString(),
      pollIntervalSeconds: 2,
      metadata: pending
    }
  }

  async pollConnection(input: ConnectorConnectionPollInput): Promise<ConnectorConnectionPollResult> {
    requireAuthMethod(input.authMethodId)
    const pending = readPendingAuthorization(input.metadata)
    if (Date.now() >= Date.parse(pending.expiresAt)) {
      return { status: 'error', error: 'WPS authorization timed out. Start the connection again.' }
    }
    const result = await this.auth.exchange(pending.code)
    if (result.status === 'pending') {
      return { status: 'pending', pollIntervalSeconds: 2, metadata: pending }
    }
    if (result.status === 'error') return { status: 'error', error: result.message }
    return {
      status: 'complete',
      credential: {
        data: { accessToken: result.accessToken, tokenType: 'bearer' },
        expiresAt: result.expiresIn
          ? new Date(Date.now() + result.expiresIn * 1000).toISOString()
          : undefined
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireAuthMethod(input.authMethodId)
    const accessToken = readString(input.credential.data.accessToken)
    if (!accessToken) throw new KdocsConnectorError('TOKEN_EXPIRED', 'WPS connector access token is missing')
    return { accessToken, tokenType: 'bearer' }
  }
}

function readPendingAuthorization(value: Record<string, unknown> | null | undefined): PendingKdocsAuthorization {
  const version = value?.version
  const code = readString(value?.code)
  const issuedAt = readIsoDate(value?.issuedAt)
  const expiresAt = readIsoDate(value?.expiresAt)
  if (version !== 1 || !code || !UUID_PATTERN.test(code) || !issuedAt || !expiresAt) {
    throw new KdocsConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization session is missing or invalid')
  }
  if (Date.parse(expiresAt) <= Date.parse(issuedAt) || Date.parse(expiresAt) - Date.parse(issuedAt) > KDOCS_AUTHORIZATION_TTL_MS) {
    throw new KdocsConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization session lifetime is invalid')
  }
  return { version: 1, code, issuedAt, expiresAt }
}

function requireAuthMethod(authMethodId: string) {
  if (authMethodId !== KDOCS_AUTH_METHOD_ID) {
    throw new Error(`Unsupported WPS Docs connector authentication method '${authMethodId}'`)
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readIsoDate(value: unknown) {
  const text = readString(value)
  return text && Number.isFinite(Date.parse(text)) ? text : undefined
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
