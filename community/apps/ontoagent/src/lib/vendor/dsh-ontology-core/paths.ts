/**
 * 链式三元组：本体注入不应该是"一袋三元组"，而应该是**连通的路径**。
 *
 * 依据：
 * - RoG（arXiv 2310.01061）先做**关系规划**再取**路径**，把本体当结构用而不是纯事实库；
 * - SPIMP-RAG 的粗到细 + 预算内 rerank；
 * - GRASP（2605.16598）把多跳问题拆成依赖感知的子计划（每条子计划 = 一条待补全的链）。
 *
 * 规则的处理是另一条线：**规则型断言不能用"可选检索"对待**（agent 不查就违规），
 * 所以这里单列 `isRuleAssertion` / `selectRules`：规则按任务确定性选出、强制注入，
 * 事实型断言才走按需检索。纯函数（无 IO/时钟/随机）。
 */
import type { Assertion } from './types.js'
import { META_SET } from './keys.js'
import { tokenize } from './retrieve.js'

/** 规则型断言的判定：作用域以 `rule:` 开头，或限定符显式声明义务/禁止。 */
export function isRuleAssertion(a: Assertion): boolean {
  const scope = String(a.scope ?? '')
  if (scope.startsWith('rule:')) return true
  const modality = String((a.q ?? {})['modality'] ?? '')
  return modality === 'obligation' || modality === 'prohibition' || modality === 'permission'
}

export interface RuleSelection {
  /** 按相关性选出的适用规则（必须全部注入） */
  rules: Assertion[]
  /** 库里规则总数（用于报告"选了几条 / 共几条"，避免静默截断） */
  total: number
  truncated: boolean
}

/** 确定性选出"适用于本任务的规则"：只看规则型断言，按 IDF 相关性取 top-k。 */
export function selectRules(query: string, assertions: Assertion[], max = 12): RuleSelection {
  const rules = assertions.filter((a) => a.status !== 'retracted' && isRuleAssertion(a))
  if (rules.length === 0) return { rules: [], total: 0, truncated: false }
  const qt = [...new Set(tokenize(query))]
  const df = new Map<string, number>()
  const docs = rules.map((a) => {
    const text = [a.s, a.p, String(a.o), ...(a.evidence ?? []).map((e) => e.locator)].join(' ')
    const toks = new Set(tokenize(text))
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1)
    return { a, toks }
  })
  const N = rules.length
  const idf = (t: string): number => Math.log(1 + N / (1 + (df.get(t) ?? 0)))
  const scored = docs.map(({ a, toks }) => {
    let score = 0
    for (const t of qt) if (toks.has(t)) score += idf(t)
    // 完全没有词面重合时，仍给一个极小正分：宁可多注入一条规则，也不要漏掉红线
    return { a, score: score === 0 ? 0.0001 : score }
  })
  scored.sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id))
  return { rules: scored.slice(0, max).map((s) => s.a), total: rules.length, truncated: rules.length > max }
}

export interface PathHit {
  /** 路径上的实体序列（长度 = 断言数 + 1） */
  nodes: string[]
  /** 路径上的断言（顺序即链的顺序） */
  assertions: Assertion[]
  score: number
  /** 是否覆盖到规则型断言（覆盖规则的链优先） */
  hasRule: boolean
}

export interface PathOptions {
  maxHops?: number
  maxPaths?: number
  /** 路径里至少要有一条与查询词面重合的断言（防止纯随机游走） */
  requireMatch?: boolean
}

const asText = (a: Assertion): string =>
  [a.s, a.p, typeof a.o === 'string' ? a.o : String(a.o)].join(' ')

/**
 * 从种子实体出发，沿关系走 `maxHops` 步，收集连通的路径并按相关性排序。
 * 这是"链式"的落地：**前提 → 中间实体 → 规则/结论** 会作为一条链整块注入，而不是散装三元组。
 */
export function retrievePaths(query: string, corpus: { assertions: Assertion[] }, seeds: string[], opts: PathOptions = {}): PathHit[] {
  const maxHops = opts.maxHops ?? 2
  const maxPaths = opts.maxPaths ?? 8
  const requireMatch = opts.requireMatch ?? true
  // 簿记谓词（kind/label/definition…）不参与链路：它们是元数据，不是业务关系
  const actives = corpus.assertions.filter((a) => a.status !== 'retracted' && !META_SET.has(a.p))
  const qt = [...new Set(tokenize(query))]
  const df = new Map<string, number>()
  const textOf = new Map<string, Set<string>>()
  for (const a of actives) {
    const toks = new Set(tokenize(asText(a)))
    textOf.set(a.id, toks)
    for (const t of toks) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const N = actives.length === 0 ? 1 : actives.length
  const idf = (t: string): number => Math.log(1 + N / (1 + (df.get(t) ?? 0)))
  const edgeScore = (a: Assertion): number => {
    const toks = textOf.get(a.id) ?? new Set<string>()
    let s = 0
    for (const t of qt) if (toks.has(t)) s += idf(t)
    return s
  }
  const neighbour = new Map<string, Assertion[]>()
  for (const a of actives) {
    for (const ref of [a.s, a.o]) {
      if (typeof ref !== 'string' || ref.length === 0) continue
      const arr = neighbour.get(ref) ?? []
      arr.push(a)
      neighbour.set(ref, arr)
    }
  }

  const found = new Map<string, PathHit>()
  const walk = (nodes: string[], edges: Assertion[]): void => {
    if (edges.length > 0) {
      const key = nodes.join('→')
      if (!found.has(key)) {
        const matched = edges.some((e) => edgeScore(e) > 0)
        if (!requireMatch || matched) {
          const score = edges.reduce((s, e) => s + edgeScore(e), 0) / edges.length
          found.set(key, { nodes, assertions: edges, score: Number(score.toFixed(4)), hasRule: edges.some(isRuleAssertion) })
        }
      }
    }
    if (edges.length >= maxHops) return
    const tail = nodes[nodes.length - 1] as string
    for (const a of neighbour.get(tail) ?? []) {
      if (edges.some((e) => e.id === a.id)) continue
      const other = a.s === tail ? a.o : a.s
      if (typeof other !== 'string' || other.length === 0 || nodes.includes(other)) continue
      walk([...nodes, other], [...edges, a])
    }
  }
  for (const seed of seeds) walk([seed], [])

  return [...found.values()]
    .sort((x, y) => Number(y.hasRule) - Number(x.hasRule) || y.score - x.score || x.nodes.join('>').localeCompare(y.nodes.join('>')))
    .slice(0, maxPaths)
}

/** 把一条路径渲染成一行（链式可读 + 每跳带证据，便于核对） */
export function renderPath(p: PathHit): string {
  const parts: string[] = []
  for (let i = 0; i < p.assertions.length; i += 1) {
    const a = p.assertions[i]
    parts.push(String(a.s), '—' + a.p + '→', String(a.o))
    void i
  }
  const ev = p.assertions.map((a) => (a.evidence ?? []).map((e) => e.locator).join('|') || '∅').join(' / ')
  return '- ' + parts.join(' ') + '  证据:' + ev + (p.hasRule ? '  ⟨含规则⟩' : '')
}