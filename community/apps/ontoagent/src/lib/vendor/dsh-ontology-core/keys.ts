/** 键、权威序、生效索引（纯计算）。 */
import type { Assertion, Evidence } from './types.js'

export * from './types.js'

export const RANK: Record<string, number> = {
  gov: 100, curated: 80, task_ancestor: 60, task_self: 50,
  env_aligned: 40, inferred: 20, sess: 10,
}
/**
 * 作用域根。'rule' 单列的原因是**规则不能和事实混在一起按需检索**：
 * agent 可以选择不查事实（后果自负），但不能选择不知道红线。
 * 规则仍受 OA1 约束（非 sess 必须带证据），并由确定性选择**强制注入**上下文。
 */
export const SCOPES = ['gov', 'env', 'task', 'sess', 'rule'] as const
export const STATUSES = ['candidate', 'validated', 'accepted', 'promoted'] as const

/** scope 的根（gov / env / task / sess / rule）。 */
export function scopeRoot(scope: string): string {
  return String(scope).split(':')[0] ?? ''
}

/** 段边界包含：task:T1 包含 task:T1:x，但不包含 task:T10。 */
export function scopeContains(container: string, scope: string): boolean {
  if (container === scope) return true
  const prefix = container.endsWith(':') ? container : container + ':'
  return scope.startsWith(prefix)
}

export function scopeWithinAny(scope: string, allowed: readonly string[]): boolean {
  return allowed.some((container) => scopeContains(container, scope))
}

/**
 * 簿记型谓词：本体导入/术语归一用的元数据，不是业务关系。
 * 它们参与检索与消歧，但**不该出现在"推理链"与"可用关系"里**，否则上下文被噪声占满。
 */
export const META_PREDICATES = ['kind', 'label', 'definition', 'alias', 'deprecated', 'equivalentTo'] as const
export const META_SET: ReadonlySet<string> = new Set(META_PREDICATES)

const SEP = '\u0001'

export function asrtKey(a: Assertion): string {
  const q = a.q ?? {}
  const qk = Object.keys(q).sort().map((k) => k + '=' + String(q[k])).join('&')
  return a.s + SEP + a.p + SEP + qk
}

export function keyParts(k: string): string[] {
  return k.split(SEP)
}

export function asrtValue(a: Assertion): unknown {
  return a.o
}

export function rankOf(a: Assertion): [number, number] {
  const root = String(a.scope ?? '').split(':')[0] ?? ''
  const base = RANK[root] ?? RANK[a.authority?.rank_name ?? ''] ?? 10
  return [a.authority?.rank ?? base, a.authority?.confidence ?? 0]
}

/**
 * 权威序比较（全仓唯一实现）。
 * 返回 >0 表示 a 更强、<0 表示 b 更强、0 表示完全同分。
 * 同分时**不引入 id 破平**——由调用方决定（activeByKey 保留先见者，merge 判 disputed），
 * 这一点必须与 Python 参考实现一致（见 conformance 的 same-key-tie 用例）。
 */
export function compareAuthority(a: Assertion, b: Assertion): number {
  const [ra, ca] = rankOf(a)
  const [rb, cb] = rankOf(b)
  if (ra !== rb) return ra - rb
  if (ca !== cb) return ca - cb
  return 0
}

export function unionEvidence(x: Assertion, y: Assertion): Assertion {
  const seen = new Set((x.evidence ?? []).map((e) => e.kind + '|' + e.locator))
  const ev: Evidence[] = [...(x.evidence ?? [])]
  for (const e of y.evidence ?? []) {
    if (!seen.has(e.kind + '|' + e.locator)) ev.push(e)
  }
  return { ...x, evidence: ev }
}

export function activeByKey(assertions: Iterable<Assertion>): {
  index: Map<string, Assertion>
  shadow: Map<string, Assertion[]>
} {
  const index = new Map<string, Assertion>()
  const shadow = new Map<string, Assertion[]>()
  for (const a of assertions) {
    if (a.status === 'retracted') continue
    const k = asrtKey(a)
    const cur = index.get(k)
    if (!cur) { index.set(k, a); continue }
    // 同分同置信：保留**先见者**（与 Python 参考实现一致；不引入 id 破平）
    const aWins = compareAuthority(a, cur) > 0
    const winner = aWins ? a : cur
    const loser = aWins ? cur : a
    index.set(k, winner)
    shadow.set(k, [...(shadow.get(k) ?? []), loser])
  }
  return { index, shadow }
}
