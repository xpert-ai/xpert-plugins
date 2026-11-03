import { reportKeys } from './report'
import type { IntakeRecord, Report } from './contracts'

/** A single known AI commit can be merged with unsaved local edits field by field. */
export function mergeLocalDraft(base: IntakeRecord, incoming: IntakeRecord, local: Report, localAnswersChanged = false) {
  if (incoming.id !== base.id || incoming.revision < base.revision) return { kind: 'ignore' as const }
  if (incoming.revision === base.revision) return { kind: 'metadata' as const }
  // Keep the original question + unsaved answer visible if another page starts analysis.
  if (localAnswersChanged) return { kind: 'conflict' as const }
  const sameAnalysisCommit = incoming.revision === base.revision + 1 &&
    incoming.aiResult?.attemptId === base.analysis?.id && incoming.aiResult?.sourceRevision === base.revision &&
    incoming.analysis?.status === 'succeeded'
  if (!sameAnalysisCommit) return { kind: 'conflict' as const }
  const report = { ...incoming.report }
  for (const key of reportKeys) if (local[key] !== base.report[key]) report[key] = local[key]
  return { kind: 'merged' as const, report }
}
