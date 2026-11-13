/**
 * 本体自描述：告诉模型"能说什么"（可用关系 / 主宾类型 / 可用 scope / 条数）。
 *
 * 依据：SDSR（arXiv 2604.19777）的 dual-layer guidance —— 结构化知识旁要带"使用说明"，
 * 否则模型只能靠猜该用哪个关系；同时这也是把约束从"自然语言嘱咐"变成"受控词表"的前提。
 * 纯函数（无 IO/时钟/随机）。
 */
import { META_SET } from './keys.js'
import type { Assertion, Node } from './types.js'

export interface RelationSummary {
  /** 关系键（p 的原值） */
  p: string
  /** 出现过的条数 */
  count: number
  /** 主语形态：nodeRef 表示是节点 id，literal 表示字面量/朴素名 */
  subjectKind: 'nodeRef' | 'term'
  /** 宾语类型（去重后取前 3 个样例） */
  objects: string[]
  /** 该关系出现过的作用域 */
  scopes: string[]
}

export interface SchemaSummary {
  relations: RelationSummary[]
  /** 出现的作用域（去重、排序） */
  scopes: string[]
  assertionCount: number
  nodeCount: number
  /** 被截断的关系数（超过 maxRelations 时） */
  omitted: number
}

const isNodeRef = (v: unknown, known: Set<string>): boolean => typeof v === 'string' && known.has(v)

/**
 * 汇总本体结构。按出现次数降序（常用关系排在前面，模型先看到更可能用到的）。
 */
export function summarizeSchema(assertions: Assertion[], nodes: Node[], maxRelations = 12, objectSample = 3): SchemaSummary {
  const known = new Set(nodes.map((n) => n.id))
  const byP = new Map<string, { count: number; objects: Set<string>; scopes: Set<string>; nodeRef: boolean }>()
  const scopes = new Set<string>()
  for (const a of assertions) {
    if (a.status === 'retracted' || META_SET.has(a.p)) continue
    const cur = byP.get(a.p) ?? { count: 0, objects: new Set<string>(), scopes: new Set<string>(), nodeRef: false }
    cur.count += 1
    cur.scopes.add(String(a.scope))
    scopes.add(String(a.scope))
    if (isNodeRef(a.s, known)) cur.nodeRef = true
    if (typeof a.o === 'string' && a.o.length <= 40) cur.objects.add(a.o)
    else if (typeof a.o === 'number' || typeof a.o === 'boolean') cur.objects.add(String(a.o))
    byP.set(a.p, cur)
  }
  const all: RelationSummary[] = [...byP.entries()]
    .sort((x, y) => y[1].count - x[1].count || x[0].localeCompare(y[0]))
    .map(([p, v]) => ({
      p,
      count: v.count,
      subjectKind: v.nodeRef ? 'nodeRef' : 'term',
      objects: [...v.objects].slice(0, objectSample),
      scopes: [...v.scopes].sort(),
    }))
  return {
    relations: all.slice(0, maxRelations),
    scopes: [...scopes].sort(),
    assertionCount: assertions.filter((a) => a.status !== 'retracted').length,
    nodeCount: nodes.length,
    omitted: Math.max(0, all.length - maxRelations),
  }
}

/** 渲染成紧凑文本（一行一个关系）：token 便宜、且能直接当受控词表读。 */
export function renderSchema(summary: SchemaSummary): string[] {
  if (summary.relations.length === 0) return ['## 可用关系（0）', '- （本体为空：先按任务/语料生成本体）']
  const head = '## 可用关系（' + String(summary.relations.length) +
    (summary.omitted > 0 ? '+' + String(summary.omitted) + ' 条未列' : '') +
    '；断言 ' + String(summary.assertionCount) + ' / 节点 ' + String(summary.nodeCount) + '）'
  const lines = [head]
  for (const r of summary.relations) {
    const obj = r.objects.length > 0 ? ' 例:' + r.objects.join('|') : ''
    lines.push('- ' + r.p + ' ×' + String(r.count) + '（主语:' + r.subjectKind + '）' + obj)
  }
  if (summary.scopes.length > 0) lines.push('- 作用域: ' + summary.scopes.join(' / '))
  return lines
}
/**
 * 全局关系索引：只给**名字**（无样例、无计数），一行渲染。
 * 用途：告诉模型"库里还有哪些关系可用"，但几乎不花 token —— 与上下文相关的 schema 段分工。
 */
export function predicateIndex(assertions: Assertion[], cap = 30): string[] {
  const names = [...new Set(assertions.filter((a) => a.status !== 'retracted' && !META_SET.has(a.p)).map((a) => a.p))].sort()
  return names.slice(0, cap)
}