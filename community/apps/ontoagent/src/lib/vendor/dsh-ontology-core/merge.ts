/**
 * 三方合并（八格矩阵，02-architecture §2.5）。
 * 裁定序 authority_rank > confidence；同级同分 → disputed（需人裁）。
 * OA6：Resolution 保留败者负载。
 */
import { activeByKey, asrtValue, compareAuthority, keyParts, unionEvidence } from './keys.js'
import type { Assertion, Evidence, MergeResult, Resolution } from './types.js'

export const CONFLICT_RULE = 'authority_rank>confidence'

function decide(x: Assertion, y: Assertion): { winner: Assertion; disputed: boolean } {
  const cmp = compareAuthority(x, y)
  if (cmp > 0) return { winner: x, disputed: false }
  if (cmp < 0) return { winner: y, disputed: false }
  return { winner: x, disputed: true }
}

function makeResolution(key: string, cands: Assertion[], winner: Assertion, disputed: boolean): Resolution {
  const losers = cands.filter((c) => c.id !== winner.id).map((c) => ({
    id: c.id, o: c.o, evidence: (c.evidence ?? []) as Evidence[], authority: c.authority,
  }))
  return {
    key: keyParts(key), candidates: cands.map((c) => c.id), winner: winner.id,
    rule: CONFLICT_RULE, disputed, humanRequired: disputed, losers,
  }
}

export function threeWayMerge(
  base: Assertion[], mine: Assertion[], theirs: Assertion[],
): MergeResult {
  const b = activeByKey(base).index
  const m = activeByKey(mine).index
  const t = activeByKey(theirs).index
  const keys = [...new Set([...b.keys(), ...m.keys(), ...t.keys()])].sort()
  const merged = new Map<string, Assertion>()
  const conflicts: Resolution[] = []
  const resolutions: Array<Record<string, unknown>> = []

  for (const k of keys) {
    const ba = b.get(k)
    const ma = m.get(k)
    const ta = t.get(k)

    if (!ba) {
      if (ma && ta) {
        if (asrtValue(ma) === asrtValue(ta)) {
          merged.set(k, unionEvidence(ma, ta))
        } else {
          const d = decide(ma, ta)
          merged.set(k, d.winner)
          conflicts.push(makeResolution(k, [ma, ta], d.winner, d.disputed))
        }
      } else if (ma) {
        merged.set(k, ma)
      } else if (ta) {
        merged.set(k, ta)
      }
      continue
    }

    const bv = asrtValue(ba)
    const mChanged = !ma || asrtValue(ma) !== bv
    const tChanged = !ta || asrtValue(ta) !== bv

    if (!mChanged && !tChanged) {
      merged.set(k, ba)
      continue
    }
    if (mChanged && !tChanged) {
      if (ma) merged.set(k, ma)
      resolutions.push({ key: keyParts(k), took: 'mine', deleted: !ma })
      continue
    }
    if (tChanged && !mChanged) {
      if (ta) merged.set(k, ta)
      resolutions.push({ key: keyParts(k), took: 'theirs', deleted: !ta })
      continue
    }
    if (!ma && !ta) {
      resolutions.push({ key: keyParts(k), took: 'none', deleted: true })
      continue
    }
    if (!ma || !ta) {
      const keep = (ta ?? ma) as Assertion
      merged.set(k, keep)
      conflicts.push(makeResolution(k, [ma, ta].filter(Boolean) as Assertion[], keep, true))
      continue
    }
    if (asrtValue(ma) === asrtValue(ta)) {
      merged.set(k, unionEvidence(ma, ta))
      continue
    }
    const d = decide(ma, ta)
    merged.set(k, d.winner)
    conflicts.push(makeResolution(k, [ma, ta], d.winner, d.disputed))
  }

  return { merged, conflicts, resolutions }
}
