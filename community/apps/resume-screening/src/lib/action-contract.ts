import type { XpertViewActionResult } from '@xpert-ai/contracts'

export const RESUME_REVISION_CONFLICT = 'revision_conflict'
export const RESUME_CRITERIA_LOCKED = 'criteria_locked'

/** Shared by the view provider and iframe; display text never determines the error category. */
export interface ResumeActionFailure {
  kind: 'business'
  code: typeof RESUME_REVISION_CONFLICT | typeof RESUME_CRITERIA_LOCKED
}

export interface ResumeViewActionResult extends XpertViewActionResult {
  failure?: ResumeActionFailure
}
