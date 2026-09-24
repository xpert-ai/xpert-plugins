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
import { MEETING_FEATURE, MEETING_ICON, MEETING_MIDDLEWARE_NAME, MEETING_TOOL_NAMES } from './constants'
import { MeetingService } from './meeting.service'
import type { MeetingScope } from './types'

type PluginAgentTool = NonNullable<AgentMiddleware['tools']>[number]
type PluginAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<string>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors?: boolean
    metadata?: { toolName: { en_US: string; zh_Hans: string } }
  }
) => PluginAgentTool

const defineAgentTool = tool as unknown as PluginAgentToolFactory
const operationId = z.string().trim().min(8).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
const meetingId = z.string().uuid()
const baseRevision = z.number().int().positive().optional()
const itemKey = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)

export const getContextSchema = z.object({ meetingId }).strict()
export const beginExtractionSchema = z
  .object({
    operationId,
    meetingId: meetingId.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    sourceText: z.string().trim().min(20).max(30_000).optional(),
    baseRevision
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.meetingId && (!value.title || !value.sourceText)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'title and sourceText are required for a new meeting' })
    }
    if (value.meetingId && (value.title || value.sourceText)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'retry uses the persisted source; omit title and sourceText' })
    }
  })
export const decisionSchema = z.object({
  operationId,
  meetingId,
  itemKey,
  statement: z.string().trim().min(2).max(2_000),
  evidenceQuote: z.string().trim().min(1).max(1_000),
  confidence: z.number().min(0).max(1),
  sortOrder: z.number().int().min(0).max(500),
  baseRevision
}).strict()
export const actionSchema = z.object({
  operationId,
  meetingId,
  itemKey,
  task: z.string().trim().min(2).max(2_000),
  owner: z.string().trim().min(1).max(160).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.enum(['low', 'medium', 'high']),
  evidenceQuote: z.string().trim().min(1).max(1_000),
  confidence: z.number().min(0).max(1),
  sortOrder: z.number().int().min(0).max(500),
  baseRevision
}).strict()
export const finalizeSchema = z.object({ operationId, meetingId, baseRevision }).strict()
export const failureSchema = z.object({
  operationId,
  meetingId,
  failureCode: z.enum(['MODEL_CALL_FAILED', 'INVALID_SOURCE', 'EXTRACTION_INCOMPLETE', 'TOOL_WRITE_FAILED']),
  summary: z.string().trim().min(3).max(500),
  baseRevision
}).strict()
export const executionContextSchema = z.object({
  page: z.number().int().positive().max(10_000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  owner: z.string().trim().min(1).max(160).optional(),
  includeCompleted: z.boolean().default(false)
}).strict()
export const beginExecutionReviewSchema = z.object({
  operationId,
  focus: z.enum(['open_actions', 'high_risk', 'all_confirmed']).default('open_actions')
}).strict()
export const riskSignalSchema = z.object({
  operationId,
  reviewId: z.string().uuid(),
  signalKey: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  riskType: z.enum(['ambiguous_commitment', 'duplicate_action', 'decision_conflict', 'dependency_risk', 'workload_concentration', 'other']),
  severity: z.enum(['low', 'medium', 'high']),
  title: z.string().trim().min(2).max(200),
  rationale: z.string().trim().min(3).max(2_000),
  evidenceQuote: z.string().trim().min(1).max(1_000),
  recommendation: z.string().trim().min(2).max(1_000),
  meetingId: z.string().uuid().optional(),
  actionItemId: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1),
  baseRevision
}).strict().superRefine((value, context) => {
  if (value.actionItemId && !value.meetingId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['meetingId'], message: 'meetingId is required when actionItemId is provided' })
  }
})
export const finalizeExecutionReviewSchema = z.object({
  operationId,
  reviewId: z.string().uuid(),
  summary: z.string().trim().min(3).max(2_000),
  followUpBrief: z.string().trim().min(10).max(8_000),
  baseRevision
}).strict()
export const executionReviewFailureSchema = z.object({
  operationId,
  reviewId: z.string().uuid(),
  failureCode: z.enum(['MODEL_CALL_FAILED', 'EXECUTION_CONTEXT_INCOMPLETE', 'RISK_WRITE_FAILED']),
  summary: z.string().trim().min(3).max(500),
  baseRevision
}).strict()

@Injectable()
@AgentMiddlewareStrategy(MEETING_MIDDLEWARE_NAME)
export class MeetingMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: MeetingService) {}

  readonly meta: TAgentMiddlewareMeta = {
    name: MEETING_MIDDLEWARE_NAME,
    label: { en_US: 'Meeting action workbench', zh_Hans: '会议决议与行动项' },
    description: {
      en_US: 'Persist meeting source text, AI-extracted decisions and action items, failures, and retries.',
      zh_Hans: '持久化会议原文、AI 提取的决议与行动项，以及失败和重试状态。'
    },
    icon: { type: 'svg', value: MEETING_ICON, color: '#0369a1' },
    features: [MEETING_FEATURE],
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)
    return {
      name: MEETING_MIDDLEWARE_NAME,
      tools: [
        defineAgentTool(async (input: z.infer<typeof getContextSchema>) => stringify(await this.service.getContext(scope, input.meetingId)), {
          name: MEETING_TOOL_NAMES.getContext,
          description: 'Read one persisted meeting source and its current extraction state before retrying or answering detail questions.',
          schema: getContextSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Read meeting context', zh_Hans: '读取会议上下文' } }
        }),
        defineAgentTool(async (input: z.infer<typeof beginExtractionSchema>) => stringify(await this.service.beginExtraction(scope, input)), {
          name: MEETING_TOOL_NAMES.beginExtraction,
          description: 'Create a durable meeting record before extraction, or restart a failed meeting by exact meetingId. Use a new operationId for each attempt.',
          schema: beginExtractionSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Begin meeting extraction', zh_Hans: '开始会议提取' } }
        }),
        defineAgentTool(async (input: z.infer<typeof decisionSchema>) => stringify(await this.service.upsertDecision(scope, input)), {
          name: MEETING_TOOL_NAMES.upsertDecision,
          description: 'Upsert one evidence-backed meeting decision while extraction is processing. Keep itemKey stable across retries.',
          schema: decisionSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Save meeting decision', zh_Hans: '保存会议决议' } }
        }),
        defineAgentTool(async (input: z.infer<typeof actionSchema>) => stringify(await this.service.upsertActionItem(scope, input)), {
          name: MEETING_TOOL_NAMES.upsertActionItem,
          description: 'Upsert one evidence-backed action item while extraction is processing. Omit owner or dueDate when absent from the source.',
          schema: actionSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Save meeting action item', zh_Hans: '保存会议行动项' } }
        }),
        defineAgentTool(async (input: z.infer<typeof finalizeSchema>) => stringify(await this.service.finalizeExtraction(scope, input)), {
          name: MEETING_TOOL_NAMES.finalizeExtraction,
          description: 'Finish a successful extraction and move the persisted result to human review after all items are saved.',
          schema: finalizeSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Finish meeting extraction', zh_Hans: '完成会议提取' } }
        }),
        defineAgentTool(async (input: z.infer<typeof failureSchema>) => stringify(await this.service.reportFailure(scope, input)), {
          name: MEETING_TOOL_NAMES.reportFailure,
          description: 'Persist a comprehensible retryable failure when extraction cannot be completed. Do not invent a successful result.',
          schema: failureSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Record extraction failure', zh_Hans: '记录提取失败' } }
        }),
        defineAgentTool(async (input: z.infer<typeof executionContextSchema>) => stringify(await this.service.getExecutionContext(scope, input)), {
          name: MEETING_TOOL_NAMES.getExecutionContext,
          description: 'Read a bounded, paginated execution context containing confirmed decisions, trackable actions, deterministic rule flags, and the latest Agent review. Use before execution risk analysis or follow-up briefing.',
          schema: executionContextSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Read execution context', zh_Hans: '读取执行上下文' } }
        }),
        defineAgentTool(async (input: z.infer<typeof beginExecutionReviewSchema>) => stringify(await this.service.beginExecutionReview(scope, input)), {
          name: MEETING_TOOL_NAMES.beginExecutionReview,
          description: 'Begin one durable Agent execution-risk review. Read execution context first, then use the returned reviewId for semantic risk signals and the final follow-up brief.',
          schema: beginExecutionReviewSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Begin execution review', zh_Hans: '开始执行巡检' } }
        }),
        defineAgentTool(async (input: z.infer<typeof riskSignalSchema>) => stringify(await this.service.upsertRiskSignal(scope, input)), {
          name: MEETING_TOOL_NAMES.upsertRiskSignal,
          description: 'Upsert one evidence-backed semantic execution risk during a processing review. Do not duplicate deterministic overdue or missing-field rule flags. Keep signalKey stable within the review.',
          schema: riskSignalSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Save execution risk', zh_Hans: '保存执行风险' } }
        }),
        defineAgentTool(async (input: z.infer<typeof finalizeExecutionReviewSchema>) => stringify(await this.service.finalizeExecutionReview(scope, input)), {
          name: MEETING_TOOL_NAMES.finalizeExecutionReview,
          description: 'Finalize the execution review after all semantic risks are saved. Persist a concise summary and a Chinese follow-up brief for the next meeting.',
          schema: finalizeExecutionReviewSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Finish execution review', zh_Hans: '完成执行巡检' } }
        }),
        defineAgentTool(async (input: z.infer<typeof executionReviewFailureSchema>) => stringify(await this.service.reportExecutionReviewFailure(scope, input)), {
          name: MEETING_TOOL_NAMES.reportExecutionReviewFailure,
          description: 'Persist a comprehensible retryable failure when execution risk review or briefing cannot be completed. Do not claim that a brief is ready.',
          schema: executionReviewFailureSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Record execution review failure', zh_Hans: '记录巡检失败' } }
        })
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): MeetingScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function stringify(value: object) {
  return JSON.stringify(value)
}
