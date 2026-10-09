import type {
  AiDraft,
  ConfirmedSnapshot,
  EditableDraft
} from './contracts.js'

export type ReviewAuditField =
  | 'title'
  | 'description'
  | 'evidence'
  | 'acceptance'
  | 'openQuestions'
  | 'included'

export type ReviewAudit = {
  aiRequirementCount: number
  savedRequirementCount: number
  humanChanges: Array<{
    requirementNumber: number
    title: string
    fields: ReviewAuditField[]
  }>
  confirmation: {
    confirmedAt: string
    sourceVersion: number
    includedCount: number
    excludedCount: number
  } | null
}

function changed(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right)
}

export function buildReviewAudit(
  aiDraft: AiDraft | null,
  editableDraft: EditableDraft | null,
  confirmedSnapshot: ConfirmedSnapshot | null
): ReviewAudit | null {
  if (!aiDraft || !editableDraft) return null
  const humanChanges = editableDraft.requirements.flatMap((item, index) => {
    const original = aiDraft.requirements[index]
    const fields: ReviewAuditField[] = []
    if (!original) {
      fields.push(
        'title',
        'description',
        'evidence',
        'acceptance',
        'openQuestions'
      )
    } else {
      if (item.title !== original.title) fields.push('title')
      if (item.description !== original.description) fields.push('description')
      if (changed(item.evidence, original.evidence)) fields.push('evidence')
      if (changed(item.acceptance, original.acceptance))
        fields.push('acceptance')
      if (changed(item.openQuestions, original.openQuestions))
        fields.push('openQuestions')
    }
    if (!item.included) fields.push('included')
    return fields.length
      ? [
          {
            requirementNumber: index + 1,
            title: item.title,
            fields
          }
        ]
      : []
  })
  const includedCount = confirmedSnapshot?.draft.requirements.length ?? 0
  return {
    aiRequirementCount: aiDraft.requirements.length,
    savedRequirementCount: editableDraft.requirements.length,
    humanChanges,
    confirmation: confirmedSnapshot
      ? {
          confirmedAt: confirmedSnapshot.confirmedAt,
          sourceVersion: confirmedSnapshot.sourceVersion,
          includedCount,
          excludedCount: Math.max(
            0,
            editableDraft.requirements.length - includedCount
          )
        }
      : null
  }
}
