import type { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME, LarkAuthMode } from './lark-cli.types.js'
import { LarkCLISkillMiddleware } from './lark.middleware.js'

type LarkConnectorRuntimeConfig = {
  provider?: string
  connectorId?: string
}

type HiddenAgentMiddlewareMeta = TAgentMiddlewareMeta & {
  builtin: true
}

@Injectable()
@AgentMiddlewareStrategy(LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME)
export class LarkConnectorRuntimeMiddleware implements IAgentMiddlewareStrategy<LarkConnectorRuntimeConfig> {
  constructor(private readonly larkCliMiddleware: LarkCLISkillMiddleware) {}

  meta: HiddenAgentMiddlewareMeta = {
    name: LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME,
    label: {
      en_US: 'Feishu connector runtime',
      zh_Hans: '飞书连接器运行时'
    },
    description: {
      en_US: 'Hidden runtime implementation used by the platform connector middleware.',
      zh_Hans: '供平台连接器中间件调用的隐藏运行时实现。'
    },
    builtin: true,
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(options: LarkConnectorRuntimeConfig, context: IAgentMiddlewareContext): AgentMiddleware {
    const connectorId = typeof options?.connectorId === 'string' ? options.connectorId.trim() : ''

    const middleware = this.larkCliMiddleware.createMiddleware(
      {
        authMode: LarkAuthMode.CONNECTOR,
        ...(connectorId ? { connectorId } : {})
      },
      context
    )

    return {
      ...middleware,
      name: LARK_CONNECTOR_RUNTIME_MIDDLEWARE_NAME
    }
  }
}
