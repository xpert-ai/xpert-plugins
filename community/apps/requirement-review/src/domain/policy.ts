import { randomUUID } from 'node:crypto'
import type { AiDraft, EditableDraft } from './contracts.js'
import { hasValidEvidence, type SourceSegment } from './source.js'

export type ReviewErrorCode =
  | 'organization_required'
  | 'not_found'
  | 'version_conflict'
  | 'invalid_state'
  | 'invalid_input'
  | 'invalid_output'
  | 'invalid_evidence'
  | 'draft_ids_changed'
  | 'confirmation_blocked'
  | 'attempt_expired'
  | 'attempt_not_active'
  | 'model_failed'
  | 'dispatch_failed'

export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode) {
    super(code)
  }
}

export function validateEvidence(
  draft: AiDraft | EditableDraft,
  source: SourceSegment[]
): boolean {
  return draft.requirements.every((item) =>
    item.evidence.every((evidence) =>
      hasValidEvidence(source, evidence.segmentId, evidence.quote)
    )
  )
}

export function makeEditable(draft: AiDraft): EditableDraft {
  return {
    requirements: draft.requirements.map((item) => ({
      ...structuredClone(item),
      id: randomUUID(),
      included: true
    }))
  }
}

export function checkDraftIdentity(
  before: EditableDraft,
  after: EditableDraft
): void {
  const expected = new Set(before.requirements.map((item) => item.id))
  const actual = new Set(after.requirements.map((item) => item.id))
  if (
    actual.size !== after.requirements.length ||
    expected.size !== actual.size ||
    [...actual].some((id) => !expected.has(id))
  )
    throw new ReviewError('draft_ids_changed')
}

export function confirmationProblems(
  draft: EditableDraft
): Array<{ id: string; reason: 'questions' | 'acceptance' | 'empty' }> {
  const included = draft.requirements.filter((item) => item.included)
  if (!included.length) return [{ id: '', reason: 'empty' }]
  return included.flatMap((item) => [
    ...(item.openQuestions.length
      ? [{ id: item.id, reason: 'questions' as const }]
      : []),
    ...(!item.acceptance.length
      ? [{ id: item.id, reason: 'acceptance' as const }]
      : [])
  ])
}
