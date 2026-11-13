/**
 * 7 个智能体工具的名称和输入 schema。
 *
 * 设计原则（skill “Agent Tool Parameter Design”）：模型只提供需要它判断的内容。
 * - 所有工具只收 analysisJobId，请求、产品、数量等由服务端按任务自己查（技术方案决策 T6）；
 * - 保存结论时不收需求量/缺口这些数字，服务端重算（产品设计决策 3）；
 * - schema 全部 .strict()，字段说明用英文（skill 要求工具元数据保持稳定英文）。
 * Python 类比：LangChain Python 里给 @tool 配的 pydantic args_schema。
 */
import { z } from 'zod/v3'
import { isoDateSchema } from './schemas.js'
import { FEASIBILITIES, REPORTED_FAILURE_CODES, SUGGESTION_TYPES } from './types.js'

export const TOOL_NAMES = {
  getContext: 'shortage_get_analysis_context',
  explodeBom: 'shortage_explode_bom',
  checkInventory: 'shortage_check_inventory',
  supplyOptions: 'shortage_get_supply_options',
  saveFinding: 'shortage_save_finding',
  finalize: 'shortage_finalize_analysis',
  reportFailure: 'shortage_report_failure'
} as const

/** 全部工具名（中间件 getToolNames 返回它） */
export const EXPEDITE_TOOL_NAMES = Object.values(TOOL_NAMES)

/**
 * 会改变工作台可见状态的工具：视图订阅它们的完成事件来刷新。
 * get_analysis_context 也算，因为它把任务从“排队”改为“运行中”。
 */
export const EXPEDITE_MUTATION_TOOL_NAMES = [
  TOOL_NAMES.getContext,
  TOOL_NAMES.saveFinding,
  TOOL_NAMES.finalize,
  TOOL_NAMES.reportFailure
] as const

const analysisJobId = z
  .string()
  .uuid()
  .describe('The analysisJobId UUID given in the user message that started this analysis. Never invent one.')

export const jobOnlySchema = z.object({ analysisJobId }).strict()
export type JobOnlyInput = z.infer<typeof jobOnlySchema>

export const supplyOptionsSchema = z
  .object({
    analysisJobId,
    materialCodes: z
      .array(z.string().trim().min(1).max(20))
      .min(1)
      .max(30)
      .describe('Material codes to look up, normally the shortageMaterialCodes returned by shortage_check_inventory.')
  })
  .strict()
export type SupplyOptionsInput = z.infer<typeof supplyOptionsSchema>

export const saveFindingSchema = z
  .object({
    analysisJobId,
    materialCode: z.string().trim().min(1).max(20).describe('One short material code from shortage_check_inventory.'),
    suggestionType: z
      .enum(SUGGESTION_TYPES)
      .describe('expedite = pull in an inbound PO or order; substitute = use an approved substitute; reschedule = the material decides a later delivery date; no_action = gap can be ignored (explain why).'),
    suggestedDate: isoDateSchema
      .optional()
      .describe('YYYY-MM-DD. Required for expedite (date the material must arrive) and reschedule (feasible date).'),
    substituteCode: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .optional()
      .describe('Required only for substitute: one substitute code returned by shortage_get_supply_options.'),
    rationale: z
      .string()
      .trim()
      .min(10)
      .max(600)
      .describe('Why, citing tool facts such as PO numbers, dates, quantities and lead times. Do not restate numbers you did not receive.')
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.suggestionType === 'expedite' || value.suggestionType === 'reschedule') && !value.suggestedDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['suggestedDate'], message: 'suggestedDate is required for expedite and reschedule' })
    }
    if (value.suggestionType === 'substitute' && !value.substituteCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['substituteCode'], message: 'substituteCode is required for substitute' })
    }
  })
export type SaveFindingToolInput = z.infer<typeof saveFindingSchema>

export const finalizeSchema = z
  .object({
    analysisJobId,
    feasibility: z
      .enum(FEASIBILITIES)
      .describe('feasible = target date can be met as is; conditional = met only if the saved suggestions are executed; infeasible = target date cannot be met.'),
    recommendedDate: isoDateSchema.describe('YYYY-MM-DD delivery date you recommend promising to the customer.'),
    summary: z.string().trim().min(10).max(800).describe('Short conclusion for the planner: critical material, key actions and why.')
  })
  .strict()
export type FinalizeToolInput = z.infer<typeof finalizeSchema>

export const reportFailureSchema = z
  .object({
    analysisJobId,
    errorCode: z.enum(REPORTED_FAILURE_CODES).describe('Use the errorCode returned by the failing tool when it is one of these values.'),
    reason: z.string().trim().min(5).max(300).describe('Plain explanation of what failed, for the planner.')
  })
  .strict()
export type ReportFailureToolInput = z.infer<typeof reportFailureSchema>
