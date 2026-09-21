import { z } from 'zod/v3'

const nonblank = (max: number) => z.string().min(1).max(max).refine((value) => value.trim().length > 0)
// Local preview capability is explicit; Xpert hosts omit it and retain their assistant flow.
export const localExtractionCapabilitySchema = z.object({ enabled: z.boolean(), model: nonblank(128) }).strict()
export type LocalExtractionCapability = z.infer<typeof localExtractionCapabilitySchema>
export const localExtractSchema = z.object({ requestKey: nonblank(128), title: nonblank(120), sourceText: nonblank(6000) }).strict()
export const fieldValueSchema = z.object({ value: nonblank(50000), evidence: nonblank(50000) }).strict()
export const fieldsSchema = z.object({
  partyA: fieldValueSchema.nullable(), partyB: fieldValueSchema.nullable(), amount: fieldValueSchema.nullable(),
  effectiveDate: fieldValueSchema.nullable(), expiryDate: fieldValueSchema.nullable(), paymentTerms: fieldValueSchema.nullable()
}).strict()
export const createSchema = z.object({
  requestKey: nonblank(128), title: nonblank(120), sourceText: nonblank(50000), fields: fieldsSchema
}).strict().superRefine((input, context) => {
  for (const [key, field] of Object.entries(input.fields)) {
    if (field && (!input.sourceText.includes(field.evidence) || !field.evidence.includes(field.value))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['fields', key], message: 'Evidence must quote the source and contain the value.' })
    }
  }
})
export const contractIdSchema = z.string().uuid()
export const idInputSchema = z.object({ contractId: contractIdSchema }).strict()
export const emptyInputSchema = z.object({}).strict()
export const querySchema = z.object({ contractId: contractIdSchema.optional() }).strict()
export const versionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const updateSchema = z.object({ contractId: contractIdSchema, expectedVersion: versionSchema, fields: fieldsSchema }).strict()
export const confirmSchema = z.object({ contractId: contractIdSchema, expectedVersion: versionSchema }).strict()
export const statusSchema = z.enum(['DRAFT', 'CONFIRMED'])
const instantSchema = z.string().datetime({ offset: true })
export const contractSummarySchema = z.object({
  id: contractIdSchema, title: nonblank(120), status: statusSchema, version: versionSchema,
  warnings: z.array(z.string().max(2000)).max(30), updatedAt: instantSchema
}).strict()
export const contractSchema = contractSummarySchema.extend({
  sourceText: nonblank(50000), fields: fieldsSchema, createdAt: instantSchema,
  audit: z.array(z.object({ action: z.enum(['CREATED', 'UPDATED', 'CONFIRMED']), actorId: nonblank(128), at: instantSchema }).strict())
}).strict()
export const listSchema = z.object({ items: z.array(contractSummarySchema).max(50) }).strict()
export const summarySchema = z.object({ status: statusSchema, summary: nonblank(400000) }).strict()
export type Contract = z.infer<typeof contractSchema>
export type ContractSummary = z.infer<typeof contractSummarySchema>
export type CreateContract = z.infer<typeof createSchema>
export type Fields = z.infer<typeof fieldsSchema>

export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_INPUT: '请求内容无效，请检查字段和版本。',
  UNAUTHORIZED: '服务凭证或受信任身份无效，请联系管理员。',
  NOT_FOUND: '合同不存在或当前身份无权访问。',
  CONFLICT: '合同已发生变化，请刷新后重新核对。',
  VALIDATION_FAILED: '字段依据或确认条件不满足，请核对合同原文。',
  SERVICE_UNAVAILABLE: '合同服务暂时不可用，请稍后重试。',
  SERVICE_TIMEOUT: '合同服务请求超时；请使用原请求标识重试或刷新确认结果。',
  INVALID_RESPONSE: '合同服务返回了无法识别的数据。',
  INVALID_CONFIG: '合同服务配置无效，请联系管理员。'
}
export class ContractReviewError extends Error {
  constructor(readonly code: string) { super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.SERVICE_UNAVAILABLE) }
}
export function publicError(error: unknown): { code: string; message: string } {
  if (error instanceof ContractReviewError) return { code: error.code, message: error.message }
  if (error instanceof z.ZodError) return { code: 'INVALID_INPUT', message: ERROR_MESSAGES.INVALID_INPUT }
  return { code: 'SERVICE_UNAVAILABLE', message: ERROR_MESSAGES.SERVICE_UNAVAILABLE }
}
