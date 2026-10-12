import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { AgentMiddlewareStrategy, RequestContext, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { FEATURE, MIDDLEWARE, type Scope } from './domain.js'
import { DemandService } from './service.js'
import { text } from './view.js'

export const TOOL_NAMES = ['customer_demand_list', 'customer_demand_get', 'customer_demand_evaluate'] as const
@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE)
export class DemandMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE, label: text('Customer demand assessment', '客户需求评估'),
    description: text('Read requests and ask Jev for an assessment. Human confirmation remains in the workbench.', '读取需求并调用 Jev 评估；最终决定只能在工作台由用户确认。'),
    icon: { type: 'font', value: 'ri-user-search-line' }, features: [FEATURE], configSchema: { type: 'object', properties: {} }
  }
  constructor(private readonly service: DemandService) {}
  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope: Scope = { tenantId: context.tenantId, organizationId: context.organizationId ?? RequestContext.getOrganizationId() ?? '', userId: context.userId ?? '' }
    const id = z.object({ id: z.string().uuid().describe('Exact request id returned by customer_demand_list.') }).strict()
    return { name: MIDDLEWARE, tools: [
      tool(async input => JSON.stringify(await this.service.list(scope, input)), {
        name: TOOL_NAMES[0], description: 'List the current user’s saved customer requests. No other users’ records are accessible.',
        schema: z.object({ page: z.number().int().positive().optional(), search: z.string().max(160).optional() }).strict()
      }),
      tool(async input => JSON.stringify(await this.service.get(scope, input.id)), {
        name: TOOL_NAMES[1], description: 'Read the source text, persisted Jev assessment and human decision of one request.', schema: id
      }),
      tool(async input => JSON.stringify(await this.service.evaluate(scope, input.id)), {
        name: TOOL_NAMES[2], description: 'Run Jev on a saved draft or retry a failed assessment. Existing completed assessments are reused. This does not confirm a human decision or contact a customer.', schema: id
      })
    ] }
  }
}
