import { z } from 'zod/v3'

export type ListingScope = {
  tenantId: string
  organizationId?: string | null
  userId?: string | null
  xpertId?: string | null
}

export type ListingTaskStatus = 'draft' | 'parsing' | 'review' | 'saved' | 'failed'

export type ListingFieldFlag = 'ai' | 'missing' | 'uncertain'

export type ListingFieldFlags = Record<string, ListingFieldFlag>

export type ListingSpecInput = {
  name: string
  price?: string | null
  stock?: number | null
}

export type ListingDraftInput = {
  title?: string | null
  description?: string | null
  price?: string | null
  currency?: string | null
  category?: string | null
  attributes?: Record<string, string | number | null> | null
  specs?: ListingSpecInput[] | null
}

export const listingSpecSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.union([z.string().max(40), z.number()]).nullish().transform((value) => (value === null || value === undefined ? null : String(value))),
  stock: z.union([z.number().int().min(0), z.string().regex(/^\d+$/)]).nullish().transform((value) => (value === null || value === undefined ? null : Number(value)))
})

export const listingExtractionSchema = z.object({
  title: z.string().max(200).nullish(),
  description: z.string().max(20000).nullish(),
  price: z.union([z.string().max(40), z.number()]).nullish().transform((value) => (value === null || value === undefined ? null : String(value))),
  currency: z.string().max(10).nullish(),
  category: z.string().max(120).nullish(),
  attributes: z.record(z.union([z.string().max(500), z.number(), z.null()])).nullish(),
  specs: z.array(listingSpecSchema).max(50).nullish(),
  missingFields: z.array(z.enum(['title', 'description', 'price', 'category', 'specs'])).max(10).nullish(),
  uncertainFields: z.array(z.enum(['title', 'description', 'price', 'category', 'specs'])).max(10).nullish()
})

export type ListingExtraction = z.infer<typeof listingExtractionSchema>

export type ListingTaskSummary = {
  id: string
  status: ListingTaskStatus
  title: string | null
  price: string | null
  sourcePreview: string
  attemptCount: number
  lastErrorMessage: string | null
  parsedAt: string | null
  savedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type ListingTaskDetail = {
  id: string
  status: ListingTaskStatus
  sourceText: string
  attemptCount: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  parsedAt: string | null
  savedAt: string | null
  draft: {
    title: string | null
    description: string | null
    price: string | null
    currency: string | null
    category: string | null
    attributes: Record<string, string | number | null> | null
    fieldFlags: ListingFieldFlags | null
    specs: ListingSpecInput[]
  } | null
  runs: Array<{
    attempt: number
    status: 'running' | 'succeeded' | 'failed'
    errorCode: string | null
    errorMessage: string | null
    startedAt: string | null
    finishedAt: string | null
  }>
}

/**
 * Language-neutral error codes. The workbench maps them to localized copy so
 * backend messages never become part of the UI contract.
 */
export type ListingErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_JSON'
  | 'AI_INVALID_OUTPUT'
  | 'AI_CALL_FAILED'
  | 'AI_SIMULATED_FAILURE'
  | 'AI_RUN_INTERRUPTED'
  | 'BUSY_PARSING'
  | 'TASK_NOT_FOUND'
  | 'SOURCE_REQUIRED'
  | 'SOURCE_TOO_LONG'
  | 'DRAFT_REQUIRED'
  | 'BATCH_TOO_LARGE'
  | 'UNKNOWN'

export class ListingError extends Error {
  constructor(
    public readonly code: ListingErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'ListingError'
  }
}

export class ListingAiError extends ListingError {
  constructor(code: ListingErrorCode, message?: string) {
    super(code, message)
    this.name = 'ListingAiError'
  }
}
