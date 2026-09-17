import { targetSchema } from '../lib/types.js'
import type { SavedRecord, Target } from './model.js'

export function snapshotTarget(record: SavedRecord | undefined): Target | null {
  if (record?.kind !== 'snapshot') return null
  const result = targetSchema.safeParse((record.summary ?? record.payload)?.target)
  if (!result.success) return null
  const { sessionId: _sessionId, ...target } = result.data
  return target
}

export function canCompareSnapshots(before: SavedRecord | undefined, after: SavedRecord | undefined) {
  const a = snapshotTarget(before), b = snapshotTarget(after)
  return Boolean(a && b && before!.id !== after!.id && a.dataSourceId === b.dataSourceId &&
    (a.database ?? '') === (b.database ?? '') && (a.schema ?? '') === (b.schema ?? '') &&
    (a.engineCatalog ?? '') === (b.engineCatalog ?? ''))
}
