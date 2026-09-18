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
  SMART_TICKET_DETAIL_TOOL_NAME,
  SMART_TICKET_FEATURE,
  SMART_TICKET_ICON,
  SMART_TICKET_MIDDLEWARE_NAME,
  SMART_TICKET_SAVE_TOOL_NAME,
  SMART_TICKET_SEARCH_TOOL_NAME
} from './constants'
import { SmartTicketDispatchService } from './smart-ticket-dispatch.service'
import type { SmartTicketScope, SmartTicketTriageInput } from './types'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const saveTriagedTicketSchema = z.object({
  title: z.string().optional().describe('Short ticket title summarized from the customer request.'),
  originalContent: z.string().min(1).describe('Original customer request text, kept verbatim.'),
  customerName: z.string().optional().describe('Customer name, when provided.'),
  customerContact: z.string().optional().describe('Customer contact (phone/email), when provided.'),
  channel: z.string().optional().describe('Request channel such as 电话, 邮件, 在线客服, APP.'),
  category: z
    .enum(['technical', 'billing', 'logistics', 'consult', 'complaint', 'other'])
    .optional()
    .describe('Ticket category classified by the AI.'),
  urgency: z.enum(['low', 'medium', 'high']).optional().describe('Urgency level assessed by the AI.'),
  aiSummary: z.string().optional().describe('One-paragraph summary of the customer problem.'),
  aiSuggestedTeam: z
    .enum(['technical_support', 'billing', 'logistics', 'after_sales', 'customer_success', 'other'])
    .optional()
    .describe('AI suggested handling team.'),
  aiSuggestedOwner: z.string().optional().describe('AI suggested owner name, only when explicitly identifiable.'),
  aiDispatchAdvice: z.string().optional().describe('Concrete handling advice for the suggested team.'),
  aiConfidence: z.number().min(0).max(1).optional().describe('AI confidence between 0 and 1.'),
  completenessTips: z.array(z.string()).optional().describe('Missing or ambiguous information tips.'),
  aiRawResult: z.unknown().optional().describe('Raw structured AI result kept for traceability.')
})

const searchTicketsSchema = z.object({
  status: z.enum(['pending_confirmation', 'dispatched', 'resolved', 'rejected']).optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  search: z.string().optional().describe('Keyword matching ticket no, title, content or customer name.'),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
})

const ticketDetailSchema = z.object({
  ticketId: z.string().min(1).describe('Smart ticket id.')
})

@Injectable()
@AgentMiddlewareStrategy(SMART_TICKET_MIDDLEWARE_NAME)
export class SmartTicketDispatchMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: SMART_TICKET_MIDDLEWARE_NAME,
    label: {
      en_US: 'Smart Ticket Dispatch',
      zh_Hans: '智能工单分派'
    },
    description: {
      en_US: 'Save AI-triaged support tickets for human dispatch confirmation.',
      zh_Hans: '保存 AI 分诊的客服工单草稿，供人工确认分派。'
    },
    icon: {
      type: 'svg',
      value: SMART_TICKET_ICON,
      color: '#1d4ed8'
    },
    features: [SMART_TICKET_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: SmartTicketDispatchService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope: SmartTicketScope = {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId,
      assistantId: context.xpertId,
      conversationId: context.conversationId
    }

    const saveTriagedTicketTool = tool(
      async (rawInput: unknown) => {
        // Defensive normalization: some models wrap the whole payload in a single
        // field (e.g. {"input": "..."}) instead of using the declared schema keys.
        const args: Record<string, unknown> = isObject(rawInput) ? (rawInput as Record<string, unknown>) : {}
        const originalContent = [
          args.originalContent,
          args.input,
          args.content,
          args.ticketContent,
          args.request
        ]
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .find((value) => value.length > 0)

        if (!originalContent) {
          throw new Error(
            '缺少 originalContent 字段：请把客户请求原文放入 originalContent 参数后重新调用一次。'
          )
        }

        const payload = {
          ...(args as object),
          originalContent,
          sourceType: 'agent_chat'
        } as SmartTicketTriageInput
        const { ticket, duplicated } = await this.service.saveTriagedTicket(payload, scope)
        return JSON.stringify({
          success: true,
          duplicated,
          message: duplicated
            ? `检测到重复分诊请求，已复用现有待确认工单 ${ticket.ticketNo}，未创建新工单。请提示用户到审核台确认分派。`
            : `AI 分诊草稿已保存（工单号 ${ticket.ticketNo}，状态：待确认）。请提示用户到审核台人工确认分派，确认前工单不会执行。`,
          data: {
            id: ticket.id,
            ticketNo: ticket.ticketNo,
            status: ticket.status,
            title: ticket.title,
            category: ticket.category,
            urgency: ticket.urgency,
            aiSuggestedTeam: ticket.aiSuggestedTeam,
            aiSuggestedOwner: ticket.aiSuggestedOwner,
            completenessTips: ticket.completenessTips
          }
        })
      },
      {
        name: SMART_TICKET_SAVE_TOOL_NAME,
        description:
          'Save one AI-triaged support ticket as a draft waiting for human dispatch confirmation. Put the verbatim customer request text in the originalContent field. Use exactly once per customer request; if the request failed earlier and the user retries, call it again — the tool is idempotent and will reuse the existing draft instead of creating a duplicate. Never claim the ticket was dispatched: dispatch requires human confirmation in the review desk.',
        schema: saveTriagedTicketSchema
      }
    )

    const searchTicketsTool = tool(
      async (input: z.infer<typeof searchTicketsSchema>) => {
        const result = await this.service.searchTickets(scope, input)
        return JSON.stringify({
          success: true,
          message: '工单搜索结果已返回。',
          data: result
        })
      },
      {
        name: SMART_TICKET_SEARCH_TOOL_NAME,
        description:
          'Search smart tickets by status, urgency or keyword. Use this when the user asks about existing tickets or dispatch progress.',
        schema: searchTicketsSchema
      }
    )

    const ticketDetailTool = tool(
      async (input: z.infer<typeof ticketDetailSchema>) => {
        const ticket = await this.service.getTicket(scope, input.ticketId)
        const logs = await this.service.getTicketLogs(ticket.id)
        return JSON.stringify({
          success: true,
          message: '工单详情已返回。',
          data: { ticket, logs }
        })
      },
      {
        name: SMART_TICKET_DETAIL_TOOL_NAME,
        description:
          'Get one smart ticket detail including the AI triage result, human confirmation fields and the operation log timeline.',
        schema: ticketDetailSchema
      }
    )

    return {
      name: SMART_TICKET_MIDDLEWARE_NAME,
      tools: [saveTriagedTicketTool, searchTicketsTool, ticketDetailTool]
    }
  }
}
