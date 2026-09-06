import { createHash } from 'node:crypto'
import type { GovernanceCase } from './contracts.js'

/** Object key order is not evidence: JSONB may reorder keys during persistence. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, record[key]]),
      )
    }
    return item
  })
}

/** Hash the released input; preserve array order and every evidence value. */
export function sourceSnapshotHash(
  source: Pick<GovernanceCase, 'materials' | 'evidence' | 'drawings'>,
): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        materials: source.materials,
        evidence: source.evidence,
        drawings: source.drawings,
      }),
    )
    .digest('hex')
}
