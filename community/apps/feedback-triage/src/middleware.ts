import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  RequestContext,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
} from '@xpert-ai/plugin-sdk'
import { ANALYZE_TOOL, FEATURE, ICON, LIST_TOOL, MIDDLEWARE, title } from './constants.js'
import { requireScope, TicketError, ticketIdSchema } from './domain.js'
import { inboxInput, inboxReceipt, inboxTurn } from './inbox.js'
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
    slashCommands: [{
      name: 'inbox',
      label: { en_US: 'Recent feedback', zh_Hans: '最近反馈' },
      description: { en_US: 'Show your recent feedback tickets', zh_Hans: '查看自己的最近反馈工单' },
      kind: 'command',
      action: { type: 'submit_prompt', template: '/inbox' },
    }],
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
      wrapModelCall: (request, next) => {
        if ('eventReceiptId' in context && context.eventReceiptId) return next(request)
        const locale = RequestContext.currentUser()?.preferredLanguage ?? RequestContext.getLanguageCode()
        return inboxTurn(request, locale) ?? next(request)
      },
      tools: [
        tool(
          async () => {
            const { tickets, hasMore } = await this.service.list(scope)
            return JSON.stringify(inboxReceipt(tickets, hasMore))
          },
          {
            name: LIST_TOOL,
            description:
              'Read the ten most recent feedback tickets of the current user, newest first. For a simple list, use list to show the saved statuses and original excerpts directly. Use lookup to find an ID before analysis, or when you need to filter, compare, or further discuss the results.',
            schema: inboxInput,
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
