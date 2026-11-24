import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type AgentMiddleware,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  COMPLAINT_FEATURE,
  COMPLAINT_GET_TOOL_NAME,
  COMPLAINT_ICON,
  COMPLAINT_MIDDLEWARE_NAME,
  COMPLAINT_SAVE_TOOL_NAME,
  COMPLAINT_SEARCH_TOOL_NAME
} from './constants'
import { CustomerComplaintService } from './customer-complaint.service'
import { isComplaintCategory, isComplaintUrgency } from './rules'
import type { ComplaintDraftInput, ComplaintScope, ComplaintStatus } from './types'

const saveSchema = z.object({
  caseId: z.string().optional().describe('Existing complaint case id. Always pass this when the user or workbench already created a case, so retry updates the same record.'),
  rawText: z.string().min(1).describe('Original customer complaint text.'),
  category: z.enum(['logistics', 'product', 'refund', 'service', 'other']).optional().describe('Complaint category.'),
  urgency: z.enum(['low', 'normal', 'high']).optional().describe('Urgency. Use high for repeated complaints or regulator mentions.'),
  customerDemand: z.string().optional().describe('What the customer wants. Do not invent it.'),
  missingFields: z.array(z.string()).optional().describe('Information that is absent from the original text.'),
  suggestedReply: z.string().optional().describe('Draft reply for a human agent to edit. Do not promise refunds or closure.'),
  escalationSuggested: z.boolean().optional().describe('Whether a human should consider escalation.'),
  escalationReason: z.string().optional().describe('Why escalation is suggested.'),
  orderNo: z.string().optional().describe('Order number only when present in the text.'),
  contact: z.string().optional().describe('Customer contact only when present in the text.'),
  simulateModelFailure: z.boolean().optional().describe('Set true only when the caller explicitly asks to simulate a model failure.'),
  failureReason: z.string().optional().describe('Readable failure reason when simulateModelFailure is true.')
})

const getSchema = z.object({
  caseId: z.string().min(1).describe('Complaint case id.')
})

const searchSchema = z.object({
  status: z.enum(['draft', 'ready', 'needs_info', 'failed', 'confirmed', 'returned']).optional(),
  search: z.string().optional().describe('Keyword for case number, original text, or customer demand.'),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(50).optional()
})

@Injectable()
@AgentMiddlewareStrategy(COMPLAINT_MIDDLEWARE_NAME)
export class CustomerComplaintMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  meta: TAgentMiddlewareMeta = {
    name: COMPLAINT_MIDDLEWARE_NAME,
    label: { en_US: 'Customer Complaint Intake', zh_Hans: '客服投诉受理' },
    description: {
      en_US: 'Turn a customer complaint into a reviewable intake draft.',
      zh_Hans: '把客户投诉整理成可复核的受理草稿。'
    },
    icon: { type: 'svg', value: COMPLAINT_ICON, color: '#b45309' },
    features: [COMPLAINT_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  constructor(private readonly service: CustomerComplaintService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    const saveTool = tool(
      async (input: z.infer<typeof saveSchema>) => {
        const rawText = input.rawText?.trim()
        if (!rawText) {
          return JSON.stringify({ success: false, message: '客户原话不能为空' })
        }
        const payload: ComplaintDraftInput = {
          ...input,
          rawText,
          category: isComplaintCategory(input.category) ? input.category : undefined,
          urgency: isComplaintUrgency(input.urgency) ? input.urgency : undefined
        }
        const result = await this.service.saveIntakeDraft(payload, scope)
        return JSON.stringify({ success: true, message: result.message, data: result })
      },
      {
        name: COMPLAINT_SAVE_TOOL_NAME,
        description:
          'Save one complaint intake draft from the customer original text. Reuse caseId when retrying. Do not confirm, close, or promise a refund. If required fields are missing, still save and report them in missingFields.',
        schema: saveSchema,
        verboseParsingErrors: true
      }
    )
    const getTool = tool(
      async (input: z.infer<typeof getSchema>) => {
        const result = await this.service.getCase(scope, input.caseId)
        return JSON.stringify({ success: true, message: 'Complaint case loaded.', data: result })
      },
      {
        name: COMPLAINT_GET_TOOL_NAME,
        description: 'Read one complaint case, including the original text, AI draft, and human confirmation state.',
        schema: getSchema,
        verboseParsingErrors: true
      }
    )
    const searchTool = tool(
      async (input: z.infer<typeof searchSchema>) => {
        const result = await this.service.searchCases(scope, {
          ...input,
          status: input.status as ComplaintStatus | undefined
        })
        return JSON.stringify({ success: true, message: 'Complaint cases searched.', data: result })
      },
      {
        name: COMPLAINT_SEARCH_TOOL_NAME,
        description: 'Search complaint cases in the current organization by status or keyword.',
        schema: searchSchema,
        verboseParsingErrors: true
      }
    )
    return { name: COMPLAINT_MIDDLEWARE_NAME, tools: [saveTool, getTool, searchTool] }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): ComplaintScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
