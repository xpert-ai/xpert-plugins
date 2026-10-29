import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_DETAIL_TOOL_NAME,
  SUPPORT_TICKET_FEATURE,
  SUPPORT_TICKET_ICON,
  SUPPORT_TICKET_MIDDLEWARE_NAME,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_SAVE_TRIAGE_TOOL_NAME,
  SUPPORT_TICKET_SEARCH_TOOL_NAME,
  SUPPORT_TICKET_STATUSES
} from './constants'
import { SupportTicketService } from './support-ticket.service'
import type {
  SaveTriageInput,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketScope,
  SupportTicketStatus
} from './types'

const CATEGORY_VALUES = SUPPORT_TICKET_CATEGORIES.map((item) => item.value) as [SupportTicketCategory, ...SupportTicketCategory[]]
const PRIORITY_VALUES = SUPPORT_TICKET_PRIORITIES.map((item) => item.value) as [SupportTicketPriority, ...SupportTicketPriority[]]
const STATUS_VALUES = SUPPORT_TICKET_STATUSES.map((item) => item.value) as [SupportTicketStatus, ...SupportTicketStatus[]]

const saveTriageSchema = z.object({
  ticketId: z.string().min(1).describe('Target support ticket id created by the workbench. Required and never invented.'),
  category: z.enum(CATEGORY_VALUES).describe('Normalized ticket category chosen from the supported list.'),
  priority: z.enum(PRIORITY_VALUES).describe('Ticket priority: p0 blocking, p1 high, p2 normal, p3 low.'),
  priorityReason: z
    .string()
    .min(1)
    .describe('Evidence for the priority decision, quoting the customer impact found in the message.'),
  draftReply: z
    .string()
    .min(1)
    .describe('Customer-facing reply draft in the customer language, ready for a human to review and send.'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence between 0 and 1.'),
  missingInfo: z
    .array(z.string())
    .optional()
    .describe('Information the agent could not find in the message. Never invent values to fill these.'),
  rawResult: z.unknown().optional().describe('Raw structured model output kept for traceability.')
})

const searchTicketsSchema = z.object({
  status: z.enum(STATUS_VALUES).optional().describe('Ticket status filter.'),
  category: z.enum(CATEGORY_VALUES).optional().describe('Ticket category filter.'),
  priority: z.enum(PRIORITY_VALUES).optional().describe('Ticket priority filter.'),
  search: z.string().optional().describe('Keyword over ticket number, customer name, original message and reply drafts.'),
  page: z.number().int().min(1).optional().describe('Page number, defaults to 1.'),
  pageSize: z.number().int().min(1).max(50).optional().describe('Page size, defaults to 10.')
})

const ticketDetailSchema = z.object({
  ticketId: z.string().min(1).describe('Support ticket id.')
})

@Injectable()
@AgentMiddlewareStrategy(SUPPORT_TICKET_MIDDLEWARE_NAME)
export class SupportTicketMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: SUPPORT_TICKET_MIDDLEWARE_NAME,
    label: {
      en_US: 'Support Ticket',
      zh_Hans: '客服工单'
    },
    description: {
      en_US: 'Classify customer messages, score priority and store a reviewable reply draft.',
      zh_Hans: '对客户消息分类定级，并保存待人工确认的回复草稿。'
    },
    icon: {
      type: 'svg',
      value: SUPPORT_TICKET_ICON,
      color: '#2563eb'
    },
    features: [SUPPORT_TICKET_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: SupportTicketService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const saveTriageTool = tool(
      async (input: SaveTriageInput) => {
        const result = await this.service.saveTriage(scope, input)
        if (result.outcome === 'already_confirmed') {
          return JSON.stringify({
            success: false,
            code: 'already_confirmed',
            message:
              'This ticket is already confirmed by a human. Do not overwrite it; ask the reviewer to reopen the flow if a new message arrived.'
          })
        }
        return JSON.stringify({
          success: true,
          message: 'Ticket triage was saved and awaits human confirmation.',
          data: {
            id: result.ticket.id,
            ticketNo: result.ticket.ticketNo,
            status: result.ticket.status,
            category: result.ticket.aiCategory,
            priority: result.ticket.aiPriority,
            revision: result.ticket.revision
          }
        })
      },
      {
        name: SUPPORT_TICKET_SAVE_TRIAGE_TOOL_NAME,
        description:
          'Save the triage result (category, priority, priority reason, reply draft) for one existing support ticket id. Call it exactly once per ticket id. It never sends anything to the customer and never confirms the ticket.',
        schema: saveTriageSchema
      }
    )

    const searchTicketsTool = tool(
      async (input: z.infer<typeof searchTicketsSchema>) => {
        const result = await this.service.searchTickets(scope, input)
        return JSON.stringify({
          success: true,
          message: 'Support tickets were searched.',
          data: result
        })
      },
      {
        name: SUPPORT_TICKET_SEARCH_TOOL_NAME,
        description:
          'Search support tickets by status, category, priority or keyword. Use it when the user asks about existing tickets, backlog or history.',
        schema: searchTicketsSchema
      }
    )

    const ticketDetailTool = tool(
      async (input: z.infer<typeof ticketDetailSchema>) => {
        const detail = await this.service.getTicketDetailForAgent(scope, input.ticketId)
        return JSON.stringify({
          success: true,
          message: 'Support ticket detail was returned.',
          data: detail
        })
      },
      {
        name: SUPPORT_TICKET_DETAIL_TOOL_NAME,
        description:
          'Get one support ticket with its original message, AI triage result, human confirmation and event timeline.',
        schema: ticketDetailSchema
      }
    )

    return {
      name: SUPPORT_TICKET_MIDDLEWARE_NAME,
      tools: [saveTriageTool, searchTicketsTool, ticketDetailTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): SupportTicketScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
