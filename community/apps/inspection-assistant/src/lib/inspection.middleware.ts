import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  RequestContext
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
  INSPECTION_AGENT_MIDDLEWARE_STRATEGY,
  INSPECTION_FEATURE,
  INSPECTION_ICON
} from './constants.js'
import { InspectionService } from './inspection.service.js'
import type { InspectionScope } from './types.js'

const analyzeFaultSchema = z.object({
  caseId: z.string().min(1).describe('Inspection case id.'),
  deviceType: z.string().optional().describe('Device type, e.g. BBU, RRU, 传输设备, 动环监控.'),
  faultCategory: z.string().optional().describe('Fault category, e.g. 电源掉电, 驻波告警.'),
  faultSummary: z.string().optional().describe('One-sentence summary of the fault.'),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .describe('Fault severity: low / medium / high / critical.'),
  impact: z.string().optional().describe('Business impact scope, e.g. 影响 5 个小区, 用户无信号.'),
  possibleCauses: z.array(z.string()).optional().describe('Likely root causes.')
})

const searchHistorySchema = z.object({
  caseId: z.string().min(1).describe('Inspection case id the search belongs to.'),
  deviceType: z.string().optional().describe('Device type filter, e.g. BBU, RRU, 传输设备.'),
  keywords: z
    .array(z.string())
    .optional()
    .describe('Fault keywords extracted from the fault description for history matching.'),
  limit: z.number().int().min(1).max(5).optional().describe('Max history records to return.')
})

const saveRecommendationSchema = z.object({
  caseId: z.string().min(1).describe('Inspection case id.'),
  recommendation: z
    .string()
    .min(1)
    .describe('Actionable handling recommendation, ordered steps, based on history references and fault analysis.'),
  historyReferenceIds: z
    .array(z.string())
    .optional()
    .describe('Ids of history resolution records referenced by this recommendation.')
})

const reportFailureSchema = z.object({
  caseId: z.string().min(1).describe('Inspection case id.'),
  reason: z.string().optional().describe('Why the AI analysis failed.')
})

@Injectable()
@AgentMiddlewareStrategy(INSPECTION_AGENT_MIDDLEWARE_STRATEGY)
export class InspectionMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: INSPECTION_AGENT_MIDDLEWARE_STRATEGY,
    label: {
      en_US: 'Inspection & Fault Handling Assistant',
      zh_Hans: '机房/基站巡检与故障处理助手'
    },
    icon: {
      type: 'svg',
      value: INSPECTION_ICON
    },
    description: {
      en_US: 'Analyze inspection fault descriptions, retrieve historical resolution plans, and save AI recommendations for the workbench.',
      zh_Hans: '解析巡检故障描述，检索历史处理方案，并保存 AI 处理建议供工作台确认。'
    },
    features: [INSPECTION_FEATURE],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly service: InspectionService) {}

  createMiddleware(
    _options: Record<string, never>,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const scope = scopeFromContext(context)

    return {
      name: INSPECTION_AGENT_MIDDLEWARE_STRATEGY,
      tools: [
        tool(
          async (input) =>
            JSON.stringify(await this.service.saveAiAnalysis(scope, input.caseId, {
              deviceType: input.deviceType,
              faultCategory: input.faultCategory,
              faultSummary: input.faultSummary,
              severity: input.severity,
              impact: input.impact,
              possibleCauses: input.possibleCauses
            }), null, 2),
          {
            name: 'inspection_analyze_fault',
            description:
              'Save the structured AI analysis of an inspection case fault: device type, fault category, severity, impact, and possible causes.',
            schema: analyzeFaultSchema
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(
              await this.service.searchHistory(scope, {
                deviceType: input.deviceType,
                keywords: input.keywords ?? [],
                limit: input.limit
              }),
              null,
              2
            ),
          {
            name: 'inspection_search_history',
            description:
              'Search historical resolution records for similar faults by device type and keywords, so the AI can reuse proven handling plans.',
            schema: searchHistorySchema
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(
              await this.service.saveRecommendation(scope, input.caseId, {
                recommendation: input.recommendation,
                historyReferenceIds: input.historyReferenceIds
              }),
              null,
              2
            ),
          {
            name: 'inspection_save_recommendation',
            description:
              'Save the AI handling recommendation for an inspection case, optionally referencing retrieved history record ids.',
            schema: saveRecommendationSchema
          }
        ),
        tool(
          async (input) =>
            JSON.stringify(
              await this.service.reportFailure(scope, input.caseId, { reason: input.reason }),
              null,
              2
            ),
          {
            name: 'inspection_report_failure',
            description:
              'Mark an inspection case as failed when AI analysis cannot complete, so the user can retry later.',
            schema: reportFailureSchema
          }
        )
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): InspectionScope {
  return {
    tenantId: context.tenantId,
    organizationId:
      context.organizationId === undefined
        ? RequestContext.getOrganizationId()
        : context.organizationId,
    workspaceId: context.workspaceId ?? null,
    projectId: context.projectId ?? null,
    userId: context.userId
  }
}
