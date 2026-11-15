import type { AnalysisEvidenceSnapshot } from '@xpert-ai/contracts'
import { canonicalEvidenceJson } from '@xpert-ai/plugin-sdk/analytics'

/** Positional comparison, not entity matching. Only compare snapshots already
 * authorized and held by the caller; this does not authorize historical rows. */
export function compareEvidence(before: AnalysisEvidenceSnapshot, after: AnalysisEvidenceSnapshot) {
  const left = new Map(before.datasets.map(value => [value.datasetId, value]))
  const right = new Map(after.datasets.map(value => [value.datasetId, value]))
  const changes: Array<{ datasetId: string; row: number; field: string; before: string; after: string }> = []
  let changedCells = 0, changedDatasets = 0
  const display = (value: unknown) => value === undefined ? '—' : String(value).slice(0, 300)
  for (const datasetId of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(datasetId), b = right.get(datasetId)
    if (!a || !b || canonicalEvidenceJson(a.fields) !== canonicalEvidenceJson(b.fields) ||
      canonicalEvidenceJson(a.completeness) !== canonicalEvidenceJson(b.completeness)) changedDatasets++
    for (let row = 0; row < Math.max(a?.rows.length ?? 0, b?.rows.length ?? 0); row++) {
      const av = a?.rows[row] ?? {}, bv = b?.rows[row] ?? {}
      for (const field of new Set([...Object.keys(av), ...Object.keys(bv)])) {
        if (Object.is(av[field], bv[field])) continue
        changedCells++
        if (changes.length < 50) changes.push({ datasetId, row, field, before: display(av[field]), after: display(bv[field]) })
      }
    }
  }
  return { previousId: before.id, currentId: after.id, changedCells, changedDatasets, changes, truncated: changedCells > changes.length }
}
