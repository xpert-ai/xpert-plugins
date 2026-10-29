import { z } from 'zod/v3'

export const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const idSchema = z.string().min(1).max(64)
export const requestIdSchema = z.string().min(8).max(64)

// Trusted identity is injected only by the host adapter, never by view or model input.
export const scopeSchema = z.object({
  tenantId: z.string().min(1).max(128),
  organizationId: z.string().max(128),
  workspaceId: z.string().max(128),
  userId: z.string().min(1).max(128),
  xpertId: z.string().min(1).max(128)
}).strict()
export type WorkspaceScope = z.infer<typeof scopeSchema>

export const prioritySchema = z.enum(['P0', 'P1', 'P2', 'P3'])
export const caseStatusSchema = z.enum(['draft', 'confirmed'])

export const requirementSchema = z.object({
  id: idSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  module: z.string().max(100).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()
export type Requirement = z.infer<typeof requirementSchema>

export const testCaseSchema = z.object({
  id: idSchema,
  requirementId: idSchema,
  title: z.string().min(1).max(200),
  precondition: z.string().max(2000).default(''),
  steps: z.array(z.string().min(1).max(2000)).min(1).max(50),
  expected: z.string().min(1).max(2000),
  priority: prioritySchema,
  status: caseStatusSchema,
  // requestId ties a batch of AI-generated drafts to one generation attempt so a
  // retry can be made idempotent and the source of each case stays auditable.
  requestId: requestIdSchema,
  createdAt: z.string(),
  updatedAt: z.string()
}).strict()
export type TestCase = z.infer<typeof testCaseSchema>

export const priorityValues = prioritySchema.options
export const priorities = priorityValues

export const saveRequirementSchema = z.object({
  expectedRevision: revisionSchema,
  requirement: requirementSchema.omit({ createdAt: true, updatedAt: true }).partial({ id: true })
    .extend({ id: z.string().min(1).max(64).optional() })
}).strict()
export type SaveRequirementInput = z.infer<typeof saveRequirementSchema>

// Draft cases produced by the model for one requirement. The caller supplies a stable
// requestId; re-sending the same requestId after a failure must not duplicate rows.
export const persistDraftSchema = z.object({
  requirementId: idSchema,
  requestId: requestIdSchema,
  cases: z.array(testCaseSchema.omit({
    id: true, requirementId: true, status: true, requestId: true, createdAt: true, updatedAt: true
  })).min(1).max(100)
}).strict()
export type PersistDraftInput = z.infer<typeof persistDraftSchema>

export const confirmCasesSchema = z.object({
  expectedRevision: revisionSchema,
  caseIds: z.array(idSchema).min(1).max(200)
}).strict()
export type ConfirmCasesInput = z.infer<typeof confirmCasesSchema>

export const discardCasesSchema = z.object({
  expectedRevision: revisionSchema,
  caseIds: z.array(idSchema).min(1).max(200)
}).strict()
export type DiscardCasesInput = z.infer<typeof discardCasesSchema>

export const workbenchStateSchema = z.object({
  revision: revisionSchema,
  requirements: z.array(requirementSchema),
  cases: z.array(testCaseSchema)
}).strict()
export type WorkbenchState = z.infer<typeof workbenchStateSchema>

export type DomainErrorCode =
  | 'not_found'
  | 'conflict'
  | 'invalid_input'
  | 'empty_state'
  | 'capability_denied'

export class TestCaseError extends Error {
  constructor(readonly code: DomainErrorCode, readonly detail?: string) {
    super(code)
    this.name = 'TestCaseError'
  }
}
