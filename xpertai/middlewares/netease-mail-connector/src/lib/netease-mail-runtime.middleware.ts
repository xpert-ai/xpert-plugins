import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  WorkspaceFilesRuntimeCapability,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { NeteaseMailConfirmationStore } from './confirmation-store.js'
import { NETEASE_MAIL_ICON } from './branding.js'
import {
  NETEASE_MAIL_AUTH_METHOD_ID,
  NETEASE_MAIL_CONNECTOR_PROVIDER,
  NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { NeteaseMailError } from './errors.js'
import { NeteaseMailService } from './netease-mail.service.js'
import { createNeteaseMailTools } from './netease-mail-tools.js'
import { createNeteaseMailCredential, readRequiredCredentialString } from './server-presets.js'

type NeteaseMailConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & {
  builtin: true
}

@Injectable()
@AgentMiddlewareStrategy(NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME)
export class NeteaseMailRuntimeMiddleware implements IAgentMiddlewareStrategy<NeteaseMailConnectorRuntimeConfig> {
  constructor(
    private readonly mailService: NeteaseMailService,
    private readonly confirmationStore: NeteaseMailConfirmationStore
  ) {}

  readonly meta: HiddenAgentMiddlewareMeta = {
    name: NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'NetEase Mail connector runtime',
      zh_Hans: '网易邮箱连接器运行时'
    },
    description: {
      en_US: 'Hidden runtime implementation used by the platform connector middleware.',
      zh_Hans: '供平台连接器中间件调用的隐藏运行时实现。'
    },
    icon: NETEASE_MAIL_ICON,
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(options: NeteaseMailConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const workspaceId = context.workspaceId
    const connectorId = readOptionalString(options.connectorId)
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability)
    const workspaceFiles = context.runtime?.capabilities?.get(WorkspaceFilesRuntimeCapability)

    return {
      name: NETEASE_MAIL_RUNTIME_MIDDLEWARE_NAME,
      tools: createNeteaseMailTools({
        mailService: this.mailService,
        confirmationStore: this.confirmationStore,
        getConnection: async () => {
          if (!workspaceId) {
            throw new NeteaseMailError('MAIL_RUNTIME_UNAVAILABLE', 'NetEase Mail tools require a workspace context.')
          }
          const api = requireConnectorRuntime(connectorRuntime)
          const resolved = await api.getConnectorCredential({
            workspaceId,
            provider: NETEASE_MAIL_CONNECTOR_PROVIDER,
            ...(connectorId ? { connectorId } : {})
          })
          if (resolved.authMethodId !== NETEASE_MAIL_AUTH_METHOD_ID) {
            throw new NeteaseMailError(
              'MAIL_AUTH_FAILED',
              'The NetEase Mail connector authentication method is invalid.'
            )
          }
          return {
            connectorId: resolved.connectorId,
            credential: createNeteaseMailCredential(
              readRequiredCredentialString(resolved.credentials.email, 'Mailbox address'),
              readRequiredCredentialString(resolved.credentials.authorizationCode, 'IMAP/SMTP authorization code')
            )
          }
        },
        getWorkspaceFiles: () => requireWorkspaceFiles(workspaceFiles)
      })
    }
  }
}

function requireConnectorRuntime(
  value: ConnectorRuntimeApi | undefined
): Required<Pick<ConnectorRuntimeApi, 'getConnectorCredential'>> {
  if (!value?.getConnectorCredential) {
    throw new NeteaseMailError(
      'MAIL_RUNTIME_UNAVAILABLE',
      'The platform.connector runtime capability with multi-auth credential support is required.'
    )
  }
  return { getConnectorCredential: value.getConnectorCredential.bind(value) }
}

function requireWorkspaceFiles(
  value: WorkspaceFilesApi | undefined
): Pick<WorkspaceFilesApi, 'readRuntimeBuffer' | 'writeRuntimeBuffer'> {
  if (!value?.readRuntimeBuffer || !value.writeRuntimeBuffer) {
    throw new NeteaseMailError(
      'MAIL_RUNTIME_UNAVAILABLE',
      'The platform.workspace.files runtime capability is required for email attachments.'
    )
  }
  return {
    readRuntimeBuffer: value.readRuntimeBuffer.bind(value),
    writeRuntimeBuffer: value.writeRuntimeBuffer.bind(value)
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
