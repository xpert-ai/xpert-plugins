import { z } from 'zod/v3'
import { CASE_STATUSES, MAX_SUGGESTIONS } from './case.js'
import { categoryIdSchema } from './evaluation.js'

export { ANALYSIS_STALE_MS, CASE_STATUSES, FAILURE_CODES, MAX_SUGGESTIONS } from './case.js'
export type { CaseDetail, CaseStatus, CaseSummary, CategorySuggestion, FailureCode } from './case.js'

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

export const caseIdSchema = z.string().uuid().describe('Id of an intake case, as shown by the workbench.')
export const revisionSchema = z.number().int().min(1).describe('Case revision returned by photo_intake_analyze_case.')

export const createCaseSchema = z.object({
  /** Client-generated key; repeating a request with the same key returns the same case. */
  requestKey: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  referenceCategoryId: categoryIdSchema.optional(),
  photo: z.object({
    // A loose prefix check only; the service decodes and verifies the bytes.
    dataUrl: z.string().max(Math.ceil(MAX_PHOTO_BYTES * 1.4)).regex(/^data:image\/[a-z]+;base64,/)
  }).strict()
}).strict()
export type CreateCaseInput = z.infer<typeof createCaseSchema>

export const suggestionSchema = z.object({
  categoryId: z.string().min(1).max(64).describe('An id returned by photo_intake_list_categories.'),
  confidence: z.number().min(0).max(1).describe('Your confidence from 0 to 1.'),
  reason: z.string().trim().min(1).max(300).describe('What in the photo supports this category, in one or two sentences.')
}).strict()

export const submitSuggestionsSchema = z.object({
  caseId: caseIdSchema,
  revision: revisionSchema,
  suggestions: z.array(suggestionSchema).min(1).max(MAX_SUGGESTIONS)
    .describe(`One to ${MAX_SUGGESTIONS} distinct categories, most likely first.`)
}).strict()
export type SubmitSuggestionsInput = z.infer<typeof submitSuggestionsSchema>

export const viewQueryParametersSchema = z.object({ caseId: z.string().uuid().optional() }).strict()

export type IntakeErrorCode =
  | 'not_found'
  | 'invalid_input'
  | 'unsupported_host'
  | 'invalid_photo'
  | 'photo_missing'
  | 'unknown_category'
  | 'invalid_state'
  | 'conflict'

export class IntakeError extends Error {
  constructor(readonly code: IntakeErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'IntakeError'
  }
}
