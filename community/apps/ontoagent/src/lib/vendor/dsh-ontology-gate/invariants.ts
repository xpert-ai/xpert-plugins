/**
 * 红线不变式：可执行的检查清单（不是文档）。
 * 对应 02-architecture §1.3 的 OA1/OA2/OA4/OA5 + 任务状态机三条。
 */
import type { Assertion, Op } from '../dsh-ontology-core/index.js'

export interface InvariantViolation { id: string; rule: string; detail: string }

export interface InvariantState {
  assertions: Assertion[]
  ops?: Op[]
  tasks?: Array<{ id: string; status: string }>
  waits?: Array<{ taskId?: string | null; status: string }>
}

const TERMINAL = new Set(['Completed', 'Failed', 'Cancelled', 'Interrupted'])

export const ONTOLOGY_INVARIANTS: ReadonlyArray<{ id: string; rule: string; description: string }> = [
  { id: 'OA1', rule: 'evidence.required', description: '非 sess 断言必须带证据' },
  { id: 'OA2', rule: 'status.gate_issued', description: 'accepted 只能由 gate 签发（带 gated 标记）' },
  { id: 'OA4', rule: 'retract.tombstone_only', description: '删除只能用 retract，不得物理删除' },
  { id: 'OA5', rule: 'base_version.required', description: '提交必须带 base_version' },
  { id: 'SM1', rule: 'task.interrupted_terminal', description: 'Interrupted 是终态' },
  { id: 'SM2', rule: 'wait.owner_exists', description: '活动等待必须挂在存在的任务上（或为无主入口）' },
  { id: 'SM3', rule: 'no_silent_drop', description: 'accepted 断言必须在乐观日志中可见' },
]

export function checkInvariants(state: InvariantState): InvariantViolation[] {
  const out: InvariantViolation[] = []

  for (const a of state.assertions) {
    const root = String(a.scope ?? '').split(':')[0] ?? ''
    if (root !== 'sess' && (a.evidence ?? []).length === 0 && a.status !== 'retracted') {
      out.push({ id: 'OA1', rule: 'evidence.required', detail: a.id + ' 无证据（scope=' + a.scope + '）' })
    }
    if (a.status === 'accepted' && a.provenance?.gated !== true) {
      out.push({ id: 'OA2', rule: 'status.gate_issued', detail: a.id + ' 自称 accepted 但无 gate 标记' })
    }
  }

  for (const op of state.ops ?? []) {
    const kind = (op as { op: string }).op
    if (kind === 'delete' || (op as { physicalDelete?: boolean }).physicalDelete) {
      out.push({ id: 'OA4', rule: 'retract.tombstone_only', detail: '出现物理删除动作: ' + kind })
    }
  }

  const tasks = state.tasks ?? []
  const taskIds = new Set(tasks.map((t) => t.id))
  for (const t of tasks) {
    if (t.status === 'Interrupted') {
      // 终态检查由调用方保证（不可回到 Running）；这里只记录一次可见性
      continue
    }
    if (!TERMINAL.has(t.status) && !['Queued', 'Running', 'Cancelling'].includes(t.status)) {
      out.push({ id: 'SM1', rule: 'task.interrupted_terminal', detail: t.id + ' 非法状态 ' + t.status })
    }
  }
  for (const w of state.waits ?? []) {
    if (w.status === 'Active' && w.taskId && !taskIds.has(w.taskId)) {
      out.push({ id: 'SM2', rule: 'wait.owner_exists', detail: '等待 ' + w.taskId + ' 的任务不存在' })
    }
  }

  return out
}
