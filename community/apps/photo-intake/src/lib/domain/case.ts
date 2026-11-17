// Shared by the server and the browser view, so it must stay free of server-only imports.

/**
 * draft      case created with a photo, no analysis requested yet
 * analyzing  one model call for this revision is in flight
 * suggested  the Assistant saved a category suggestion; a person has to decide
 * confirmed  a person accepted or corrected the category
 * failed     the analysis failed; it can be retried, or a person can decide without it
 */
export const CASE_STATUSES = ['draft', 'analyzing', 'suggested', 'confirmed', 'failed'] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

/** Machine-readable reasons a photo classification call did not produce a usable result. */
export const FAILURE_CODES = [
  'model_unavailable', 'model_call_failed', 'timeout', 'invalid_output', 'photo_missing', 'interrupted'
] as const
export type FailureCode = (typeof FAILURE_CODES)[number]

/** Host client command the view uses to ask the Assistant, in chat, to act on a case or an acceptance run. */
export const ASK_ASSISTANT_COMMAND = 'assistant.chat.send_message'

/** An `analyzing` case older than this is treated as abandoned and may be analysed again. */
export const ANALYSIS_STALE_MS = 3 * 60 * 1000
