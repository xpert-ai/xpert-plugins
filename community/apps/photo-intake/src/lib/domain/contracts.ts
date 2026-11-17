import { z } from 'zod/v3'
import { CASE_STATUSES, FAILURE_CODES } from './case.js'
import { categoryIdSchema, classificationSchema, promptSourceSchema } from './evaluation.js'

export { ANALYSIS_STALE_MS, CASE_STATUSES, FAILURE_CODES } from './case.js'
export type { CaseStatus, FailureCode } from './case.js'

// Trusted identity comes only from the host adapter, never from view or model input.
export const scopeSchema = z.object({
  tenantId: z.string().min(1).max(128),
  organizationId: z.string().max(128),
  workspaceId: z.string().max(128),
  userId: z.string().min(1).max(128),
  xpertId: z.string().min(1).max(128)
}).strict()
export type IntakeScope = z.infer<typeof scopeSchema>

export const caseStatusSchema = z.enum(CASE_STATUSES)

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number]
/** Upper bound for the decoded photo. The view downsizes before upload, so this is a guard. */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024

export const createCaseSchema = z.object({
  /** Client-generated key; repeating a request with the same key returns the same case. */
  requestKey: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  photo: z.object({
    // A loose prefix check only; the service decodes and verifies the bytes.
    dataUrl: z.string().max(Math.ceil(MAX_PHOTO_BYTES * 1.4)).regex(/^data:image\/[a-z]+;base64,/)
  }).strict()
}).strict()
export type CreateCaseInput = z.infer<typeof createCaseSchema>

export const caseIdSchema = z.object({
  caseId: z.string().uuid().describe('Id of an intake case, as shown by the workbench or the list tool.')
}).strict()

/** A person's decision. The revision makes sure they decided on the state they were looking at. */
export const confirmCaseSchema = z.object({
  caseId: z.string().uuid(), revision: z.number().int().positive(), categoryId: categoryIdSchema
}).strict()
export type ConfirmCaseInput = z.infer<typeof confirmCaseSchema>

/** What the Assistant's analysis left on a case, with the model and prompt that produced it. */
export const caseSuggestionSchema = classificationSchema.extend({
  model: z.string(), promptSource: promptSourceSchema
}).strict()
export type CaseSuggestion = z.infer<typeof caseSuggestionSchema>

export const caseSummarySchema = z.object({
  id: z.string().uuid(), title: z.string(), status: caseStatusSchema, revision: z.number(),
  /** True when an analysis may start (or restart) now. */
  canAnalyze: z.boolean(),
  /** True when a person may record the category now. */
  canConfirm: z.boolean(),
  suggestedCategoryId: z.string().nullable(), confirmedCategoryId: z.string().nullable(),
  failureCode: z.enum(FAILURE_CODES).nullable(), createdAt: z.string(), updatedAt: z.string()
})
export type CaseSummary = z.infer<typeof caseSummarySchema>

export const caseDetailSchema = caseSummarySchema.extend({
  /** `data:` URL of the stored photo, or null when the photo row is missing. */
  photoDataUrl: z.string().startsWith('data:image/').nullable(),
  suggestion: caseSuggestionSchema.nullable()
})
export type CaseDetail = z.infer<typeof caseDetailSchema>

export type IntakeErrorCode =
  | 'not_found'
  | 'invalid_input'
  | 'unsupported_host'
  | 'invalid_photo'
  | 'photo_missing'
  | 'invalid_state'
  | 'conflict'

export class IntakeError extends Error {
  constructor(readonly code: IntakeErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'IntakeError'
  }
}
