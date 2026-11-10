/** fold：事件溯源；retract 只改状态（OA4 墓碑），不物理删除。 */
import type { Assertion, FoldResult, Op } from './types.js'

export function foldOps(base: Array<Assertion> | Map<string, Assertion>, ops: Op[]): FoldResult {
  const table = new Map<string, Assertion>()
  const src = base instanceof Map ? base.values() : base
  for (const a of src) table.set(a.id, { ...a })
  const resolutions: Array<Record<string, unknown>> = []
  const tombstones: string[] = []
  for (const op of ops) {
    const kind = (op as { op: string }).op
    if (kind === 'assert') {
      const a = (op as { assertion: Assertion }).assertion
      table.set(a.id, { ...a })
    } else if (kind === 'retract') {
      const o = op as { target: string; reason?: string }
      const cur = table.get(o.target)
      if (cur) {
        table.set(o.target, { ...cur, status: 'retracted', retract_reason: o.reason ?? '' })
        tombstones.push(o.target)
      }
    } else if (kind === 'restrict') {
      const o = op as { target: string; patch: Partial<Assertion> }
      const cur = table.get(o.target)
      if (cur) table.set(o.target, { ...cur, ...o.patch })
    } else if (kind === 'alias' || kind === 'map' || kind === 'merge_node' || kind === 'split_node') {
      resolutions.push({ op: kind, payload: op, applied: true })
    } else {
      resolutions.push({ op: kind, applied: false, reason: 'unknown_op' })
    }
  }
  return { table, resolutions, tombstones }
}
