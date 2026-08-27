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
import { WPS_KNOWLEDGE_ICON } from './branding.js'
import {
  WPS_ACCOUNT_LOGIN_URL,
  WPS_AUTHORIZATION_TTL_MS,
  WPS_KNOWLEDGE_AUTH_METHOD_ID,
  WPS_KNOWLEDGE_CONNECTOR_PROVIDER,
  WPS_SKILLHUB_CALLBACK_URL
} from './constants.js'
import { WpsKnowledgeConnectorError } from './errors.js'
import { WpsSkillHubAuthClient } from './wps-skillhub-auth.client.js'

type PendingSkillHubAuthorization = {
  version: 1
  code: string
  issuedAt: string
  expiresAt: string
}

@Injectable()
@ConnectorStrategyKey(WPS_KNOWLEDGE_CONNECTOR_PROVIDER)
export class WpsKnowledgeConnectorStrategy implements ConnectorMultiAuthStrategy {
  readonly definition: ConnectorMultiAuthDefinition = {
    provider: WPS_KNOWLEDGE_CONNECTOR_PROVIDER,
    label: { en_US: 'WPS Knowledge', zh_Hans: 'WPS 知识库' },
    description: {
      en_US: 'Sign in on the WPS website and connect WPS Knowledge through SkillHub.',
      zh_Hans: '跳转 WPS 网页登录，并通过 SkillHub 连接 WPS 知识库。'
    },
    icon: WPS_KNOWLEDGE_ICON,
    legacyAuthMethodId: WPS_KNOWLEDGE_AUTH_METHOD_ID,
    auth: { type: 'oauth2' },
    authMethods: [
      {
        id: WPS_KNOWLEDGE_AUTH_METHOD_ID,
        type: 'oauth2',
        label: { en_US: 'WPS Knowledge web sign-in', zh_Hans: 'WPS 知识库网页登录' }
      }
    ],
    permissions: [
      {
        key: 'wps-knowledge.skillhub-access-token',
        label: { en_US: 'WPS Knowledge SkillHub token', zh_Hans: 'WPS 知识库 SkillHub 令牌' },
        identity: 'user',
        credential: 'access_token',
        storage: 'runtime_only',
        required: true
      }
    ]
  }

  constructor(private readonly auth: WpsSkillHubAuthClient) {}

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireAuthMethod(input.authMethodId)
    const code = await this.auth.generateCode()
    const now = Date.now()
    const pending: PendingSkillHubAuthorization = {
      version: 1,
      code,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + WPS_AUTHORIZATION_TTL_MS).toISOString()
    }
    const callbackUrl = new URL(WPS_SKILLHUB_CALLBACK_URL)
    callbackUrl.searchParams.set('code', code)
    const authorizationUrl = new URL(WPS_ACCOUNT_LOGIN_URL)
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
        data: { accessToken: result.accessToken, tokenType: 'kwiki' },
        expiresAt: result.expiresIn
          ? new Date(Date.now() + result.expiresIn * 1_000).toISOString()
          : null,
        profile: result.profile ?? null
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireAuthMethod(input.authMethodId)
    return {
      accessToken: requiredString(input.credential.data.accessToken, 'WPS Knowledge access token is missing.'),
      tokenType: 'kwiki'
    }
  }
}

function requireAuthMethod(value: string): void {
  if (value !== WPS_KNOWLEDGE_AUTH_METHOD_ID) {
    throw new WpsKnowledgeConnectorError('AUTH_METHOD_UNSUPPORTED', `Unsupported WPS Knowledge authentication method '${value}'.`)
  }
}

function readPendingAuthorization(value: Record<string, unknown> | null | undefined): PendingSkillHubAuthorization {
  const code = readString(value?.code)
  const issuedAt = readString(value?.issuedAt)
  const expiresAt = readString(value?.expiresAt)
  if (
    value?.version !== 1 ||
    !code || !/^[A-Za-z0-9_-]{16,128}$/.test(code) ||
    !issuedAt || !expiresAt ||
    !Number.isFinite(Date.parse(issuedAt)) || !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) - Date.parse(issuedAt) !== WPS_AUTHORIZATION_TTL_MS
  ) {
    throw new WpsKnowledgeConnectorError('AUTHORIZATION_RESPONSE_INVALID', 'WPS authorization session metadata is missing or invalid.')
  }
  return { version: 1, code, issuedAt, expiresAt }
}

function requiredString(value: unknown, message: string): string {
  const result = readString(value)
  if (!result) throw new WpsKnowledgeConnectorError('TOKEN_EXPIRED', message)
  return result
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
