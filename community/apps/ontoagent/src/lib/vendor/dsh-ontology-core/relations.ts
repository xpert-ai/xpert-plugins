/**
 * 关系索引：由**有效断言**确定性生成"边"，每条边记录来源断言与本体版本。
 *
 * 约束（ADR-0011 §5）：
 * - 纯计算，无 IO/时钟/随机；同一 (版本, nodes, assertions) 必得同一索引；
 * - 只索引两端都是已知节点的断言；retracted 断言不进入；
 * - 同类边合并来源，来源排序；边的顺序按稳定 id 排序；
 * - 关系索引是派生读取形态，不是新的事实源，不改变断言/版本。
 */
import { contentDigest } from './digest.js'
import type { Assertion, Node } from './types.js'

export interface RelationEdge {
  /** 稳定 id：rel:<内容摘要>，与断言顺序/存储顺序无关 */
  id: string
  s: string
  p: string
  o: string
  /** 供稠密召回/词面降级使用的渲染文本（标签 + 别名 + IRI） */
  text: string
  /** 来源断言 id（去重、排序） */
  sources: string[]
  /** 来源断言 scope（去重、排序） */
  scopes: string[]
}

export interface RelationIndex {
  /** 生成索引时的本体版本（OA5：索引必须可追溯到版本） */
  version: string
  edges: RelationEdge[]
}

export interface RelationIndexInput {
  version: string
  nodes: Node[]
  assertions: Assertion[]
  /**
   * 是否把未登记为 Node 的字符串端点也纳入（任务本体常用朴素名字）。
   * 默认 false（FIBO/严格模式：两端必须是已知类）；任务产线传 true。
   */
  includeUnregistered?: boolean
}

const shortId = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id)

const formsOf = (node: Node | undefined, id: string): string[] => {
  if (node === undefined) return [shortId(id)]
  const out: string[] = []
  for (const label of node.labels ?? []) if (label.trim().length > 0) out.push(label.trim())
  for (const alias of node.aliases ?? []) if (alias.trim().length > 0) out.push(alias.trim())
  if (out.length === 0) out.push(shortId(id))
  return out
}

/** 边文本：主宾谓的标签/别名 + IRI；全部参与稠密或词面匹配，顺序固定。 */
export function relationEdgeText(
  s: string, p: string, o: string, nodes: Map<string, Node>,
): string {
  const parts: string[] = []
  const push = (x: string): void => { if (x.length > 0 && !parts.includes(x)) parts.push(x) }
  for (const x of formsOf(nodes.get(s), s)) push(x)
  for (const x of formsOf(nodes.get(p), p)) push(x)
  for (const x of formsOf(nodes.get(o), o)) push(x)
  push(s); push(p); push(o)
  return parts.join(' ')
}

/**
 * 由有效断言生成关系索引。
 *
 * - 两端必须是已知 Node（避免把字面量/未登记端点混进关系候选）；
 * - `retracted` 不进入；同一 `(s,p,o)` 合并来源；
 * - 关系 `p` 自身不必是 Node，但若有 Node 则用其标签/别名。
 */
export function buildRelationIndex(input: RelationIndexInput): RelationIndex {
  const nodes = new Map(input.nodes.map((n) => [n.id, n]))
  const groups = new Map<string, {
    s: string; p: string; o: string; sources: Set<string>; scopes: Set<string>
  }>()
  for (const a of input.assertions) {
    if (a.status === 'retracted') continue
    if (typeof a.s !== 'string' || a.s.length === 0) continue
    if (typeof a.p !== 'string' || a.p.length === 0) continue
    if (typeof a.o !== 'string' || a.o.length === 0) continue
    if (input.includeUnregistered !== true && (!nodes.has(a.s) || !nodes.has(a.o))) continue
    const key = a.s + '\u0000' + a.p + '\u0000' + a.o
    const cur = groups.get(key) ?? {
      s: a.s, p: a.p, o: a.o, sources: new Set<string>(), scopes: new Set<string>(),
    }
    if (typeof a.id === 'string' && a.id.length > 0) cur.sources.add(a.id)
    if (typeof a.scope === 'string' && a.scope.length > 0) cur.scopes.add(a.scope)
    groups.set(key, cur)
  }
  const edges: RelationEdge[] = []
  for (const g of groups.values()) {
    edges.push({
      id: 'rel:' + contentDigest([g.s, g.p, g.o]),
      s: g.s, p: g.p, o: g.o,
      text: relationEdgeText(g.s, g.p, g.o, nodes),
      sources: [...g.sources].sort(),
      scopes: [...g.scopes].sort(),
    })
  }
  edges.sort((a, b) => a.id.localeCompare(b.id))
  return { version: input.version, edges }
}

/** 索引摘要：用于"同一版本 → 同一索引"的机器校验与重建对账。 */
export function relationIndexDigest(index: RelationIndex): string {
  return contentDigest(index)
}

/** 从命中边取切片焦点：按边的排序取两端，去重并截断。 */
export function relationFocus(edges: RelationEdge[], limit = 12): string[] {
  const out: string[] = []
  for (const e of edges) {
    for (const id of [e.s, e.o]) {
      if (id.length > 0 && !out.includes(id)) out.push(id)
      if (out.length >= limit) return out
    }
  }
  return out
}
