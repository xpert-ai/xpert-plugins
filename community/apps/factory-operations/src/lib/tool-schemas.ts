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
const factoryCaseStatusSchema = z.enum([
  'investigating',
  'planning',
  'awaiting_approval',
  'approved',
  'executing',
  'verifying',
  'recovered',
  'escalated',
  'rejected'
])
const progressSchema = z
  .object({
    completedSteps: z.number().int().nonnegative(),
    totalSteps: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100)
  })
  .strict()

export const getFactoryCaseSchema = z
  .object({
    caseId,
    expectedRevision: z.number().int().positive().optional()
  })
  .strict()

export const searchFactoryCasesSchema = z
  .object({
    search: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe('Optional case key or device ID substring to match.')
      .optional(),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(50).default(20)
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

export const factoryMutationReceiptSchema = z
  .object({
    success: z.literal(true),
    duplicate: z.boolean(),
    operationId: z.string(),
    caseId: z.string().uuid(),
    previousRevision: z.number().int().positive().nullable(),
    revision: z.number().int().positive(),
    status: factoryCaseStatusSchema,
    changedArtifact: z.string(),
    rebasedFromRevision: z.number().int().positive().nullable(),
    nextAction: z.string()
  })
  .strict()

const caseSearchItemSchema = z
  .object({
    caseId: z.string().uuid(),
    caseKey: z.string(),
    title: z.string(),
    revision: z.number().int().positive(),
    status: factoryCaseStatusSchema,
    currentStage: z.string(),
    device: z
      .object({ id: z.string(), name: z.string(), lineId: z.string() })
      .strict(),
    severity: z.enum(['medium', 'high', 'critical']),
    occurredAt: z.string().datetime(),
    progress: progressSchema,
    nextAction: z.string()
  })
  .strict()

export const searchFactoryCasesResultSchema = z
  .object({
    items: z.array(caseSearchItemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    hasMore: z.boolean()
  })
  .strict()

export const factoryCaseSummaryResultSchema = z
  .object({
    id: z.string().uuid(),
    caseKey: z.string(),
    title: z.string(),
    templateKey: z.literal('factory_anomaly_recovery'),
    templateVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    revision: z.number().int().positive(),
    status: factoryCaseStatusSchema,
    currentStage: z.string(),
    workspace: z
      .object({
        projectId: z.string(),
        status: z.enum(['provisioning', 'ready', 'failed']),
        canLaunchTasks: z.boolean(),
        errorCode: z.string().nullable()
      })
      .strict(),
    event: z.record(z.unknown()),
    analysisFacts: z.record(z.unknown()),
    triage: z.record(z.unknown()).nullable(),
    findings: z
      .object({
        equipment: z.record(z.unknown()).nullable(),
        quality: z.record(z.unknown()).nullable(),
        production: z.record(z.unknown()).nullable(),
        resources: z.record(z.unknown()).nullable()
      })
      .strict(),
    plan: z.record(z.unknown()).nullable(),
    execution: z.record(z.unknown()).nullable(),
    verification: z.record(z.unknown()).nullable(),
    timeline: z.array(z.record(z.unknown())),
    metrics: z
      .object({
        responseSeconds: z.number().nullable(),
        recoveryMinutes: z.number().nullable(),
        avoidedDowntimeMinutes: z.number(),
        avoidedLossCny: z.number()
      })
      .strict(),
    progress: progressSchema,
    nextAction: z.string(),
    allowedActions: z.array(z.string())
  })
  .strict()

export const factoryCaseProgressResultSchema = z
  .object({
    caseId: z.string().uuid(),
    revision: z.number().int().positive(),
    status: factoryCaseStatusSchema,
    currentStage: z.string(),
    progress: progressSchema,
    nextAction: z.string()
  })
  .strict()

export const factoryOperationsDashboardResultSchema = z
  .object({
    summary: z
      .object({
        totalCases: z.number().int().nonnegative(),
        activeCases: z.number().int().nonnegative(),
        criticalCases: z.number().int().nonnegative(),
        awaitingApproval: z.number().int().nonnegative(),
        recoveredCases: z.number().int().nonnegative(),
        failedExecutions: z.number().int().nonnegative(),
        averageResponseSeconds: z.number().nullable(),
        averageRecoveryMinutes: z.number().nullable(),
        avoidedDowntimeMinutes: z.number(),
        avoidedLossCny: z.number()
      })
      .strict(),
    pipelineHealth: z.array(
      z
        .object({
          laneKey: z.string(),
          laneTitle: z.string(),
          ready: z.number().int().nonnegative(),
          active: z.number().int().nonnegative(),
          blocked: z.number().int().nonnegative(),
          completed: z.number().int().nonnegative()
        })
        .strict()
    ),
    simulation: z.boolean(),
    refreshedAt: z.string().datetime()
  })
  .strict()

export const factoryExecutionStatusResultSchema = z
  .object({
    caseId: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.enum(['not_started', 'completed', 'partial_failure']),
    actionCount: z.number().int().nonnegative(),
    confirmedCount: z.number().int().nonnegative(),
    failedActionKeys: z.array(z.string()),
    nextAction: z.string()
  })
  .strict()

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
export type SearchFactoryCasesInput = z.infer<typeof searchFactoryCasesSchema>
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
