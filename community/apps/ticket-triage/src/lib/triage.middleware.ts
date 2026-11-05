import { Injectable, Logger } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { FEATURE, MIDDLEWARE_NAME, TOOL_LIST_TICKETS, TOOL_PROPOSE_TRIAGE } from './constants.js'
import { listTicketsSchema, proposeTriageToolSchema, TicketTriageError } from './domain/contracts.js'
import { scopeFromAgent } from './scope.js'
import { TicketTriageService } from './ticket.service.js'

const failure = (code: string, ticketCode?: string) => JSON.stringify({
  success: false,
  code,
  ticketCode,
  message: code === 'conflict'
    ? 'The ticket changed since you read it. Call list_pending_tickets again and retry with the new revision.'
    : code === 'not_found'
      ? 'No such ticket. Call list_pending_tickets to see the current codes.'
      : code === 'invalid_state'
        ? 'This ticket is already confirmed or not awaiting a proposal. Pick another ticket.'
        : 'The proposal was rejected as invalid. Check the field lengths and enum values.'
})

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class TicketTriageMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Ticket triage', zh_Hans: '工单分诊' },
    description: {
      en_US: 'Read pending support tickets and record a triage proposal for human confirmation.',
      zh_Hans: '读取待处理工单，并提交分诊建议等待人工确认。'
    },
    icon: { type: 'font', value: 'ri-customer-service-2-line' },
    features: [FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  private static loggedScope = false

  constructor(private readonly service: TicketTriageService) {}

  getToolNames() {
    return [TOOL_LIST_TICKETS, TOOL_PROPOSE_TRIAGE]
  }

  createMiddleware(_options: unknown, context: IAgentMiddlewareContext): AgentMiddleware {
    const service = this.service
    if (!TicketTriageMiddleware.loggedScope) {
      TicketTriageMiddleware.loggedScope = true
      new Logger(MIDDLEWARE_NAME).log(
        `agent scope tenantId=${context.tenantId} organizationId=${context.organizationId ?? ''} ` +
          `xpertId=${context.xpertId ?? ''} workspaceId=${context.workspaceId ?? ''} userId=${context.userId}`
      )
    }
    return {
      name: MIDDLEWARE_NAME,
      tools: [
        tool(async (input: unknown) => {
          try {
            const scope = scopeFromAgent(context)
            const parsed = listTicketsSchema.parse(input)
            return JSON.stringify(await service.listForAssistant(scope, parsed.limit))
          } catch (error) {
            return failure(error instanceof TicketTriageError ? error.code : 'invalid_input')
          }
        }, {
          name: TOOL_LIST_TICKETS,
          description: 'List support tickets that are still waiting for triage. Each item carries the revision you must echo back when proposing.',
          schema: listTicketsSchema
        }),
        tool(async (input: unknown) => {
          try {
            const scope = scopeFromAgent(context)
            const parsed = proposeTriageToolSchema.parse(input)
            const result = await service.proposeTriage(scope, {
              ticketCode: parsed.ticketCode,
              expectedRevision: parsed.expectedRevision,
              priority: parsed.priority,
              team: parsed.owningTeam,
              rationale: parsed.rationale,
              draftReply: parsed.draftReply
            })
            return JSON.stringify({
              success: true,
              ticketCode: result.ticketCode,
              revision: result.revision,
              next: 'A human still has to confirm this proposal in the ticket board.'
            })
          } catch (error) {
            return failure(error instanceof TicketTriageError ? error.code : 'invalid_input')
          }
        }, {
          name: TOOL_PROPOSE_TRIAGE,
          description:
            'Record a triage proposal for exactly one ticket. All six arguments are required: ' +
            'ticketCode, expectedRevision (from list_pending_tickets), priority (P0/P1/P2/P3), ' +
            'owningTeam (technical_support/billing/logistics/product/customer_success), rationale and draftReply. ' +
            'Nothing is final until a human confirms it in the board.',
          schema: proposeTriageToolSchema
        })
      ]
    }
  }
}
