/**
 * 术语检索文档：每个认证术语一张卡，供 dense 嵌入使用。
 *
 * 文本形状固定（Term / Definition / Attributes / Tables / Physical columns / SQL），
 * 同一 (nodes, assertions) 必得同一文本；评测缓存键由调用方按 sourceDigest+model+docDigest 计算。
 * 纯计算：无 IO/时钟/随机。
 */
import type { Assertion, Node } from './types.js'
import { enrichNodes } from './terms.js'

export interface TermDocument {
  /** 裸术语 id，如 term-net-revenue */
  termId: string
  /** 节点 id，如 auto:term:term-net-revenue */
  nodeId: string
  text: string
}

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort()
const bareTermId = (nodeId: string): string => nodeId.startsWith('auto:term:') ? nodeId.slice('auto:term:'.length) : nodeId

function indexBySubject(assertions: Assertion[]): Map<string, Assertion[]> {
  const out = new Map<string, Assertion[]>()
  for (const a of assertions) {
    if (!out.has(a.s)) out.set(a.s, [])
    out.get(a.s)!.push(a)
  }
  return out
}

const objectsOf = (index: Map<string, Assertion[]>, subject: string, predicate: string): string[] =>
  (index.get(subject) ?? []).filter((a) => a.p === predicate && typeof a.o === 'string').map((a) => a.o as string)

const physicalOf = (index: Map<string, Assertion[]>, columnNodeId: string): string[] =>
  objectsOf(index, columnNodeId, 'physical_name')

function buildOne(index: Map<string, Assertion[]>, byId: Map<string, Node>, term: Node): TermDocument {
  const nodeId = term.id
  const name = sorted([...(term.labels ?? []), ...(term.aliases ?? [])])
  const definition = term.definition ?? ''
  const attrs: string[] = []
  const columns: string[] = []
  const tables: string[] = []
  const sql: string[] = []
  for (const attrId of objectsOf(index, nodeId, 'has_attribute')) {
    const attr = byId.get(attrId)
    if (attr !== undefined) attrs.push(...(attr.labels ?? []), ...(attr.aliases ?? []))
    for (const colId of objectsOf(index, attrId, 'maps_to_column')) columns.push(...physicalOf(index, colId))
  }
  for (const tableId of objectsOf(index, nodeId, 'represents_table')) {
    const table = byId.get(tableId)
    if (table !== undefined) tables.push(...(table.labels ?? []))
  }
  for (const sqlId of objectsOf(index, nodeId, 'has_sql_attribute')) {
    const sqlNode = byId.get(sqlId)
    if (sqlNode !== undefined) sql.push(...(sqlNode.labels ?? []))
    for (const a of index.get(sqlId) ?? []) {
      if (a.p === 'sql_expression' && typeof a.o === 'string') sql.push(a.o)
      if (a.p === 'uses_column' && typeof a.o === 'string') columns.push(...physicalOf(index, a.o))
    }
  }
  const text = [
    'Term: ' + sorted(name).join(' / '),
    definition.length > 0 ? 'Definition: ' + definition : '',
    attrs.length > 0 ? 'Attributes: ' + sorted(attrs).join(', ') : '',
    tables.length > 0 ? 'Tables: ' + sorted(tables).join(', ') : '',
    columns.length > 0 ? 'Physical columns: ' + sorted(columns).join(', ') : '',
    sql.length > 0 ? 'SQL: ' + sorted(sql).join(' ; ') : '',
  ].filter((line) => line.length > 0).join('\n')
  return { termId: bareTermId(nodeId), nodeId, text }
}

export function buildTermDocuments(nodes: Node[], assertions: Assertion[]): TermDocument[] {
  const index = indexBySubject(assertions)
  // 服务层返回的 Node 可能只有 id/kind，标签与别名在断言里（日志是事实源）。
  const enriched = enrichNodes(nodes, assertions)
  const byId = new Map(enriched.map((n) => [n.id, n]))
  return enriched
    .filter((n) => n.id.startsWith('auto:term:'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => buildOne(index, byId, n))
}
