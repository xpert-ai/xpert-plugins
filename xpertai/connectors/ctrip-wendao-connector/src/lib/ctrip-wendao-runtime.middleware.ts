import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddlewareStrategy,
  ConnectorRuntimeCapability,
  type AgentMiddleware,
  type ConnectorRuntimeApi,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { CTRIP_WENDAO_ICON } from './branding.js'
import { CtripWendaoClient } from './ctrip-wendao.client.js'
import {
  CTRIP_WENDAO_AUTH_METHOD_ID,
  CTRIP_WENDAO_CONNECTOR_PROVIDER,
  CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME
} from './constants.js'
import { createCtripWendaoCredential } from './credential.js'
import { CtripWendaoError } from './errors.js'
import { createCtripWendaoTools } from './ctrip-wendao-tools.js'

type CtripWendaoConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & {
  builtin: true
}

@Injectable()
@AgentMiddlewareStrategy(CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME)
export class CtripWendaoRuntimeMiddleware implements IAgentMiddlewareStrategy<CtripWendaoConnectorRuntimeConfig> {
  constructor(private readonly client: CtripWendaoClient) {}

  readonly meta: HiddenAgentMiddlewareMeta = {
    name: CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'Ctrip Wendao connector runtime',
      zh_Hans: '携程问道连接器运行时'
    },
    description: {
      en_US: 'Hidden runtime implementation used by the platform connector middleware.',
      zh_Hans: '供平台连接器中间件调用的隐藏运行时实现。'
    },
    icon: CTRIP_WENDAO_ICON,
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(options: CtripWendaoConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const workspaceId = context.workspaceId
    const connectorId = readOptionalString(options.connectorId)
    const connectorRuntime = context.runtime?.capabilities?.get(ConnectorRuntimeCapability)

    return {
      name: CTRIP_WENDAO_RUNTIME_MIDDLEWARE_NAME,
      tools: createCtripWendaoTools({
        client: this.client,
        getConnection: async () => {
          if (!workspaceId) {
            throw new CtripWendaoError('WENDAO_RUNTIME_UNAVAILABLE', 'Ctrip Wendao tools require a workspace context.')
          }
          const api = requireConnectorRuntime(connectorRuntime)
          const resolved = await api.getConnectorCredential({
            workspaceId,
            provider: CTRIP_WENDAO_CONNECTOR_PROVIDER,
            ...(connectorId ? { connectorId } : {})
          })
          if (resolved.authMethodId !== CTRIP_WENDAO_AUTH_METHOD_ID) {
            throw new CtripWendaoError(
              'WENDAO_AUTH_INVALID',
              'The Ctrip Wendao connector authentication method is invalid.'
            )
          }
          return {
            connectorId: resolved.connectorId,
            credential: createCtripWendaoCredential(resolved.credentials.apiToken)
          }
        }
      })
    }
  }
}

function requireConnectorRuntime(
  value: ConnectorRuntimeApi | undefined
): Required<Pick<ConnectorRuntimeApi, 'getConnectorCredential'>> {
  if (!value?.getConnectorCredential) {
    throw new CtripWendaoError(
      'WENDAO_RUNTIME_UNAVAILABLE',
      'The platform.connector runtime capability with multi-auth credential support is required.'
    )
  }
  return { getConnectorCredential: value.getConnectorCredential.bind(value) }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
