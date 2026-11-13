import { Injectable, Logger } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddlewareStrategy,
  type IAgentMiddlewareContext,
  type IAgentMiddlewareStrategy,
  type WrapModelCallHook
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { DELIVERY_FEATURE, DELIVERY_MIDDLEWARE_NAME, DELIVERY_TOOL_NAMES } from './constants'
import { DeliveryDomainError } from './domain-error'
import { isRunStopped } from './domain-utils'
import { SupplierDeliveryFollowupService } from './supplier-delivery-followup.service'
import type { DeliveryScope, EvidenceField, SaveProposalInput } from './types'

const text = (max: number) => z.string().trim().min(1).max(max)
const replyId = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .describe('Exact reply id from the workbench reply:<id> message or a prior read.')
const page = z.number().int().min(1).max(1_000_000).optional().describe('Page number, starting at 1; defaults to 1.')
const pageSize = z.number().int().min(1).max(100).optional().describe('Items per page; defaults to 20, maximum 100.')
const date = text(32).describe('Unambiguous real calendar date as YYYY-MM-DD. The service validates the calendar date.')
const quantity = z.number().finite().positive().describe('Quantity in the order line unit; must be positive.')

export const deliveryToolSchemas = {
  getReply: z.object({ replyId, page, pageSize }).strict(),
  searchOrderLines: z
    .object({
      poNumber: text(160).optional().describe('Exact purchase order number read from the reply.'),
      keyword: text(160).optional().describe('Material name or material code search text.'),
      supplierName: text(160).optional().describe('Exact supplier name.'),
      page,
      pageSize
    })
    .strict(),
  saveProposal: z
    .object({
      replyId,
      poNumber: text(160).describe('Existing purchase order number returned by search.'),
      lineNo: z
        .number()
        .int()
        .positive()
        .max(2_147_483_647)
        .describe('Existing line number returned by search; never guess a match.'),
      changeType: z
        .enum(['delay', 'advance', 'unchanged', 'partial'])
        .describe('Compare with promisedDate; partial means at least two delivery batches.'),
      proposedDate: date
        .optional()
        .describe('Required for a single delivery; omit for partial, whose date is derived from the last batch.'),
      proposedQuantity: quantity.optional(),
      batches: z
        .array(z.object({ quantity, date }).strict())
        .max(100)
        .optional()
        .describe('At least two batches for partial; otherwise omit.'),
      reason: text(1000).optional().describe('Reason supported by an exact source quote; omit if absent.'),
      evidence: z
        .array(
          z
            .object({
              field: z.enum(['poNumber', 'proposedDate', 'proposedQuantity', 'batches', 'reason']),
              quote: z
                .string()
                .min(1)
                .max(5000)
                .refine((value) => value.trim().length > 0, 'Quote must not be blank')
                .describe('Exact substring of rawText. Do not supply start/end offsets.')
            })
            .strict()
        )
        .min(1)
        .max(100)
        .describe('Source quotes for poNumber and every supplied date, quantity, batches and reason.'),
      confidence: z
        .number()
        .finite()
        .min(0)
        .max(1)
        .describe('Confidence from 0 to 1; uncertainty requires follow-up, not invented facts.')
    })
    .strict(),
  finalizeParse: z
    .object({ replyId, summary: text(1000).describe('Brief factual summary of the saved proposals for human review.') })
    .strict(),
  reportParseFailure: z
    .object({
      replyId,
      code: z.enum(['no_delivery_info', 'ambiguous_order', 'unreadable', 'other']),
      message: text(1000).describe('Concrete missing or ambiguous information that a buyer must follow up.')
    })
    .strict()
}

const recoveryActions: Partial<Record<DeliveryDomainError['code'], string>> = {
  invalid_scope: 'Ask the host to restore the authenticated execution context; do not supply identity fields.',
  reply_locked: 'Read the confirmed result; this reply cannot be parsed or changed.',
  confirmation_in_progress:
    'A buyer is confirming this reply. Do not parse or change it; let the buyer resolve conflicts and resume confirmation.',
  invalid_reply_state:
    'Read the reply status. Ask the buyer to start or retry parsing in the workbench; do not change it yourself.',
  evidence_required: 'Read rawText and provide an exact source quote for every field listed in params.fields.',
  invalid_batches: 'For partial delivery provide at least two dated batches; otherwise omit batches.',
  invalid_quantity: 'Use a positive quantity supported by the reply.',
  concurrent_change: 'Read the current reply and retry only if it is still parsing.'
}

/** Never return arbitrary exceptions, ORM rows, or runtime context to the model. */
async function receipt(run: () => Promise<unknown>, id?: string) {
  try {
    return JSON.stringify(await run())
  } catch (error) {
    if (error instanceof DeliveryDomainError) {
      const params: Record<string, unknown> = {}
      for (const key of [
        'replyId',
        'proposalId',
        'orderLineId',
        'poNumber',
        'lineNo',
        'field',
        'fields',
        'value',
        'status',
        'expected'
      ]) {
        if (Object.prototype.hasOwnProperty.call(error.params, key)) params[key] = error.params[key]
      }
      return JSON.stringify({
        ...(id ? { replyId: id } : {}),
        code: error.code,
        message: error.message,
        params,
        nextAction: recoveryActions[error.code] ?? error.nextAction
      })
    }
    return JSON.stringify({
      ...(id ? { replyId: id } : {}),
      code: 'operation_failed',
      message: 'The operation could not be completed.',
      params: {},
      nextAction:
        'Read the current reply before retrying; if the problem persists, ask the buyer to retry in the workbench.'
    })
  }
}

function validateEvidence(input: SaveProposalInput) {
  const fields: EvidenceField[] = ['poNumber']
  if (input.proposedDate !== undefined) fields.push('proposedDate')
  if (input.proposedQuantity !== undefined) fields.push('proposedQuantity')
  if (input.batches?.length) fields.push('batches')
  if (input.reason !== undefined) fields.push('reason')
  const missing = fields.filter((field) => !input.evidence.some((evidence) => evidence.field === field))
  if (missing.length) throw new DeliveryDomainError('evidence_required', { fields: missing })
  if (input.changeType !== 'partial' && input.proposedDate === undefined) {
    throw new DeliveryDomainError('invalid_date', { field: 'proposedDate' })
  }
}

@Injectable()
@AgentMiddlewareStrategy(DELIVERY_MIDDLEWARE_NAME)
export class SupplierDeliveryFollowupMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: DELIVERY_MIDDLEWARE_NAME,
    label: { en_US: 'Supplier delivery follow-up', zh_Hans: '供应商交期跟单' },
    description: {
      en_US: 'Extract evidenced delivery proposals for human review.',
      zh_Hans: '提取带原文出处的交期提议，交由人工审核。'
    },
    icon: { type: 'emoji', value: '🚚' },
    features: [DELIVERY_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }
  private readonly logger = new Logger(SupplierDeliveryFollowupMiddleware.name)
  constructor(private readonly service: SupplierDeliveryFollowupService) {}
  getToolNames() {
    return DELIVERY_TOOL_NAMES
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext) {
    const scope: DeliveryScope = {
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      userId: context.userId
    }
    const wrapModelCall: WrapModelCallHook = async (request, handler) => {
      try {
        return await handler(request)
      } catch (error) {
        try {
          for (const message of [...request.messages].reverse()) {
            if (message._getType() !== 'human') continue
            const content =
              typeof message.content === 'string'
                ? message.content
                : message.content
                    .map((block) => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
                    .join(' ')
            const match = /(?:^|\s)reply:([a-f0-9]{64})(?=\s|$)(?:\s+attempt:(\d+)(?=\s|$))?/i.exec(content)
            if (!match) continue
            const attempt = match[2] === undefined ? null : Number(match[2])
            if (attempt !== null && (!Number.isSafeInteger(attempt) || attempt < 1)) break
            await this.service.reportModelFailure(
              match[1].toLowerCase(),
              attempt,
              error instanceof Error ? error.message : 'Model call failed.',
              scope,
              isRunStopped(error, request.runtime?.signal) ? 'run_stopped' : 'model_failed'
            )
            break
          }
        } catch {
          // Do not log exception objects: providers and database errors may contain credentials.
          this.logger.warn('Could not persist supplier reply model failure.')
        }
        throw error
      }
    }
    return {
      name: DELIVERY_MIDDLEWARE_NAME,
      wrapModelCall,
      tools: [
        tool(
          async (input) => receipt(() => this.service.getReplyForAgent(input.replyId, input, scope), input.replyId),
          {
            name: DELIVERY_TOOL_NAMES[0],
            schema: deliveryToolSchemas.getReply,
            verboseParsingErrors: true,
            description:
              'First read the stored reply identified by reply:<id>. Read proposal pages using total/page/pageSize. This read never starts or retries parsing. Only status parsing allows proposal writes.',
            metadata: { toolName: { en_US: 'Read supplier reply', zh_Hans: '读取供应商回复' } }
          }
        ),
        tool(
          async (input) =>
            receipt(async () => {
              const result = await this.service.listOrderLines(input, scope)
              return {
                items: result.items.map((line) => ({
                  orderLineId: line.id,
                  poNumber: line.poNumber,
                  lineNo: line.lineNo,
                  supplierName: line.supplierName,
                  materialName: line.materialName,
                  quantity: line.quantity,
                  promisedDate: line.promisedDate
                })),
                total: result.total,
                page: result.page,
                pageSize: result.pageSize
              }
            }),
          {
            name: DELIVERY_TOOL_NAMES[1],
            schema: deliveryToolSchemas.searchOrderLines,
            verboseParsingErrors: true,
            description:
              'After reading the reply, find matching existing order lines before saving proposals. Page through candidates; report ambiguous_order if the reply cannot identify a unique line.',
            metadata: { toolName: { en_US: 'Search order lines', zh_Hans: '查找订单行' } }
          }
        ),
        tool(
          async (input) =>
            receipt(async () => {
              validateEvidence(input)
              const saved = await this.service.saveProposal(input, scope)
              return {
                proposalId: saved.proposalId,
                replyId: saved.replyId,
                created: saved.created,
                message: saved.message
              }
            }, input.replyId),
          {
            name: DELIVERY_TOOL_NAMES[2],
            schema: deliveryToolSchemas.saveProposal,
            verboseParsingErrors: true,
            description:
              'After reading a parsing reply and matching an order line, save one evidenced proposal. Provide quotes for every populated key field. Repeated saves replace the same reply/order proposal. Partial delivery dates derive from batches. Does not modify orders. Then finalize, or report a blocker.',
            metadata: { toolName: { en_US: 'Save delivery proposal', zh_Hans: '保存交期提议' } }
          }
        ),
        tool(
          async (input) =>
            receipt(async () => {
              const result = await this.service.finalizeParse(input.replyId, input.summary, scope)
              return { replyId: result.replyId, status: result.status, proposalCount: result.proposalCount }
            }, input.replyId),
          {
            name: DELIVERY_TOOL_NAMES[3],
            schema: deliveryToolSchemas.finalizeParse,
            verboseParsingErrors: true,
            description:
              'Finish a parsing reply only after all supported proposals are saved and no unresolved items remain. Requires at least one current-attempt proposal. Moves to pending_review, never confirms or changes orders. Returns the persisted status and proposal count.',
            metadata: { toolName: { en_US: 'Finish reply parsing', zh_Hans: '完成回复解析' } }
          }
        ),
        tool(
          async (input) =>
            receipt(async () => {
              const result = await this.service.reportParseFailure(input.replyId, input.code, input.message, scope)
              return { replyId: result.replyId, status: result.status }
            }, input.replyId),
          {
            name: DELIVERY_TOOL_NAMES[4],
            schema: deliveryToolSchemas.reportParseFailure,
            verboseParsingErrors: true,
            description:
              'For a parsing reply with no delivery information, ambiguous order, unreadable text or another blocker, explain the reason and move to needs_followup. Preserves drafts; do not invent dates or finalize incomplete work. Retry is a human workbench action.',
            metadata: { toolName: { en_US: 'Report parsing blocker', zh_Hans: '上报解析问题' } }
          }
        )
      ]
    }
  }
}
