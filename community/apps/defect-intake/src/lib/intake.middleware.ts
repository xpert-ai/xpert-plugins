import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy, type AgentMiddleware, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { feature, icon, middlewareName } from './constants'

/** Phase one owns the human record workspace; AI write tools arrive separately. */
@Injectable()
@AgentMiddlewareStrategy(middlewareName)
export class IntakeMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: middlewareName, label: { en_US: 'Defect intake', zh_Hans: '缺陷受理' },
    description: { en_US: 'Enables the human-reviewed defect workbench.', zh_Hans: '启用人工核对的缺陷受理工作台。' },
    icon: { type: 'svg', value: icon }, features: [feature],
    configSchema: { type: 'object', properties: {}, required: [] }
  }
  getToolNames(): string[] { return [] }
  createMiddleware(): AgentMiddleware { return { name: middlewareName, tools: [] } }
}
