/**
 * 澄清候选项：只从已认证术语的声明字段生成，不让模型自由扩展。
 * 纯计算：无 IO/时钟/随机。
 */
import type { Assertion, Node } from './types.js'
import { enrichNodes } from './terms.js'
import { tokenize } from './retrieve.js'

export interface ClarificationOption {
  /** auto:term:<id> */
  termId: string
  label: string
  /** 该术语声明的物理字段（最多 3 个） */
  fields: string[]
  description: string
}

export interface ClarificationRequest {
  question: string
  options: ClarificationOption[]
  /** 允许“都不是/按通用知识回答” */
  allowNone: boolean
}

const indexBySubject = (assertions: Assertion[]): Map<string, Assertion[]> => {
  const out = new Map<string, Assertion[]>()
  for (const a of assertions) {
    if (!out.has(a.s)) out.set(a.s, [])
    out.get(a.s)!.push(a)
  }
  return out
}
const objectsOf = (index: Map<string, Assertion[]>, s: string, p: string): string[] =>
  (index.get(s) ?? []).filter((a) => a.p === p && typeof a.o === 'string').map((a) => a.o as string)

/** 从术语 id 生成 2–N 个澄清选项；没有物理字段的术语仍保留，但字段为空。 */
export function buildClarificationOptions(input: {
  nodes: Node[]
  assertions: Assertion[]
  termIds: readonly string[]
  limit?: number
  /** 用户原问题；用于把“词面有证据”的候选排在前面，避免纯 dense 顺序埋掉正确项。 */
  query?: string
  /** 保留输入顺序（auto-clarify-v1 用 Jev 最终顺序作为澄清顺序）；默认按词面 evidence 排序。 */
  preserveOrder?: boolean
}): ClarificationOption[] {
  const limit = Math.max(1, input.limit ?? 3)
  const enriched = enrichNodes(input.nodes, input.assertions)
  const byId = new Map(enriched.map((n) => [n.id, n]))
  const index = indexBySubject(input.assertions)
  const seen = new Set<string>()
  const out: Array<ClarificationOption & { rank: number; evidence: number }> = []
  const queryTokens = new Set(tokenize(input.query ?? ''))
  for (const termId of input.termIds) {
    if (seen.has(termId)) continue
    const node = byId.get(termId)
    if (node === undefined || !termId.startsWith('auto:term:')) continue
    seen.add(termId)
    const fields: string[] = []
    for (const attrId of objectsOf(index, termId, 'has_attribute')) {
      for (const colId of objectsOf(index, attrId, 'maps_to_column')) fields.push(...objectsOf(index, colId, 'physical_name'))
    }
    for (const sqlId of objectsOf(index, termId, 'has_sql_attribute')) {
      for (const colId of objectsOf(index, sqlId, 'uses_column')) fields.push(...objectsOf(index, colId, 'physical_name'))
    }
    const labels = [...(node.labels ?? []), ...(node.aliases ?? [])].filter((x) => x.trim().length > 0)
    const option = {
      termId,
      label: labels[0] ?? termId,
      fields: [...new Set(fields)].sort().slice(0, 3),
      description: (node.definition ?? labels.slice(1).join(' / ') ?? '').slice(0, 180),
    }
    const evidence = [...new Set([
      ...tokenize(option.label),
      ...tokenize(option.description),
      ...option.fields.flatMap((f) => tokenize(f.replace(/[._]/g, ' '))),
    ])].filter((t) => t.length > 1 && queryTokens.has(t)).length
    out.push({ ...option, rank: out.length, evidence })
  }
  if (input.preserveOrder !== true) out.sort((a, b) => b.evidence - a.evidence || a.rank - b.rank)
  return out.slice(0, limit).map(({ rank: _rank, evidence: _evidence, ...option }) => option)
}

/** 查询与候选证据是否有至少一个实词重叠；只用于“是否值得问一句”，不是最终判定。 */
export function hasClarificationEvidence(query: string, options: ClarificationOption[], tokenize: (s: string) => string[]): boolean {
  const queryTokens = new Set(tokenize(query))
  for (const option of options) {
    const evidence = new Set([
      ...tokenize(option.label),
      ...tokenize(option.description),
      ...option.fields.flatMap((f) => tokenize(f.replace(/[._]/g, ' '))),
    ])
    for (const token of queryTokens) if (token.length > 1 && evidence.has(token)) return true
  }
  return false
}
