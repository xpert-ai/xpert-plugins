/**
 * 闸门服务层：G0/G1 复用 core；本包负责 G2（只降权）+ T0/T1/T2 分档 + 提交编排。
 */
import {
  gateAccept, gateAssertion, gateG0, gateShapes,
  type AcceptedAssertion, type Assertion, type BaseVersion, type Finding, type Op,
} from '../dsh-ontology-core/index.js'

export { gateAccept, gateAssertion, gateG0, gateShapes } from '../dsh-ontology-core/index.js'
export type { AcceptedAssertion, Assertion, Finding, Op } from '../dsh-ontology-core/index.js'

export type ReviewTier = 'T0' | 'T1' | 'T2'

export interface TierRule { tier: ReviewTier; sampleRate: number; human: boolean }

export const DEFAULT_TIERS: Record<string, TierRule> = {
  'assert.leaf': { tier: 'T0', sampleRate: 0, human: false },
  'assert.property': { tier: 'T1', sampleRate: 0.1, human: false },
  'node.top': { tier: 'T2', sampleRate: 1, human: true },
  retract: { tier: 'T2', sampleRate: 1, human: true },
  promote: { tier: 'T2', sampleRate: 1, human: true },
  disputed: { tier: 'T2', sampleRate: 1, human: true },
}

/** 把 op 归类到审查档（决定自动/抽样/人工） */
export function classifyOp(op: Op, opts: { topScope?: string } = {}): ReviewTier {
  const kind = (op as { op: string }).op
  if (kind === 'retract' || kind === 'merge_node' || kind === 'split_node') return DEFAULT_TIERS['retract']!.tier
  if (kind === 'alias' || kind === 'map') return DEFAULT_TIERS['assert.property']!.tier
  const a = (op as { assertion?: Assertion }).assertion
  const scope = String(a?.scope ?? '')
  if (scope.startsWith('gov:')) return DEFAULT_TIERS['node.top']!.tier
  if (opts.topScope && scope.startsWith(opts.topScope)) return DEFAULT_TIERS['node.top']!.tier
  const p = String(a?.p ?? '')
  if (p === 'r:is_a' || p === 'r:defined_as') return DEFAULT_TIERS['assert.property']!.tier
  return DEFAULT_TIERS['assert.leaf']!.tier
}

export function tierOfOps(ops: Op[], opts?: { topScope?: string }): ReviewTier {
  const order: ReviewTier[] = ['T0', 'T1', 'T2']
  let max = 0
  for (const op of ops) max = Math.max(max, order.indexOf(classifyOp(op, opts)))
  return order[max]!
}

/** 确定性抽样：同 key 必得同结论（不用随机） */
export function sampled(key: string, rate: number): boolean {
  if (rate <= 0) return false
  if (rate >= 1) return true
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h % 1000 < Math.round(rate * 1000)
}

/** G2：模型语义判断，只允许降权（永不单方面拒绝） */
export type G2Judge = (input: {
  candidate: Assertion
  known: Assertion[]
}) => { confidenceFactor: number; note: string } | null

export interface CommitInput {
  deltaId: string
  baseVersion?: Partial<BaseVersion>
  ops: Op[]
  knownNodeIds: Set<string>
  knownAssertions: Assertion[]
  judge?: G2Judge
  /** T1 抽样比例（默认 0.1） */
  sampleRate?: number
  /** T2 人审钩子：可同步可异步（DSH 的 ctx.approval.request 是 Promise） */
  askHuman?: (req: { tier: ReviewTier; deltaId: string; reasons: string[] }) => boolean | Promise<boolean>
  /** 视为「顶层概念」的 scope 前缀（默认 gov:），命中即 T2 */
  topScope?: string
}

export interface CommitOutcome {
  accepted: AcceptedAssertion[]
  rejected: Finding[]
  escalated: Finding[]
  tier: ReviewTier
  downgrades: Array<{ id: string; factor: number; note: string }>
  needsHuman: boolean
  /** T1 抽样命中的断言 id（需要事后复核，不阻断写入） */
  sampledForReview: string[]
}

/**
 * 闸门编排：G0（结构）→ G1（形状）→ G2（降权）→ 分档（T0/T1/T2）→ accepted 签发。
 * 任何 reject 存在即整体拒绝（不签发 accepted）。
 */
export async function runGate(input: CommitInput): Promise<CommitOutcome> {
  const g0 = gateG0({ deltaId: input.deltaId, baseVersion: input.baseVersion, ops: input.ops }, input.knownNodeIds)
  const candidates = input.ops
    .filter((o): o is { op: 'assert'; assertion: Assertion } => (o as { op: string }).op === 'assert')
    .map((o) => o.assertion)

  // 只对本次增量触及的主语做形状校验（避免历史违规连坐）
  const touched = new Set(candidates.map((a) => a.s))
  const g1 = gateShapes([...input.knownAssertions, ...candidates], { onlySubjects: touched })
  const structural = [...g0, ...g1]
  const rejects = structural.filter((x) => x.severity === 'reject')

  const downgrades: Array<{ id: string; factor: number; note: string }> = []
  const escalated: Finding[] = []
  const accepted: AcceptedAssertion[] = []
  const sampledForReview: string[] = []
  const tier = tierOfOps(input.ops, { topScope: input.topScope })

  if (rejects.length > 0) {
    return {
      accepted: [], rejected: rejects, escalated: [], tier, downgrades,
      needsHuman: false, sampledForReview,
    }
  }

  for (const a of candidates) {
    let judged = a
    const j = input.judge ? input.judge({ candidate: a, known: input.knownAssertions }) : null
    if (j && j.confidenceFactor < 1) {
      downgrades.push({ id: a.id, factor: j.confidenceFactor, note: j.note })
      judged = {
        ...a,
        authority: { ...(a.authority ?? {}), confidence: Math.max(0, Math.min(1, (a.authority?.confidence ?? 0) * j.confidenceFactor)) },
      }
    }
    const tierOfThis = classifyOp({ op: 'assert', assertion: a }, { topScope: input.topScope })
    if (tierOfThis === 'T2') {
      const verdict = await Promise.resolve(
        input.askHuman?.({ tier: tierOfThis, deltaId: input.deltaId, reasons: ['tier=T2'] }) ?? false,
      )
      if (!verdict) {
        escalated.push({ code: 'G3', rule: 'tier.t2_human', target: a.id, detail: 'T2 需要人工批准（未获批准则挂起）', severity: 'warn' })
        continue
      }
    }
    // T1 是抽样复核：抽中的标记待复核，不阻断写入
    if (tierOfThis === 'T1' && sampled(a.id + input.deltaId, input.sampleRate ?? 0.1)) {
      sampledForReview.push(a.id)
    }
    const acceptedOne = gateAccept(judged, rejects)
    if (acceptedOne) accepted.push(acceptedOne)
  }

  return {
    accepted, rejected: [], escalated, tier, downgrades,
    needsHuman: escalated.length > 0,
    sampledForReview,
  }
}
