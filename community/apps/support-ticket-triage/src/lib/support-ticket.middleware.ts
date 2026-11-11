import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy, RequestContext,
  type AgentMiddleware, type IAgentMiddlewareContext, type IAgentMiddlewareStrategy, type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { FEATURE_KEY, ICON, MIDDLEWARE_NAME } from './constants.js'
import { SupportTicketService } from './support-ticket.service.js'
import type { TicketScope } from './types.js'

const ticketIdSchema = z.object({ ticketId: z.string().uuid().describe('Ticket id returned by support_ticket_create or support_ticket_list_pending.') })
const createSchema = z.object({
  customerName: z.string().min(1).max(120),
  customerEmail: z.string().email().optional(),
  subject: z.string().min(1).max(200),
  description: z.string().min(10).max(12000)
})
const analysisSchema = ticketIdSchema.extend({
  category: z.string().min(1).max(80).describe('Concise business category selected by the model.'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  summary: z.string().min(1).max(1000),
  suggestedReply: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1).max(300)).max(8).describe('Short phrases copied or closely paraphrased from the ticket.')
})
const failureSchema = ticketIdSchema.extend({ reason: z.string().min(1).max(1000) })

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class SupportTicketTriageMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: SupportTicketService) {}

  meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Support Ticket Triage', zh_Hans: '售后工单智能分诊' },
    description: {
      en_US: 'Create, classify, summarize, and prepare support tickets for human review.',
      zh_Hans: '创建、分类和总结售后工单，并生成供人工确认的回复建议。'
    },
    icon: { type: 'svg', value: ICON, color: '#2563eb' },
    features: [FEATURE_KEY],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: MIDDLEWARE_NAME,
      tools: [
        tool(async (input) => compact(await this.service.create(scope, input)), {
          name: 'support_ticket_create',
          description: 'Create a persisted support ticket. Call this before analysis when no ticket id exists.',
          schema: createSchema,
          verboseParsingErrors: true
        }),
        tool(async ({ ticketId }) => compact(await this.service.get(scope, ticketId)), {
          name: 'support_ticket_get',
          description: 'Load one ticket before analysing it. Never invent content that is not present in the ticket.',
          schema: ticketIdSchema,
          verboseParsingErrors: true
        }),
        tool(async () => JSON.stringify((await this.service.list(scope)).filter((item) => item.status === 'pending_ai').map((item) => compactObject(item as unknown as Record<string, unknown>))), {
          name: 'support_ticket_list_pending',
          description: 'List persisted tickets awaiting AI analysis.',
          schema: z.object({}),
          verboseParsingErrors: true
        }),
        tool(async ({ ticketId, ...analysis }) => compact(await this.service.recordAnalysis(scope, ticketId, analysis)), {
          name: 'support_ticket_record_analysis',
          description: 'Persist model-generated category, priority, summary, evidence, and reply draft. The result remains awaiting human review.',
          schema: analysisSchema,
          verboseParsingErrors: true
        }),
        tool(async ({ ticketId, reason }) => compact(await this.service.recordFailure(scope, ticketId, reason)), {
          name: 'support_ticket_record_failure',
          description: 'Persist an actionable failure reason when analysis cannot be completed. The Workbench can then retry safely.',
          schema: failureSchema,
          verboseParsingErrors: true
        })
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): TicketScope {
  return {
    tenantId: context.tenantId ?? RequestContext.currentTenantId(),
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    userId: context.userId ?? RequestContext.currentUserId(),
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function compact(value: unknown) { return JSON.stringify(compactObject(value as Record<string, unknown>)) }
function compactObject(value: Record<string, unknown>) {
  const { id, status, revision, subject, category, priority, summary, suggestedReply, confidence, failureReason, attemptCount } = value
  return { id, status, revision, subject, category, priority, summary, suggestedReply, confidence, failureReason, attemptCount }
}
