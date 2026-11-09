import { DynamicStructuredTool } from '@langchain/core/tools'
import { tool } from '@langchain/core/tools'
import { Injectable } from '@nestjs/common'
import { z } from 'zod/v3'
import { ToolsetStrategy, BuiltinToolset } from '@xpert-ai/plugin-sdk'
import type { IToolsetStrategy } from '@xpert-ai/plugin-sdk'
import type { TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import {
  WEEKLY_RADAR_ICON,
  WEEKLY_RADAR_MIDDLEWARE_NAME,
  WEEKLY_RADAR_TOOL_NAMES
} from './constants'
import {
  upsertEntrySchema,
  scanRisksSchema,
  generateWeeklySchema,
  confirmWeeklySchema,
  listEntriesSchema
} from './weekly-radar.middleware'
import type { WeeklyRadarScope } from './types'
import { WeeklyRadarService } from './weekly-radar.service'

class WeeklyRadarToolset extends BuiltinToolset<DynamicStructuredTool> {
  constructor(
    tools: DynamicStructuredTool[],
    params?: TBuiltinToolsetParams
  ) {
    super(WEEKLY_RADAR_MIDDLEWARE_NAME, undefined, params)
    this.tools = tools
  }

  getId(): string {
    return WEEKLY_RADAR_MIDDLEWARE_NAME
  }

  getName(): string {
    return WEEKLY_RADAR_MIDDLEWARE_NAME
  }
}

/**
 * Exposes the Weekly Radar agent tools through the platform's toolset strategy
 * registry. The assistant template wires this provider as a middleware graph
 * node, and the runtime resolves it via TOOLSET_STRATEGY.
 */
@Injectable()
@ToolsetStrategy(WEEKLY_RADAR_MIDDLEWARE_NAME)
export class WeeklyRadarToolsetStrategy implements IToolsetStrategy {
  readonly meta = {
    author: 'XpertAI',
    tags: ['weekly-report', 'productivity'],
    name: WEEKLY_RADAR_MIDDLEWARE_NAME,
    label: {
      en_US: 'Weekly Radar Tools',
      zh_Hans: '周报风险雷达工具'
    },
    description: {
      en_US: 'Capture work entries, scan unclosed-state risks, and assemble the weekly report.',
      zh_Hans: '沉淀工作条目、扫描未闭环风险、生成周报。'
    },
    icon: {
      type: 'svg' as const,
      value: WEEKLY_RADAR_ICON,
      color: '#0f766e'
    },
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly service: WeeklyRadarService) {}

  async validateConfig(_config: Record<string, never>): Promise<void> {
    // The Weekly Radar tools need no installation configuration.
  }

  createTools(): DynamicStructuredTool<z.ZodSchema>[] {
    // Scope-free preview tools; the runtime uses create() with per-run params.
    return this.buildTools({
      tenantId: '',
      organizationId: null,
      userId: null,
      assistantId: null,
      conversationId: null
    }) as DynamicStructuredTool<z.ZodSchema>[]
  }

  async create(_config: Record<string, never>, params?: TBuiltinToolsetParams): Promise<BuiltinToolset> {
    const scope: WeeklyRadarScope = {
      tenantId: params?.tenantId,
      organizationId: params?.organizationId ?? null,
      userId: params?.userId ?? null,
      assistantId: params?.xpertId ?? null,
      conversationId: params?.conversationId ?? null
    }
    return new WeeklyRadarToolset(this.buildTools(scope), params)
  }

  private buildTools(scope: WeeklyRadarScope): DynamicStructuredTool[] {
    const upsertEntryTool = tool(
      async (input: z.infer<typeof upsertEntrySchema>) => {
        const entry = await this.service.upsertEntry(scope, input)
        return JSON.stringify({
          success: true,
          message:
            'Work entry saved. Tell the user the entry id and state so they can review it in the Weekly Radar Workbench.',
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
        return JSON.stringify({
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
        return JSON.stringify({
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
        return JSON.stringify({
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
        return JSON.stringify({
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

    return [
      upsertEntryTool,
      scanRisksTool,
      generateWeeklyTool,
      confirmWeeklyTool,
      listEntriesTool
    ]
  }
}
