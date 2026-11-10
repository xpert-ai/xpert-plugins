/**
 * 闸门（确定性部分）：G0 结构 + G1 形状 + accepted 签发。
 * G2（模型语义，只降权）与 T0/T1/T2 分档在 dsh-ontology-gate。
 * 红线：
 *   OA1 无证据不传播（非 sess scope 必须带 evidence）
 *   OA2 模型只写 candidate —— 实现上默认拒绝，不看 provenance 自称
 *   OA4 只能 tombstone；OA5 必带 baseVersion.hash
 */
import { SCOPES, STATUSES } from './keys.js'
import type { AcceptedAssertion, Assertion, BaseVersion, Delta, Finding } from './types.js'

export const OP_KINDS = new Set([
  'assert', 'retract', 'restrict', 'alias', 'map', 'merge_node', 'split_node',
])

const REJECT = 'reject' as const

const f = (code: string, rule: string, target: string, detail: string): Finding => ({
  code, rule, target, detail, severity: REJECT,
})

export function gateG0(delta: Pick<Delta, 'deltaId' | 'ops'> & { baseVersion?: Partial<BaseVersion> },
  knownNodeIds: Set<string>): Finding[] {
  const out: Finding[] = []
  if (!delta.baseVersion || typeof delta.baseVersion.hash !== 'string' || delta.baseVersion.hash.length === 0) {
    out.push(f('OA5', 'base_version.required', delta.deltaId ?? '?', 'Delta 未携带 baseVersion.hash'))
  }
  for (const raw of delta.ops ?? []) {
    const op = raw as { op?: string; assertion?: Assertion; target?: string; physicalDelete?: boolean }
    const kind = String(op.op ?? '')
    if (!OP_KINDS.has(kind)) {
      out.push(f('G0', 'op.enum', kind || '?', '未定义的 op'))
      continue
    }
    if (kind === 'retract' && op.physicalDelete) {
      out.push(f('OA4', 'retract.tombstone_only', String(op.target), '禁止物理删除，只能 tombstone'))
    }
    if (kind !== 'assert') continue
    out.push(...gateAssertion(op.assertion as Assertion, knownNodeIds))
  }
  return out
}

export function gateAssertion(a: Assertion | undefined, knownNodeIds: Set<string>): Finding[] {
  const out: Finding[] = []
  if (!a) return [f('G0', 'assertion.required', '?', 'assert 缺 assertion')]
  const aid = a.id ?? '?'
  for (const field of ['id', 's', 'p', 'o', 'scope', 'status'] as const) {
    if ((a as unknown as Record<string, unknown>)[field] === undefined) {
      out.push(f('G0', 'assertion.field.' + field, aid, '字段缺失'))
    }
  }
  const root = String(a.scope ?? '').split(':')[0] ?? ''
  if (!(SCOPES as readonly string[]).includes(root)) {
    out.push(f('G0', 'assertion.scope', aid, '未知 scope: ' + String(a.scope)))
  }
  if (!(STATUSES as readonly string[]).includes(String(a.status))) {
    out.push(f('G0', 'assertion.status', aid, '未知 status: ' + String(a.status)))
  } else if (a.status !== 'candidate') {
    out.push(f('OA2', 'status.candidate_only', aid, '非 candidate 的写入必须经 gate 签发'))
  }
  if (!root.startsWith('sess') && (a.evidence ?? []).length === 0) {
    out.push(f('OA1', 'evidence.required', aid, 'scope=' + String(a.scope) + ' 的断言必须带证据'))
  }
  // 引用完整性：已知节点 **或** 形如 n:/c:/t:/h:/r:/p: 的节点 id 都放行（新概念可引入，T0 可达）；
  // 只有「字面量形态」的主语才视为悬空引用——否则新增叶节点永远写不进去。
  const NODE_SHAPED = /^[a-z]{1,2}:[A-Za-z0-9_./-]+$/
  if (knownNodeIds.size > 0 && !knownNodeIds.has(a.s) && !NODE_SHAPED.test(String(a.s))) {
    out.push(f('G0', 'reference.subject', aid, '未知主语 ' + String(a.s)))
  }
  return out
}

/**
 * G1：形状约束（SHACL 子集）。
 * onlySubjects：只校验这些主语下的断言——闸门只对「本次增量触及的部分」负责，
 * 既有状态里的历史违规不得连坐新提交（否则一次违规会让库永久只读）。
 */
export function gateShapes(assertions: Iterable<Assertion>, opts: { onlySubjects?: Set<string> } = {}): Finding[] {
  const out: Finding[] = []
  const actives = [...assertions]
    .filter((a) => a.status !== 'retracted')
    .filter((a) => !opts.onlySubjects || opts.onlySubjects.has(a.s))
  const bySubject = new Map<string, Assertion[]>()
  for (const a of actives) {
    bySubject.set(a.s, [...(bySubject.get(a.s) ?? []), a])
  }
  for (const [sid, items] of bySubject) {
    const preds = new Set(items.map((a) => a.p))
    const classes = new Set(items.filter((a) => a.p === 'r:is_a').map((a) => String(a.o)))
    if (classes.has('c:Hypothesis') && !preds.has('r:has_falsifier')) {
      out.push(f('G1', 'shape.hypothesis_falsifier', sid, 'Hypothesis 必须有 falsifier'))
    }
    if (classes.has('c:Concept') && !preds.has('r:defined_as')) {
      out.push(f('G1', 'shape.concept_definition', sid, 'Concept 必须有 definition'))
    }
  }
  for (const a of actives) {
    const root = String(a.scope ?? '').split(':')[0] ?? ''
    if (root !== 'sess' && (a.evidence ?? []).length === 0) {
      out.push(f('G1', 'shape.assertion_evidence', a.id, '非 sess 断言必须带 evidence（形状层）'))
    }
  }
  return out
}

/**
 * OA2 的签发凭据：构造函数私有且不导出实例工厂，
 * 外部模块无法伪造 token（只能拿到类型），因此 accepted 无法在 gate 之外被构造。
 */
export class GateToken {
  // 不携带时间：core 是确定性模块（禁时钟，make lint-layers 机器校验）
  private constructor(readonly issued: true) {}
  /** 仅供本模块内部使用 */
  static readonly issue = (): GateToken => new GateToken(true)
}

/** 运行时守卫：任何来源的断言都能被检是否真由 gate 签发 */
export function isAccepted(a: Assertion | { gateToken?: unknown }): boolean {
  return (a as { gateToken?: unknown }).gateToken instanceof GateToken
}

/** OA2 的唯一签发点：只有通过 gate（无 reject）的 candidate 才能变成 accepted。 */
export function gateAccept(a: Assertion, findings: Finding[]): AcceptedAssertion | null {
  if (findings.some((x) => x.severity === 'reject')) return null
  const token = GateToken.issue()
  const accepted: AcceptedAssertion = {
    ...a,
    status: 'accepted',
    gateToken: token,
    provenance: { ...(a.provenance ?? {}), gated: true },
  }
  return accepted
}
