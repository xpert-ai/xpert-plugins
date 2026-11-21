/**
 * 视图动作（界面按钮）的输入校验。所有 schema 都 .strict()：多余字段直接拒绝，
 * 防止界面伪造 tenantId 之类的字段。
 * Python 类比：pydantic 模型 + model_config = ConfigDict(extra='forbid')。
 */
import { z } from 'zod/v3'
import { FINDING_DECISIONS } from './types.js'

/** 'YYYY-MM-DD' 且是真实存在的日期 */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), 'Invalid calendar date')

export const createRequestInputSchema = z
  .object({
    orderNo: z.string().trim().min(1).max(40),
    customerName: z.string().trim().min(1).max(80),
    productCode: z.string().trim().min(1).max(20),
    quantity: z.number().int().min(1).max(100000),
    originalDueDate: isoDateSchema,
    targetDate: isoDateSchema,
    remark: z.string().trim().max(300).optional(),
    demoFailInventoryOnce: z.boolean().optional()
  })
  .strict()
export type CreateRequestInput = z.infer<typeof createRequestInputSchema>

export const requestIdInputSchema = z.object({ requestId: z.string().uuid() }).strict()

export const setFindingDecisionInputSchema = z
  .object({
    findingId: z.string().uuid(),
    decision: z.enum(FINDING_DECISIONS),
    note: z.string().trim().max(300).optional()
  })
  .strict()
export type SetFindingDecisionInput = z.infer<typeof setFindingDecisionInputSchema>

export const confirmRequestInputSchema = z
  .object({
    requestId: z.string().uuid(),
    finalDate: isoDateSchema,
    note: z.string().trim().max(500).optional()
  })
  .strict()
export type ConfirmRequestInput = z.infer<typeof confirmRequestInputSchema>

export const rejectAnalysisInputSchema = z
  .object({
    requestId: z.string().uuid(),
    reason: z.string().trim().min(1).max(300)
  })
  .strict()
export type RejectAnalysisInput = z.infer<typeof rejectAnalysisInputSchema>

/** 放弃本次分析：带上界面看到的任务 ID，防止误放弃一个更新的任务 */
export const abandonAnalysisInputSchema = z
  .object({
    requestId: z.string().uuid(),
    jobId: z.string().uuid()
  })
  .strict()
export type AbandonAnalysisInput = z.infer<typeof abandonAnalysisInputSchema>

export const listRequestsQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(40).optional(),
  status: z.enum(['draft', 'analyzing', 'failed', 'pending_review', 'confirmed', 'rejected']).optional()
})
export type ListRequestsQuery = z.input<typeof listRequestsQuerySchema>
