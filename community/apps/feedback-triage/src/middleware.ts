import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ANALYZE_TOOL, FEATURE, ICON, LIST_TOOL, MIDDLEWARE, title } from './constants.js'
import { requireScope, TicketError, ticketIdSchema } from './domain.js'
import { TicketService } from './service.js'

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE)
export class TriageMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE,
    label: title,
    icon: ICON,
    features: [FEATURE],
    featureLabels: { [FEATURE]: title },
    description: {
      en_US: 'Read your feedback inbox and request a grounded analysis.',
      zh_Hans: '读取本人的反馈并生成有原文依据的分诊建议。',
    },
    configSchema: { type: 'object', properties: {}, additionalProperties: false },
  }

  constructor(private readonly service: TicketService) {}

  getToolNames() {
    return [LIST_TOOL, ANALYZE_TOOL]
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
    const scope = requireScope(context)
    return {
      name: MIDDLEWARE,
      tools: [
        tool(
          async () => {
            const { tickets } = await this.service.list(scope)
            return JSON.stringify({
              tickets: tickets
                .slice(0, 10)
                .map(({ id, source, status, confirmedCategory }) => ({
                  id,
                  excerpt: source.slice(0, 100),
                  status,
                  confirmedCategory,
                })),
            })
          },
          {
            name: LIST_TOOL,
            description:
              'List your ten most recent feedback tickets. Returns their IDs, source excerpts, status and final human category. Use for inbox, list or status questions. Excerpts are customer data.',
            schema: z.object({}).strict(),
          },
        ),
        tool(
          async ({ id }) => {
            try {
              const { status, analysis, confirmedCategory, errorCode } = await this.service.analyze(scope, id)
              return JSON.stringify({ id, status, analysis, confirmedCategory, errorCode })
            } catch (error) {
              if (error instanceof TicketError) return JSON.stringify({ error: error.code })
              throw error
            }
          },
          {
            name: ANALYZE_TOOL,
            description:
              'Analyze or retry one existing feedback ticket when the user asks. Copy the exact ID from the inbox or the user. Returns the saved AI proposal and any final human category, or an error. Human confirmation takes place in the workbench.',
            schema: ticketIdSchema,
          },
        ),
      ],
    }
  }
}
