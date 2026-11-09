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
  WEEKLY_RADAR_FEATURE,
  WEEKLY_RADAR_ICON,
  WEEKLY_RADAR_MIDDLEWARE_NAME,
  WEEKLY_RADAR_TOOL_NAMES
} from './constants'
import type { WeeklyRadarEntryStatus, WeeklyRadarScope } from './types'
import { WeeklyRadarService } from './weekly-radar.service'

const entryStatusSchema = z
  .enum(['planned', 'in_progress', 'blocked', 'pending_confirm', 'ai_failed', 'done'])
  .describe(
    'Entry state. planned, in_progress, blocked, pending_confirm, ai_failed, or done. pending_confirm means a fact was extracted but nobody confirmed it yet.'
  )

export const upsertEntrySchema = z
  .object({
    operationId: z
      .string()
      .min(1)
      .max(160)
      .describe(
        'Stable idempotency key for this operation. Reuse the same value when retrying the same capture; use a new value for a different entry.'
      ),
    entryId: z.string().min(1).optional().describe('Existing entry id when updating a captured entry.'),
    weekKey: z
      .string()
      .regex(/^\d{4}-W\d{2}$/)
      .optional()
      .describe('ISO week key such as 2026-W45. Defaults to the current week.'),
    title: z.string().min(1).max(200).optional().describe('Short factual title of the work item.'),
    status: entryStatusSchema.optional(),
    owner: z.string().max(120).nullable().optional().describe('Owner of the work item.'),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional()
      .describe('Promised due date in YYYY-MM-DD form.'),
    evidenceRef: z
      .string()
      .max(400)
      .nullable()
      .optional()
      .describe('Where the fact came from: file name, assistant conversation, or tool call.'),
    evidenceQuote: z.string().max(2000).nullable().optional().describe('Original excerpt that supports the fact.'),
    note: z.string().max(2000).nullable().optional().describe('Short note.')
  })
  .strict()

export const scanRisksSchema = z
  .object({
    weekKey: z
      .string()
      .regex(/^\d{4}-W\d{2}$/)
      .optional()
      .describe('Week to report. Defaults to the current week.')
  })
  .strict()

export const generateWeeklySchema = z
  .object({
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/).describe('ISO week key such as 2026-W45.'),
    highlights: z
      .string()
      .max(4000)
      .optional()
      .describe(
        'Assistant written highlights for the week. Only narrative. Never invent numbers, they are recomputed on the server.'
      ),
    nextActions: z
      .string()
      .max(4000)
      .optional()
      .describe('Assistant written next week actions. Only narrative.')
  })
  .strict()

export const confirmWeeklySchema = z
  .object({
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/).describe('ISO week key such as 2026-W45.')
  })
  .strict()

export const listEntriesSchema = z
  .object({
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/).optional().describe('Filter by ISO week key.'),
    status: entryStatusSchema.optional(),
    search: z.string().max(200).optional().describe('Keyword search over entry titles.'),
    page: z.number().int().min(1).max(1000).optional(),
    pageSize: z.number().int().min(1).max(100).optional()
  })
  .strict()

@Injectable()
@AgentMiddlewareStrategy(WEEKLY_RADAR_MIDDLEWARE_NAME)
export class WeeklyRadarMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  constructor(private readonly service: WeeklyRadarService) {}

  meta: TAgentMiddlewareMeta = {
    name: WEEKLY_RADAR_MIDDLEWARE_NAME,
    label: {
      en_US: 'Weekly Radar',
      zh_Hans: '周报风险雷达'
    },
    description: {
      en_US: 'Captures work entries, scans unclosed-state risks with reproducible rules, and assembles a weekly report.',
      zh_Hans: '沉淀工作条目，用可复算的规则扫描未闭环风险，并生成带依据的周报。'
    },
    icon: {
      type: 'svg',
      value: WEEKLY_RADAR_ICON,
      color: '#0f766e'
    },
    features: [WEEKLY_RADAR_FEATURE],
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    const upsertEntryTool = tool(
      async (input: z.infer<typeof upsertEntrySchema>) => {
        const entry = await this.service.upsertEntry(scope, input)
        return stringify({
          success: true,
          message: 'Work entry saved. Tell the user the entry id and state so they can review it in the Weekly Radar Workbench.',
          data: {
            id: entry.id,
            weekKey: entry.weekKey,
            status: entry.status,
            nextAction: 'capture_more_or_scan'
          }
        })
      },
      {
        name: WEEKLY_RADAR_TOOL_NAMES.upsertEntry,
        description:
          'Capture or update one work entry from what the user actually said this week. Call it once per work item, with a stable operationId. Never invent progress, owners, or due dates that the user did not state.',
        schema: upsertEntrySchema,
        verboseParsingErrors: true
      }
    )

    const scanRisksTool = tool(
      async (input: z.infer<typeof scanRisksSchema>) => {
        const result = await this.service.scanRisks(scope, input.weekKey)
        return stringify({
          success: true,
          message: 'Risk scan completed. Risks are computed by server rules and can be replayed.',
          data: {
            weekKey: result.weekKey,
            metrics: result.metrics,
            risks: result.risks
          }
        })
      },
      {
        name: WEEKLY_RADAR_TOOL_NAMES.scanRisks,
        description:
          'Scan the stored work entries and return the unclosed-state risks with rule ids, ageing days, and evidence pointers. Call this before writing the risk section of a weekly report.',
        schema: scanRisksSchema,
        verboseParsingErrors: true
      }
    )

    const generateWeeklyTool = tool(
      async (input: z.infer<typeof generateWeeklySchema>) => {
        const weekly = await this.service.generateWeekly(scope, input)
        return stringify({
          success: true,
          message:
            'Weekly report draft generated. Metrics and risk rows were recomputed on the server. Ask the user to review it in the Weekly Radar Workbench.',
          data: {
            id: weekly.id,
            weekKey: weekly.weekKey,
            status: weekly.status,
            nextAction: 'review_in_workbench'
          }
        })
      },
      {
        name: WEEKLY_RADAR_TOOL_NAMES.generateWeekly,
        description:
          'Assemble the weekly report for one week. You may only write the narrative parts (highlights, next actions); every number and risk row is recomputed on the server from the stored entries.',
        schema: generateWeeklySchema,
        verboseParsingErrors: true
      }
    )

    const confirmWeeklyTool = tool(
      async (input: z.infer<typeof confirmWeeklySchema>) => {
        const weekly = await this.service.confirmWeekly(scope, input.weekKey)
        return stringify({
          success: true,
          message: 'Weekly report confirmed and archived.',
          data: {
            id: weekly.id,
            weekKey: weekly.weekKey,
            status: weekly.status,
            nextAction: 'done'
          }
        })
      },
      {
        name: WEEKLY_RADAR_TOOL_NAMES.confirmWeekly,
        description:
          'Confirm and archive one weekly report after the user reviewed the draft. Call it only when the user explicitly approves the report.',
        schema: confirmWeeklySchema,
        verboseParsingErrors: true
      }
    )

    const listEntriesTool = tool(
      async (input: z.infer<typeof listEntriesSchema>) => {
        const result = await this.service.listEntries(scope, input)
        return stringify({
          success: true,
          message: 'Work entries were listed.',
          data: result
        })
      },
      {
        name: WEEKLY_RADAR_TOOL_NAMES.listEntries,
        description: 'List captured work entries, optionally filtered by week, state, or keyword.',
        schema: listEntriesSchema,
        verboseParsingErrors: true
      }
    )

    return {
      name: WEEKLY_RADAR_MIDDLEWARE_NAME,
      tools: [upsertEntryTool, scanRisksTool, generateWeeklyTool, confirmWeeklyTool, listEntriesTool]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): WeeklyRadarScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}

function stringify(value: unknown) {
  return JSON.stringify(value)
}
