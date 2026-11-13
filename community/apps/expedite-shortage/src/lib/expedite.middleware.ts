/**
 * Agent 中间件：把缺料分析能力以 7 个“工具”交给助手调用。
 *
 * - 工具只做三件事：校验输入（schema）→ 调 Service → 把结果转成精简 JSON 回执；
 * - 业务错误不抛给模型，而是返回 { success:false, errorCode, details, nextAction }，让模型能自己决定下一步；
 * - 确认、驳回、采纳都不做成工具：只能由计划员在工作台操作（产品设计决策 6）。
 * Python 类比：LangChain Python 里一组 @tool 函数，外面包了一个“工具注册类”。
 */
import { Injectable } from '@nestjs/common'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { AgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import type { AgentMiddleware, IAgentMiddlewareContext, IAgentMiddlewareStrategy } from '@xpert-ai/plugin-sdk'
import { defineAgentTool } from './agent-tool.js'
import type { PluginAgentTool } from './agent-tool.js'
import { EXPEDITE_FEATURE, MIDDLEWARE_NAME, PLUGIN_ICON } from './constants.js'
import { ExpediteError } from './errors.js'
import type { ExpediteErrorCode } from './errors.js'
import { ExpediteService } from './expedite.service.js'
import {
  EXPEDITE_TOOL_NAMES,
  TOOL_NAMES,
  finalizeSchema,
  jobOnlySchema,
  reportFailureSchema,
  saveFindingSchema,
  supplyOptionsSchema
} from './tool-schemas.js'
import type {
  FinalizeToolInput,
  JobOnlyInput,
  ReportFailureToolInput,
  SaveFindingToolInput,
  SupplyOptionsInput
} from './tool-schemas.js'
import type { ExpediteScope } from './types.js'

/** 中间件选项：本版没有可配置项 */
export type ExpediteMiddlewareOptions = Record<string, never>

/** 每个错误码对应给模型的下一步建议（英文，稳定） */
const NEXT_ACTION: Partial<Record<ExpediteErrorCode, string>> = {
  JOB_NOT_FOUND: 'Use the exact analysisJobId from the user message. Do not guess.',
  JOB_NOT_ACTIVE: 'This analysis is no longer active (finished, failed, timed out or replaced). Stop and tell the user to check the workbench.',
  INVENTORY_UNAVAILABLE: 'The inventory service is unavailable for this analysis and will not recover within it. Call shortage_report_failure with errorCode INVENTORY_UNAVAILABLE, then tell the user to retry from the workbench.',
  UNKNOWN_MATERIAL: 'Only use material codes returned by shortage_explode_bom or shortage_check_inventory.',
  NOT_A_SHORTAGE: 'Save findings only for codes listed in shortageMaterialCodes.',
  SUGGESTED_DATE_REQUIRED: 'Provide suggestedDate (YYYY-MM-DD) for expedite and reschedule.',
  SUBSTITUTE_NOT_ALLOWED: 'Use one of allowedSubstitutes, or choose another suggestion type.',
  MISSING_FINDINGS: 'Save one finding for each listed material code, then call shortage_finalize_analysis again.',
  PRODUCT_HAS_NO_BOM: 'Call shortage_report_failure with errorCode DATA_INCOMPLETE.'
}

@Injectable()
@AgentMiddlewareStrategy(MIDDLEWARE_NAME)
export class ExpediteShortageMiddleware implements IAgentMiddlewareStrategy<ExpediteMiddlewareOptions> {
  readonly meta: TAgentMiddlewareMeta = {
    name: MIDDLEWARE_NAME,
    label: { en_US: 'Expedite shortage analysis', zh_Hans: '提前交货缺料分析' },
    description: {
      en_US: 'Tools for analysing material shortages of an expedite request. Confirmation stays with the planner in the workbench.',
      zh_Hans: '为提前交货请求做缺料分析的工具集；确认结论由计划员在工作台完成。'
    },
    // 工具族的默认图标只在这里定义一次，工具本身不再单独设置
    icon: PLUGIN_ICON,
    features: [EXPEDITE_FEATURE],
    configSchema: { type: 'object', properties: {}, additionalProperties: false }
  }

  constructor(private readonly service: ExpediteService) {}

  /** 静态声明本中间件提供的工具名，平台据此做能力摘要 */
  getToolNames(): readonly string[] {
    return EXPEDITE_TOOL_NAMES
  }

  createMiddleware(_options: ExpediteMiddlewareOptions, context: IAgentMiddlewareContext): AgentMiddleware {
    // 身份一律从已认证的运行时上下文取，不接受模型传入的租户/用户
    const scope: ExpediteScope = {
      tenantId: context.tenantId,
      organizationId: context.organizationId ?? null,
      userId: context.userId
    }
    return { name: MIDDLEWARE_NAME, tools: this.buildTools(scope, context.conversationId) }
  }

  /** 按给定范围生成工具（单测直接调用它） */
  buildTools(scope: ExpediteScope, conversationId?: string): PluginAgentTool[] {
    const service = this.service
    return [
      defineAgentTool(
        (input: JobOnlyInput) => run(() => service.getAnalysisContext(scope, input.analysisJobId, conversationId)),
        {
          name: TOOL_NAMES.getContext,
          description:
            'Step 1. Read the expedite request behind an analysisJobId (order, product, quantity, original and target dates, as-of date) and mark the analysis as running. Call this first, once.',
          schema: jobOnlySchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Read analysis task', zh_Hans: '读取分析任务' } }
        }
      ),
      defineAgentTool((input: JobOnlyInput) => run(() => service.explodeBomForJob(scope, input.analysisJobId)), {
        name: TOOL_NAMES.explodeBom,
        description:
          'Step 2 (read-only). Explode the two-level BOM of the requested product and quantity into purchased materials with required quantities and BOM paths.',
        schema: jobOnlySchema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Explode BOM', zh_Hans: '展开 BOM' } }
      }),
      defineAgentTool((input: JobOnlyInput) => run(() => service.checkInventoryForJob(scope, input.analysisJobId)), {
        name: TOOL_NAMES.checkInventory,
        description:
          'Step 3 (read-only). For every material: on-hand stock, inbound POs arriving on or before the target date (counted) and after it (not counted), available quantity and shortage. Numbers are computed by the server; use them as given.',
        schema: jobOnlySchema,
        verboseParsingErrors: true,
        metadata: { toolName: { en_US: 'Check inventory and inbound', zh_Hans: '查询库存与在途' } }
      }),
      defineAgentTool(
        (input: SupplyOptionsInput) => run(() => service.getSupplyOptionsForJob(scope, input.analysisJobId, input.materialCodes)),
        {
          name: TOOL_NAMES.supplyOptions,
          description:
            'Step 4 (read-only). For shortage materials: purchase lead time, earliest available date (from inbound POs or a new order) and approved substitutes with their stock.',
          schema: supplyOptionsSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Check lead times and substitutes', zh_Hans: '查询提前期与替代料' } }
        }
      ),
      defineAgentTool(
        (input: SaveFindingToolInput) =>
          run(() =>
            service.saveFinding(scope, input.analysisJobId, {
              materialCode: input.materialCode,
              suggestionType: input.suggestionType,
              suggestedDate: input.suggestedDate,
              substituteCode: input.substituteCode,
              rationale: input.rationale
            })
          ),
        {
          name: TOOL_NAMES.saveFinding,
          description:
            'Step 5. Save your suggestion for ONE shortage material; call once per shortage material. Saving the same material again in the same analysis overwrites it. Quantities are recomputed by the server, so do not send them. The planner reviews every finding in the workbench.',
          schema: saveFindingSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Save shortage finding', zh_Hans: '保存缺料结论' } }
        }
      ),
      defineAgentTool(
        (input: FinalizeToolInput) =>
          run(() =>
            service.finalizeAnalysis(scope, input.analysisJobId, {
              feasibility: input.feasibility,
              recommendedDate: input.recommendedDate,
              summary: input.summary
            })
          ),
        {
          name: TOOL_NAMES.finalize,
          description:
            'Step 6. Submit the overall conclusion after every shortage material has a saved finding. Moves the request to pending review; it does NOT confirm anything to the customer. Fails with MISSING_FINDINGS if any shortage lacks a finding.',
          schema: finalizeSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Submit analysis conclusion', zh_Hans: '提交分析结论' } }
        }
      ),
      defineAgentTool(
        (input: ReportFailureToolInput) =>
          run(() => service.reportFailure(scope, input.analysisJobId, { errorCode: input.errorCode, reason: input.reason })),
        {
          name: TOOL_NAMES.reportFailure,
          description:
            'Report that this analysis cannot be completed (for example INVENTORY_UNAVAILABLE). Marks the request as failed so the planner can retry from the workbench. Never invent data instead.',
          schema: reportFailureSchema,
          verboseParsingErrors: true,
          metadata: { toolName: { en_US: 'Report analysis failure', zh_Hans: '上报分析失败' } }
        }
      )
    ]
  }
}

/** 执行业务调用并统一序列化：成功带 success:true；业务错误转成可读的失败回执 */
async function run(action: () => Promise<object>): Promise<string> {
  try {
    const result = await action()
    return JSON.stringify({ success: true, ...result })
  } catch (error) {
    if (error instanceof ExpediteError) {
      return JSON.stringify({
        success: false,
        errorCode: error.code,
        details: error.details,
        nextAction: NEXT_ACTION[error.code] ?? 'Explain the problem to the user and stop.'
      })
    }
    throw error
  }
}
