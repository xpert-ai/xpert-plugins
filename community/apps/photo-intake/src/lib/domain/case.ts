// Shared by the server and the browser view, so it must stay free of server-only imports.

/**
 * draft      record created with a photo, no analysis requested yet
 * analyzing  the Assistant opened the photo and owes a suggestion for this revision
 * suggested  the Assistant saved category suggestions; a person has to decide
 * confirmed  a person accepted or corrected the category
 * failed     the analysis run failed; the case can be analysed again
 */
export const CASE_STATUSES = ['draft', 'analyzing', 'suggested', 'confirmed', 'failed'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

/** Machine-readable reasons a case ended in `failed`. */
export const FAILURE_CODES = ['model_call_failed', 'image_unavailable', 'no_suggestion'] as const
export type FailureCode = (typeof FAILURE_CODES)[number]

/** Host client command the view uses to ask the Assistant, in chat, to analyse a case. */
export const ASK_ASSISTANT_COMMAND = 'assistant.chat.send_message'

/** Up to this many ranked suggestions are kept per analysis. */
export const MAX_SUGGESTIONS = 3

/** An `analyzing` case older than this is treated as abandoned and may be analysed again. */
export const ANALYSIS_STALE_MS = 3 * 60 * 1000

export interface CategorySuggestion {
  categoryId: string
  /** 0 to 1, as estimated by the model. Not a calibrated probability. */
  confidence: number
  /** Short visual evidence for the suggestion, written by the model. */
  reason: string
}

export interface CaseSummary {
  id: string
  title: string
  status: CaseStatus
  revision: number
  /** True when the Assistant may start (or restart) an analysis now. */
  canAnalyze: boolean
  confirmedCategoryId: string | null
  referenceCategoryId: string | null
  failureCode: FailureCode | null
  createdAt: string
  updatedAt: string
}

export interface CaseDetail extends CaseSummary {
  /** `data:` URL of the stored photo, or null for cases created before photos were required. */
  photoDataUrl: string | null
  suggestions: CategorySuggestion[]
}
