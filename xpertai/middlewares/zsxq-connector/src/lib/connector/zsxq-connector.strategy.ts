import { Inject, Injectable } from '@nestjs/common'
import {
  ConnectorStrategyKey,
  type ConnectorConnectInput,
  type ConnectorConnectResult,
  type ConnectorConnectionPollInput,
  type ConnectorConnectionPollResult,
  type ConnectorCredential,
  type ConnectorMultiAuthDefinition,
  type ConnectorMultiAuthStrategy,
  type ConnectorRuntimeCredentialResolveInput
} from '@xpert-ai/plugin-sdk'
import { ZSXQ_ICON } from '../branding.js'
import { ZsxqCliService } from '../cli/zsxq-cli.service.js'
import {
  ZSXQ_AUTH_METHOD_ID,
  ZSXQ_CLI_VERSION,
  ZSXQ_CONNECTOR_PROVIDER,
  ZSXQ_PLUGIN_CONFIG_TOKEN
} from '../constants.js'
import { ZsxqConnectorError } from '../errors.js'
import type { ZsxqPluginConfig } from '../plugin-config.js'

type PendingMetadata = { version: 1; handle: string; expiresAt: string }
type ZsxqCredentialRevokeInput = {
  authMethodId: string
  credential: ConnectorCredential
}

@Injectable()
@ConnectorStrategyKey(ZSXQ_CONNECTOR_PROVIDER)
export class ZsxqConnectorStrategy implements ConnectorMultiAuthStrategy {
  readonly definition: ConnectorMultiAuthDefinition

  constructor(
    private readonly cli: ZsxqCliService,
    @Inject(ZSXQ_PLUGIN_CONFIG_TOKEN) private readonly config: ZsxqPluginConfig
  ) {
    this.definition = {
      provider: ZSXQ_CONNECTOR_PROVIDER,
      label: { en_US: 'Knowledge Planet', zh_Hans: '知识星球' },
      description: {
        en_US: 'Connect through the official Knowledge Planet OAuth device flow and isolated zsxq-cli session.',
        zh_Hans: '通过知识星球官方 OAuth 设备授权和隔离的 zsxq-cli 会话完成连接。'
      },
      icon: ZSXQ_ICON,
      legacyAuthMethodId: ZSXQ_AUTH_METHOD_ID,
      auth: { type: 'oauth2' },
      authMethods: [
        {
          id: ZSXQ_AUTH_METHOD_ID,
          type: 'oauth2',
          label: { en_US: 'Knowledge Planet device sign-in', zh_Hans: '知识星球设备登录' }
        }
      ],
      permissions: [
        {
          key: 'zsxq.cli_session',
          label: { en_US: 'Knowledge Planet account session', zh_Hans: '知识星球账户会话' },
          description: {
            en_US:
              'Xpert stores only an opaque local-session handle; the official CLI keeps the OAuth token in the OS credential store.',
            zh_Hans: 'Xpert 仅保存不透明的本地会话句柄；OAuth Token 由官方 CLI 存入操作系统凭据库。'
          },
          identity: 'user',
          scopes: this.config.enableWrites ? ['zsxq.read', 'zsxq.write'] : ['zsxq.read'],
          credential: 'access_token',
          storage: 'platform_vault',
          required: true
        }
      ]
    }
  }

  async connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult> {
    requireAuthMethod(input.authMethodId)
    const started = await this.cli.startAuthorization()
    return {
      status: 'pending',
      authorizationUrl: started.authorizationUrl,
      pollIntervalSeconds: started.pollIntervalSeconds,
      metadata: { version: 1, handle: started.handle, expiresAt: started.expiresAt }
    }
  }

  async pollConnection(input: ConnectorConnectionPollInput): Promise<ConnectorConnectionPollResult> {
    requireAuthMethod(input.authMethodId)
    const pending = readPendingMetadata(input.metadata)
    const result = await this.cli.pollAuthorization(pending.handle)
    if (result.status === 'error') return { status: 'error', error: result.error, metadata: pending }
    if (result.status === 'pending') {
      return {
        status: 'pending',
        metadata: pending,
        pollIntervalSeconds: result.pollIntervalSeconds,
        message: 'Waiting for Knowledge Planet authorization.'
      }
    }
    return {
      status: 'complete',
      credential: {
        data: {
          connectionHandle: pending.handle,
          transport: 'cli',
          cliVersion: ZSXQ_CLI_VERSION
        },
        scopes: this.config.enableWrites ? ['zsxq.read', 'zsxq.write'] : ['zsxq.read'],
        profile: {
          id: result.profile.id,
          name: result.profile.name,
          avatarUrl: result.profile.avatarUrl
        }
      }
    }
  }

  resolveRuntimeCredential(input: ConnectorRuntimeCredentialResolveInput) {
    requireAuthMethod(input.authMethodId)
    const handle = readString(input.credential.data.connectionHandle)
    if (!handle) throw new ZsxqConnectorError('AUTH_EXPIRED', 'Knowledge Planet connection handle is missing.')
    return { connectionHandle: handle, transport: 'cli', cliVersion: ZSXQ_CLI_VERSION }
  }

  async revokeCredential(input: ZsxqCredentialRevokeInput): Promise<void> {
    requireAuthMethod(input.authMethodId)
    const handle = readString(input.credential.data.connectionHandle)
    if (handle) await this.cli.disconnect(handle)
  }
}

function requireAuthMethod(value: string): void {
  if (value !== ZSXQ_AUTH_METHOD_ID) {
    throw new ZsxqConnectorError('VALIDATION_FAILED', `Unsupported Knowledge Planet authentication method '${value}'.`)
  }
}

function readPendingMetadata(value: Record<string, unknown> | null | undefined): PendingMetadata {
  const handle = readString(value?.handle)
  const expiresAt = readString(value?.expiresAt)
  if (value?.version !== 1 || !handle || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
    throw new ZsxqConnectorError('AUTHORIZATION_INVALID', 'Knowledge Planet authorization metadata is invalid.')
  }
  return { version: 1, handle, expiresAt }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
