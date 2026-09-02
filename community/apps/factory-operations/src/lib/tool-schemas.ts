import { z } from 'zod'

const caseId = z.string().uuid().describe('Factory Case UUID returned by a current case read.')
const operationId = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .describe('Stable idempotency key. Reuse only for an identical retry.')
const baseRevision = z
  .number()
  .int()
  .positive()
  .describe('Exact Case revision returned by the latest read.')
const changeSummary = z
  .string()
  .trim()
  .min(4)
  .max(180)
  .describe('Concise user-visible summary of this mutation.')

export const evidenceSchema = z
  .object({
    source: z.enum(['iot', 'mes', 'qms', 'cmms', 'wms', 'aps', 'erp', 'rule']),
    reference: z.string().trim().min(3).max(160),
    observedAt: z.string().datetime(),
    summary: z.string().trim().min(3).max(320),
    value: z.number().finite().optional(),
    unit: z.string().trim().min(1).max(32).optional()
  })
  .strict()

const evidenceList = z.array(evidenceSchema).min(1).max(8)
const confidence = z.number().min(0).max(1)

export const getFactoryCaseSchema = z
  .object({
    caseId,
    expectedRevision: z.number().int().positive().optional()
  })
  .strict()

const baseMutationSchema = z.object({
  caseId,
  operationId,
  baseRevision,
  changeSummary
})

export const recordTriageSchema = baseMutationSchema
  .extend({
    severity: z.enum(['medium', 'high', 'critical']),
    summary: z.string().trim().min(12).max(500),
    confidence,
    evidence: evidenceList.min(2)
  })
  .strict()

export const recordEquipmentFindingSchema = baseMutationSchema
  .extend({
    failureMode: z.string().trim().min(4).max(160),
    remainingSafeMinutes: z.number().int().min(0).max(1440),
    recommendation: z.enum(['stop_immediately', 'controlled_shutdown', 'monitor']),
    summary: z.string().trim().min(12).max(500),
    confidence,
    evidence: evidenceList
  })
  .strict()

export const recordQualityFindingSchema = baseMutationSchema
  .extend({
    affectedQuantity: z.number().int().min(0).max(1000000),
    isolationWindowMinutes: z.number().int().min(0).max(10080),
    recommendation: z.enum(['isolate_and_reinspect', 'sample_inspection', 'release']),
    summary: z.string().trim().min(12).max(500),
    confidence,
    evidence: evidenceList
  })
  .strict()

export const recordProductionFindingSchema = baseMutationSchema
  .extend({
    impactedWorkOrderCount: z.number().int().min(0).max(10000),
    riskOrderCount: z.number().int().min(0).max(10000),
    estimatedDelayMinutes: z.number().int().min(0).max(43200),
    alternateLineId: z.string().trim().min(1).max(80).nullable(),
    changeoverMinutes: z.number().int().min(0).max(1440),
    incrementalCostCny: z.number().finite().min(0).max(100000000),
    summary: z.string().trim().min(12).max(500),
    confidence,
    evidence: evidenceList
  })
  .strict()

export const recordResourceFindingSchema = baseMutationSchema
  .extend({
    spareSku: z.string().trim().min(2).max(120),
    spareAvailability: z.enum(['available', 'unavailable']),
    spareQuantity: z.number().int().min(0).max(1000000),
    deliveryMinutes: z.number().int().min(0).max(43200),
    qualifiedEngineerAvailable: z.boolean(),
    summary: z.string().trim().min(12).max(500),
    confidence,
    evidence: evidenceList
  })
  .strict()

export const generateRecoveryPlanSchema = baseMutationSchema.strict()

export const verifyRecoverySchema = baseMutationSchema.strict()

export const createDemoIncidentSchema = z
  .object({
    operationId,
    changeSummary
  })
  .strict()

export const runSpecialistAnalysisSchema = baseMutationSchema.strict()

export const approveRecoveryPlanSchema = baseMutationSchema
  .extend({
    reason: z.string().trim().min(8).max(500)
  })
  .strict()

export const rejectRecoveryPlanSchema = approveRecoveryPlanSchema

export const executeRecoveryPlanSchema = baseMutationSchema.strict()

export type GetFactoryCaseInput = z.infer<typeof getFactoryCaseSchema>
export type RecordTriageInput = z.infer<typeof recordTriageSchema>
export type RecordEquipmentFindingInput = z.infer<typeof recordEquipmentFindingSchema>
export type RecordQualityFindingInput = z.infer<typeof recordQualityFindingSchema>
export type RecordProductionFindingInput = z.infer<typeof recordProductionFindingSchema>
export type RecordResourceFindingInput = z.infer<typeof recordResourceFindingSchema>
export type GenerateRecoveryPlanInput = z.infer<typeof generateRecoveryPlanSchema>
export type VerifyRecoveryInput = z.infer<typeof verifyRecoverySchema>
export type CreateDemoIncidentInput = z.infer<typeof createDemoIncidentSchema>
export type RunSpecialistAnalysisInput = z.infer<typeof runSpecialistAnalysisSchema>
export type ApproveRecoveryPlanInput = z.infer<typeof approveRecoveryPlanSchema>
export type RejectRecoveryPlanInput = z.infer<typeof rejectRecoveryPlanSchema>
export type ExecuteRecoveryPlanInput = z.infer<typeof executeRecoveryPlanSchema>
