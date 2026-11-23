import { Injectable } from '@nestjs/common'
import { AIMessage, isBaseMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { QuoteSeriesConfirmationRequired } from './quote-series-review.js'
import { followUpInput } from './quote-follow-up.js'
import { z } from 'zod/v3'
import {
  PROCUREMENT_ICON,
  PROCUREMENT_QUOTE_COMPARISON_FEATURE,
  PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME
} from './constants.js'
import { ProcurementQuoteComparisonService } from './procurement-quote-comparison.service.js'
import type { ProcurementScope } from './types.js'

const requirementItemSchema = z.object({
  name: z.string().min(1).describe('Procurement item name.'),
  specification: z.string().optional().describe('Specification or technical requirements.'),
  quantity: z.number().optional().describe('Required quantity.'),
  unit: z.string().optional().describe('Unit of measure.'),
  budgetAmount: z.string().optional().describe('Budget amount for this item.'),
  expectedDeliveryDate: z.string().optional().describe('Expected delivery date or delivery window.'),
  requirements: z.string().optional().describe('Additional commercial or acceptance requirements.'),
  rawText: z.string().optional().describe('Source evidence text.')
})

const saveRequirementSchema = z.object({
  caseId: z.string().min(1).describe('Procurement comparison case id.'),
  project: z
    .object({
      title: z.string().optional(),
      purchaseNo: z.string().optional(),
      applicant: z.string().optional(),
      department: z.string().optional(),
      budgetAmount: z.string().optional(),
      expectedDeliveryDate: z.string().optional(),
      description: z.string().optional()
    })
    .optional()
    .describe('Parsed procurement project fields.'),
  items: z.array(requirementItemSchema).default([]).describe('Parsed procurement requirement line items.')
})

const supplierQuoteItemSchema = z.object({
  requirementItemId: z.string().optional().describe('Matched requirement item id when known.'),
  productName: z.string().min(1).describe('Quoted product name.'),
  brand: z.string().optional(),
  model: z.string().optional(),
  specification: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.string().optional(),
  totalPrice: z.string().optional(),
  taxIncluded: z.boolean().optional(),
  taxRate: z.string().optional(),
  deliveryTime: z.string().optional(),
  paymentTerms: z.string().optional(),
  warranty: z.string().optional(),
  remarks: z.string().optional(),
  rawText: z.string().optional()
})

const saveSupplierQuoteSchema = z.object({
  quoteSeriesId: z.string().min(1).optional().describe('Use the series ID supplied for this revision. A conflict requires the buyer to confirm a candidate in the workbench.'),
  caseId: z.string().min(1).describe('Procurement comparison case id.'),
  documentId: z.string().optional().describe('Source quote document id.'),
  supplierName: z.string().min(1).describe('Supplier name.'),
  supplierContact: z.string().optional(),
  taxIncluded: z.boolean().optional(),
  deliveryTime: z.string().optional(),
  paymentTerms: z.string().optional(),
  warranty: z.string().optional(),
  remarks: z.string().optional(),
  items: z.array(supplierQuoteItemSchema).default([]).describe('Quoted line items.')
})

const saveItemMatchesSchema = z.object({
  caseId: z.string().min(1),
  matches: z
    .array(
      z.object({
        requirementItemId: z.string().optional(),
        quoteItemId: z.string().optional(),
        supplierQuoteId: z.string().optional(),
        status: z.enum(['exact', 'similar', 'spec_mismatch', 'quantity_mismatch', 'missing', 'uncertain']),
        confidence: z.number().min(0).max(1).optional(),
        explanation: z.string().optional()
      })
    )
    .default([])
})

const saveRiskItemsSchema = z.object({
  caseId: z.string().min(1),
  risks: z
    .array(
      z.object({
        supplierQuoteId: z.string().optional(),
        requirementItemId: z.string().optional(),
        quoteItemId: z.string().optional(),
        type: z.string().min(1),
        severity: z.enum(['low', 'medium', 'high']),
        title: z.string().min(1),
        description: z.string().min(1),
        suggestion: z.string().optional()
      })
    )
    .default([])
})

const finalizeRecommendationSchema = z.object({
  caseId: z.string().min(1),
  summary: z.string().min(1).describe('Short recommendation summary.'),
  recommendedSupplier: z.string().optional(),
  recommendedPlan: z.string().optional(),
  explanation: z.string().optional(),
  reportDraft: z.string().optional(),
  pendingQuestions: z.array(z.string()).optional()
})

const reportParseFailureSchema = z.object({
  caseId: z.string().min(1),
  parseJobId: z.string().optional(),
  documentId: z.string().optional(),
  errorMessage: z.string().min(1)
})

@Injectable()
@AgentMiddlewareStrategy(PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME)
export class ProcurementQuoteComparisonMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME,
    label: {
      en_US: 'Procurement Quote Comparison',
      zh_Hans: '采购比价助手'
    },
    icon: {
      type: 'svg',
      value: PROCUREMENT_ICON
    },
    description: {
      en_US: 'Save procurement requirement parsing, supplier quotes, item matches, risks, and recommendations for the workbench.',
      zh_Hans: '为采购比价工作台保存需求解析、供应商报价、商品匹配、风险项和推荐结论。'
    },
    features: [PROCUREMENT_QUOTE_COMPARISON_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: ProcurementQuoteComparisonService) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: PROCUREMENT_QUOTE_COMPARISON_MIDDLEWARE_NAME,
      wrapModelCall: async (request, next) => {
        if (scope.eventReceiptId) {
          const locale = RequestContext.currentUser()?.preferredLanguage ?? RequestContext.getLanguageCode()
          const reply = await this.service.decisionWakeReply(scope, scope.eventReceiptId, locale)
          if (reply !== null) return new AIMessage(reply)
        }
        const selection = pendingSeriesReply(request.messages)
        return selection ? new AIMessage(selection) : next(request)
      },
      tools: [
        tool(async ({ caseId }) => JSON.stringify(await this.service.listFollowUpRisks(scope, caseId)), {
          name: 'procurement_list_delivery_risks',
          schema: z.object({ caseId: z.string().uuid() }),
          description: 'Find recorded delivery risk IDs and current follow-ups for this procurement case.'
        }),
        tool(async (input) => JSON.stringify(await this.service.followUp(scope, input)), {
          name: 'procurement_follow_up',
          schema: followUpInput,
          description:
            'For an open supplier reply, inspect the delay risk and its version, then set your own one-time UTC deadline. You will wake in this conversation to reassess. Use cancel or reply when resolved. Pass the inspected timer version on deadline edits. During an authorized due run use publish_check and expectedQuoteRevision to post one workbench reminder for the current quote. A workbench publication does not confirm supplier delivery.'
        }),
        tool(async (input) => JSON.stringify(await this.service.saveRequirementExtraction(scope, input), null, 2), {
          name: 'procurement_save_requirement',
          description: 'Save parsed procurement project fields and requirement line items.',
          schema: saveRequirementSchema
        }),
        tool(async (input) => {
          try {
            return JSON.stringify(await this.service.saveSupplierQuoteExtraction(scope, input), null, 2)
          } catch (error) {
            if (!(error instanceof QuoteSeriesConfirmationRequired)) throw error
            const review = error.review
            const zh = (RequestContext.currentUser()?.preferredLanguage ?? RequestContext.getLanguageCode()).toLowerCase().startsWith('zh')
            const instruction = zh
              ? `文件「${review.file}」的报价系列编号有冲突，本次修订尚未保存。请在采购工作台选择报价系列并确认保存。`
              : `The quote series for “${review.file}” conflicts with the case records. The revision is pending. Select a series and confirm in the procurement workbench.`
            const choices = review.candidates.map(q => `- ${q.supplier} · ${q.file} · ${q.seriesId}`)
            const message = [instruction, ...choices].join('\n')
            return JSON.stringify({ status: review.status, message })
          }
        }, {
          name: 'procurement_save_supplier_quote',
          description: 'Save a supplier quote with its original file and proposed series. When confirmation is required, present the returned candidates and wait for the buyer in the workbench.',
          schema: saveSupplierQuoteSchema
        }),
        tool(async (input) => JSON.stringify(await this.service.saveItemMatches(scope, input), null, 2), {
          name: 'procurement_save_item_matches',
          description: 'Save quote-to-requirement item matching results.',
          schema: saveItemMatchesSchema
        }),
        tool(async (input) => JSON.stringify(await this.service.saveRiskItems(scope, input), null, 2), {
          name: 'procurement_save_risk_items',
          description: 'Save procurement comparison risk findings.',
          schema: saveRiskItemsSchema
        }),
        tool(async (input) => JSON.stringify(await this.service.finalizeRecommendation(scope, input), null, 2), {
          name: 'procurement_finalize_recommendation',
          description: 'Save final AI recommendation, explanation, report draft, and pending questions.',
          schema: finalizeRecommendationSchema
        }),
        tool(async (input) => JSON.stringify(await this.service.reportParseFailure(scope, input), null, 2), {
          name: 'procurement_report_parse_failure',
          description: 'Report a failed procurement document parsing task.',
          schema: reportParseFailureSchema
        })
      ]
    }
  }
}

// Only the save tool in the current tool batch can end this turn with a buyer selection.
function pendingSeriesReply(messages: BaseMessage[]) {
  for (const message of [...messages].reverse()) {
    if (!isBaseMessage(message) || !isToolMessage(message)) break
    if (message.name !== 'procurement_save_supplier_quote' || typeof message.content !== 'string') continue
    try {
      const result = JSON.parse(message.content)
      if (result?.status === 'quote_series_confirmation_required' && typeof result.message === 'string') return result.message
    } catch { /* Other tool outcomes are handled by the model. */ }
  }
  return null
}

function scopeFromContext(
  context: IAgentMiddlewareContext
): ProcurementScope {
  return {
    eventReceiptId: context.eventReceiptId,
    inputMessageId: context.inputMessageId,
    tenantId: context.tenantId,
    organizationId: context.organizationId === undefined ? RequestContext.getOrganizationId() : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId,
    conversationId: context.conversationId ?? null,
    threadId: context.threadId ?? null,
    agentKey: context.agentKey ?? null,
    assistantId: context.xpertId ?? null
  }
}
