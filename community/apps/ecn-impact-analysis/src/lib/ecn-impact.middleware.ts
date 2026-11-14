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
  ECN_IMPACT_CREATE_TOOL_NAME,
  ECN_IMPACT_FEATURE,
  ECN_IMPACT_GET_ASSESSMENT_TOOL_NAME,
  ECN_IMPACT_GET_MATERIAL_TOOL_NAME,
  ECN_IMPACT_ICON,
  ECN_IMPACT_MIDDLEWARE_NAME,
  ECN_IMPACT_REPORT_FAILURE_TOOL_NAME,
  ECN_IMPACT_SAVE_ANALYSIS_TOOL_NAME,
  ECN_IMPACT_SEARCH_BOM_PARENTS_TOOL_NAME,
  ECN_IMPACT_SEARCH_INVENTORY_TOOL_NAME,
  ECN_IMPACT_SEARCH_PRODUCTION_ORDERS_TOOL_NAME,
  ECN_IMPACT_SEARCH_ROUTINGS_TOOL_NAME
} from './constants'
import { EcnImpactService } from './ecn-impact.service'
import { MockEcnSystemGateway } from './ecn-system-gateway'
import type { EcnScope } from './types'

/*
 * One documented SDK boundary that erases the redundant schema-bearing return
 * generic of LangChain's overloaded `tool()` helper, preventing TypeScript
 * generic explosion across the middleware's heterogeneous tool list.
 * (xpert-plugin-development / general.md: "Prevent TypeScript tool-schema
 * type explosions".)
 */
type EcnAgentTool = NonNullable<AgentMiddleware['tools']>[number]
type EcnAgentToolFactory = <TInput>(
  handler: (input: TInput) => Promise<unknown>,
  fields: {
    name: string
    description: string
    schema: z.ZodTypeAny
    verboseParsingErrors?: boolean
    metadata?: Record<string, unknown>
  }
) => EcnAgentTool
const defineEcnTool = tool as unknown as EcnAgentToolFactory

export const createAssessmentSchema = z
  .object({
    changeNo: z
      .string()
      .max(40)
      .optional()
      .describe('Engineering change request number such as ECN-2026-015. Omit only when the user did not provide one; the plugin then generates one.'),
    materialNo: z
      .string()
      .min(1)
      .max(40)
      .describe('Changed material number. Verify it exists with ecn_impact_get_material before calling.'),
    materialName: z.string().max(80).optional().describe('Material name snapshot from the material lookup.'),
    changeType: z
      .enum(['material', 'dimension', 'structure', 'process', 'other'])
      .describe('Change category: material substitution, dimension/tolerance, structure/BOM, process/routing, or other.'),
    changeDescription: z
      .string()
      .min(1)
      .max(2000)
      .describe('What changes, in the engineer\u2019s words: from-state, to-state and affected characteristics.'),
    changeReason: z.string().max(1000).optional().describe('Why the change is needed, when the user provided it.'),
    expectedEffectDate: z.string().max(20).optional().describe('Expected effective date string as provided, e.g. 2026-12-01.')
  })
  .strict()

export const getMaterialSchema = z
  .object({
    materialNo: z.string().max(40).optional().describe('Exact material number lookup.'),
    keyword: z.string().max(80).optional().describe('Fuzzy keyword lookup on number or name; use when the exact number is unknown.')
  })
  .strict()
  .refine((value) => Boolean(value.materialNo || value.keyword), {
    message: 'Provide either materialNo or keyword.'
  })

export const searchBomParentsSchema = z
  .object({
    materialNo: z.string().min(1).max(40).describe('Changed material number.'),
    maxDepth: z.number().int().min(1).max(3).optional().describe('Maximum parent levels to walk. Defaults to 3.')
  })
  .strict()

export const materialNosSchema = z
  .object({
    materialNos: z
      .array(z.string().min(1).max(40))
      .min(1)
      .max(10)
      .describe('Material numbers to query, typically the changed material plus its BOM parents from ecn_impact_search_bom_parents.')
  })
  .strict()

export const saveAnalysisSchema = z
  .object({
    assessmentId: z
      .string()
      .min(1)
      .max(64)
      .describe('Assessment id returned by ecn_impact_create_assessment or ecn_impact_get_assessment.'),
    summary: z.string().min(1).max(4000).describe('Human-readable impact analysis summary for the review desk.'),
    riskLevel: z.enum(['high', 'medium', 'low']).describe('Overall risk of the change after reviewing all evidence.'),
    items: z
      .array(
        z
          .object({
            impactKey: z
              .string()
              .min(3)
              .max(120)
              .describe('Stable identity of one finding, e.g. bom:A-210, routing:RT-1003, mo:MO-24001, inv:R-3001. Repeated impactKeys update instead of duplicate.'),
            domain: z.enum(['bom', 'routing', 'production', 'inventory']).describe('Evidence source: bom/routing from PLM & MES, production from MES, inventory from ERP.'),
            targetNo: z.string().min(1).max(60).describe('Affected object number (parent material, routing no, production order no or material no).'),
            targetName: z.string().max(80).optional().describe('Affected object name snapshot.'),
            relationPath: z.string().max(200).optional().describe('Evidence chain such as EA-200 > A-210 > P-1003.'),
            impactDescription: z.string().min(1).max(1000).describe('Why this object is affected by the change, in concrete terms.'),
            suggestedAction: z.string().max(1000).optional().describe('Concrete suggested action, e.g. re-verify fitting tolerance, rework or consume old batch first.'),
            riskLevel: z.enum(['high', 'medium', 'low']).optional().describe('Risk of this single impact item.'),
            confidence: z.number().min(0).max(1).optional().describe('Confidence in this finding between 0 and 1.'),
            evidence: z.record(z.unknown()).optional().describe('Compact structured evidence: quantityPer, order status, stock quantities. Keep it small.')
          })
          .strict()
      )
      .min(1)
      .max(50)
      .describe('Impact findings, one item per affected object. Already human-reviewed items are never overwritten.')
  })
  .strict()

export const assessmentIdSchema = z
  .object({
    assessmentId: z.string().min(1).max(64).describe('Assessment id returned by ecn_impact_create_assessment.')
  })
  .strict()

export const reportFailureSchema = z
  .object({
    assessmentId: z.string().min(1).max(64).describe('Assessment id that could not be analyzed.'),
    reason: z.string().min(1).max(1000).describe('Human-readable reason, e.g. which evidence was unavailable or contradictory.')
  })
  .strict()

export interface EcnImpactMiddlewareOptions {
  failureSimulation?: boolean
}

@Injectable()
@AgentMiddlewareStrategy(ECN_IMPACT_MIDDLEWARE_NAME)
export class EcnImpactMiddleware implements IAgentMiddlewareStrategy<EcnImpactMiddlewareOptions> {
  meta: TAgentMiddlewareMeta = {
    name: ECN_IMPACT_MIDDLEWARE_NAME,
    label: {
      en_US: 'ECN Impact Analysis',
      zh_Hans: '工程变更影响分析'
    },
    description: {
      en_US: 'Create ECN impact assessments and gather evidence across PLM/MES/ERP master data for human review.',
      zh_Hans: '创建 ECN 影响评估单，跨 PLM/MES/ERP 主数据收集证据，供人工审核确认。'
    },
    icon: {
      type: 'svg',
      value: ECN_IMPACT_ICON,
      color: '#1d4ed8'
    },
    features: [ECN_IMPACT_FEATURE],
    configSchema: {
      type: 'object',
      properties: {
        failureSimulation: {
          type: 'boolean',
          title: {
            en_US: 'Simulate transient ERP failure (demo)',
            zh_Hans: '模拟 ERP 瞬态故障（演示）'
          },
          description: {
            en_US: 'When enabled, the first inventory lookup fails once with a simulated transient error; the retry succeeds.',
            zh_Hans: '开启后，第一次库存查询会抛出一次模拟瞬态错误，重试即恢复。用于演示失败与重试场景。'
          },
          default: false
        }
      },
      required: []
    }
  }

  constructor(
    private readonly service: EcnImpactService,
    private readonly gateway: MockEcnSystemGateway
  ) {}

  createMiddleware(
    options: EcnImpactMiddlewareOptions,
    context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    this.gateway.setFailureSimulation(options?.failureSimulation === true)
    const scope = scopeFromContext(context)

    const createAssessmentTool = defineEcnTool(
      async (input: z.infer<typeof createAssessmentSchema>) => {
        const { assessment, created } = await this.service.createAssessment(scope, {
          changeNo: input.changeNo,
          materialNo: input.materialNo,
          materialName: input.materialName,
          changeType: input.changeType,
          changeDescription: input.changeDescription,
          changeReason: input.changeReason,
          expectedEffectDate: input.expectedEffectDate
        })
        return JSON.stringify({
          message: created
            ? `Impact assessment ${assessment.changeNo} was created. Now gather evidence, then call ecn_impact_save_analysis once.`
            : `Assessment for change ${assessment.changeNo} already exists (status ${assessment.status}). Continue with it instead of creating a duplicate.`,
          data: {
            assessmentId: assessment.id,
            changeNo: assessment.changeNo,
            materialNo: assessment.materialNo,
            status: assessment.status,
            created
          }
        })
      },
      {
        name: ECN_IMPACT_CREATE_TOOL_NAME,
        description:
          'Create one ECN impact assessment record from a user-described engineering change. Call this exactly once per change before gathering evidence. If the change number already exists the existing assessment is returned; do not create duplicates.',
        schema: createAssessmentSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Create impact assessment', zh_Hans: '创建影响评估单' }
        }
      }
    )

    const getMaterialTool = defineEcnTool(
      async (input: z.infer<typeof getMaterialSchema>) => {
        if (input.materialNo) {
          const material = await this.gateway.getMaterial(input.materialNo)
          if (!material) {
            return JSON.stringify({
              message: `Material ${input.materialNo} was not found in PLM master data.`,
              data: { found: false, materialNo: input.materialNo }
            })
          }
          return JSON.stringify({ message: 'Material found.', data: { found: true, material } })
        }
        const candidates = await this.gateway.searchMaterials(input.keyword ?? '', 10)
        return JSON.stringify({
          message: candidates.length
            ? 'Material candidates returned; pick the exact materialNo from these.'
            : 'No material matched the keyword.',
          data: { found: candidates.length > 0, candidates }
        })
      },
      {
        name: ECN_IMPACT_GET_MATERIAL_TOOL_NAME,
        description:
          'Look up one material in PLM master data by exact number, or search candidates by keyword. Call before creating an assessment to verify the changed material exists.',
        schema: getMaterialSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Look up material', zh_Hans: '查询物料档案' }
        }
      }
    )

    const searchBomParentsTool = defineEcnTool(
      async (input: z.infer<typeof searchBomParentsSchema>) => {
        const parents = await this.gateway.searchBomParents(input.materialNo, input.maxDepth ?? 3)
        return JSON.stringify({
          message: parents.length
            ? `Found ${parents.length} BOM parent levels for ${input.materialNo}. Use parent numbers to query routings, production orders and inventory next.`
            : `No BOM parents found for ${input.materialNo}; it is likely a top-level finished product.`,
          data: { materialNo: input.materialNo, parents }
        })
      },
      {
        name: ECN_IMPACT_SEARCH_BOM_PARENTS_TOOL_NAME,
        description:
          'Search PLM BOM parent chain of the changed material (up to 3 levels, with relationPath evidence). Call after ecn_impact_get_material to find affected parent assemblies and the finished product.',
        schema: searchBomParentsSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Search BOM parents', zh_Hans: '查询 BOM 父件链' }
        }
      }
    )

    const searchRoutingsTool = defineEcnTool(
      async (input: z.infer<typeof materialNosSchema>) => {
        const routings = await this.gateway.searchRoutings(input.materialNos)
        return JSON.stringify({
          message: routings.length
            ? `Found ${routings.length} process routings referencing the given materials.`
            : 'No process routing references the given materials.',
          data: { routings }
        })
      },
      {
        name: ECN_IMPACT_SEARCH_ROUTINGS_TOOL_NAME,
        description:
          'Search MES process routings referencing the given materials (the changed material and/or its BOM parents). Routing operations and key characteristics are the evidence for process impact.',
        schema: materialNosSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Search routings', zh_Hans: '查询工艺路线' }
        }
      }
    )

    const searchProductionOrdersTool = defineEcnTool(
      async (input: z.infer<typeof materialNosSchema>) => {
        const orders = await this.gateway.searchProductionOrders(input.materialNos)
        return JSON.stringify({
          message: orders.length
            ? `Found ${orders.length} production orders for the given materials.`
            : 'No open production orders for the given materials.',
          data: { orders }
        })
      },
      {
        name: ECN_IMPACT_SEARCH_PRODUCTION_ORDERS_TOOL_NAME,
        description:
          'Search MES production orders (in-progress, released, finished-unconfirmed) for the given materials. Call to assess rework/disposition impact on work in progress.',
        schema: materialNosSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Search production orders', zh_Hans: '查询在制工单' }
        }
      }
    )

    const searchInventoryTool = defineEcnTool(
      async (input: z.infer<typeof materialNosSchema>) => {
        const inventory = await this.gateway.searchInventory(input.materialNos)
        return JSON.stringify({
          message: inventory.length
            ? `Found ${inventory.length} inventory records for the given materials.`
            : 'No inventory records for the given materials.',
          data: { inventory }
        })
      },
      {
        name: ECN_IMPACT_SEARCH_INVENTORY_TOOL_NAME,
        description:
          'Search ERP inventory (on-hand, in-transit, quality-hold) for the given materials. Call to assess old-material disposition and shortage risk.',
        schema: materialNosSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Search inventory', zh_Hans: '查询库存' }
        }
      }
    )

    const saveAnalysisTool = defineEcnTool(
      async (input: z.infer<typeof saveAnalysisSchema>) => {
        const detail = await this.service.saveAnalysis(
          scope,
          {
            assessmentId: input.assessmentId,
            summary: input.summary,
            riskLevel: input.riskLevel,
            items: input.items
          },
          'AI'
        )
        return JSON.stringify({
          message:
            'Impact analysis was saved. Ask the engineer to open the ECN review desk to accept or reject each impact item; human confirmation completes the assessment.',
          data: {
            assessmentId: detail.id,
            changeNo: detail.changeNo,
            status: detail.status,
            itemCount: detail.itemCount,
            pendingCount: detail.pendingCount,
            riskLevel: detail.riskLevel
          }
        })
      },
      {
        name: ECN_IMPACT_SAVE_ANALYSIS_TOOL_NAME,
        description:
          'Save one completed impact analysis: summary, overall risk level and per-object impact items with evidence. Save once per analysis pass; items are idempotent by impactKey and human-reviewed items are never overwritten. Do not save an empty list; use ecn_impact_report_analysis_failure when no meaningful analysis is possible.',
        schema: saveAnalysisSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Save impact analysis', zh_Hans: '保存影响分析' }
        }
      }
    )

    const getAssessmentTool = defineEcnTool(
      async (input: z.infer<typeof assessmentIdSchema>) => {
        const detail = await this.service.getAssessmentForAgent(scope, input.assessmentId)
        return JSON.stringify({
          message: `Assessment ${detail.changeNo} is in status ${detail.status}.`,
          data: {
            assessmentId: detail.id,
            changeNo: detail.changeNo,
            materialNo: detail.materialNo,
            changeType: detail.changeType,
            changeDescription: detail.changeDescription,
            changeReason: detail.changeReason,
            status: detail.status,
            lastError: detail.lastError,
            itemCount: detail.itemCount,
            pendingCount: detail.pendingCount
          }
        })
      },
      {
        name: ECN_IMPACT_GET_ASSESSMENT_TOOL_NAME,
        description:
          'Get one impact assessment header (change info, status, last error, item counts) to resume or re-analyze an existing assessment.',
        schema: assessmentIdSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Get assessment', zh_Hans: '查询评估单' }
        }
      }
    )

    const reportFailureTool = defineEcnTool(
      async (input: z.infer<typeof reportFailureSchema>) => {
        const detail = await this.service.reportAnalysisFailure(scope, input.assessmentId, input.reason)
        return JSON.stringify({
          message:
            'Analysis failure was recorded on the assessment. The engineer can retry from the review desk. Do not save partial guesses as impact items.',
          data: {
            assessmentId: detail.id,
            status: detail.status,
            lastError: detail.lastError,
            retryCount: detail.retryCount
          }
        })
      },
      {
        name: ECN_IMPACT_REPORT_FAILURE_TOOL_NAME,
        description:
          'Report that a meaningful impact analysis could not be completed (missing master data, contradictory evidence). Records the human-readable reason on the assessment; the engineer retries later.',
        schema: reportFailureSchema,
        verboseParsingErrors: true,
        metadata: {
          toolName: { en_US: 'Report analysis failure', zh_Hans: '上报分析失败' }
        }
      }
    )

    return {
      name: ECN_IMPACT_MIDDLEWARE_NAME,
      tools: [
        createAssessmentTool,
        getMaterialTool,
        searchBomParentsTool,
        searchRoutingsTool,
        searchProductionOrdersTool,
        searchInventoryTool,
        saveAnalysisTool,
        getAssessmentTool,
        reportFailureTool
      ]
    }
  }
}

function scopeFromContext(context: IAgentMiddlewareContext): EcnScope {
  return {
    tenantId: context.tenantId,
    organizationId: context.organizationId,
    userId: context.userId,
    assistantId: context.xpertId,
    conversationId: context.conversationId
  }
}
