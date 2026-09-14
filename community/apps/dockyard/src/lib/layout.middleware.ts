import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE_NAME } from './constants.js'

// Keep the provider identity for existing assistants; it now only enables the workbench.
@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class DockyardLayoutMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Dockyard workbench', zh_Hans: 'Dockyard 工作台' },
    description: { en_US: 'Enable the workbench and chat references.', zh_Hans: '启用工作台与聊天引用。' },
    icon: { type: 'font', value: 'ri-layout-4-line' }, features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
  getToolNames() { return [] }
  createMiddleware(): AgentMiddleware { return { name: MIDDLEWARE_NAME, tools: [] } }
}
