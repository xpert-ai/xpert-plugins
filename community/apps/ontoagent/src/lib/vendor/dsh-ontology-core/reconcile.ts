/**
 * 写入期冲突检测：单写者 append-only 场景没有三方合并，但有「同键异议」。
 * 规则：同键 (s,p,q) 且值不同 → 按权威序裁定；被既有断言压过即冲突（同级为 disputed）。
 * 产出 OA6 完整的 Resolution（含败者负载）。
 */
import { activeByKey, asrtKey, asrtValue, compareAuthority, keyParts } from './keys.js'
import type { AcceptedAssertion, Assertion, Evidence, Resolution } from './types.js'

export interface ReconcileResult {
  writable: AcceptedAssertion[]
  conflicts: Resolution[]
}

const losersOf = (xs: Assertion[], winnerId: string) =>
  xs.filter((x) => x.id !== winnerId).map((x) => ({
    id: x.id, o: x.o, evidence: (x.evidence ?? []) as Evidence[], authority: x.authority,
  }))

export function reconcileWrites(known: Assertion[], incoming: AcceptedAssertion[]): ReconcileResult {
  const existing = activeByKey(known).index
  const writable: AcceptedAssertion[] = []
  const conflicts: Resolution[] = []

  for (const a of incoming) {
    const k = asrtKey(a)
    const cur = existing.get(k)
    if (!cur || asrtValue(cur) === asrtValue(a)) { writable.push(a); continue }

    const cmp = compareAuthority(a, cur)
    if (cmp > 0) {
      writable.push(a)
      conflicts.push({
        key: keyParts(k), candidates: [cur.id, a.id], winner: a.id,
        rule: 'authority_rank>confidence', disputed: false, humanRequired: false,
        losers: losersOf([cur, a], a.id),
      })
      continue
    }

    const disputed = cmp === 0
    conflicts.push({
      key: keyParts(k), candidates: [cur.id, a.id], winner: cur.id,
      rule: 'authority_rank>confidence', disputed, humanRequired: disputed,
      losers: losersOf([cur, a], cur.id),
    })
  }

  return { writable, conflicts }
}
