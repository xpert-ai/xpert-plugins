/**
 * 既有本体导入：把企业已在用的 OWL/TTL 变成本体断言（O1 一等输入）。
 *
 * 为什么要导入器而不是"让模型读一遍"：企业本体是**权威**，它不该经模型转述。
 * 导入后的断言走 `gov:` 作用域 + 高 authority + 证据定位到源文件，于是：
 * 检索能用它做术语归一、闸门能拿它当约束、跨 agent 能随 packet 传出去。
 *
 * 纯计算（无 IO）：输入是 TTL 文本与来源标签，输出是 Op[]。
 */
import type { Op } from './types.js'
import { parseTurtle, type GraphTriple } from './turtle.js'

export interface ImportOptions {
  /** 来源标识（写进证据 locator，例如 FIBO 模块 URL） */
  source: string
  /** 作用域根，默认 gov（受治理的权威知识） */
  scope?: string
  /** 权威等级，默认 100（外部权威高于模型产出） */
  rank?: number
}

export interface ImportResult {
  ops: Op[]
  /** 导入的概念/属性数 */
  terms: number
  /** 带标签的实体数（能参与术语归一的才算"可检索"） */
  labeled: number
  /** 词表里没见过的谓词（用于提示"该本体用了我们不认识的词汇"） */
  unknownPredicates: string[]
}

const TERM_TYPES = new Set(['owl:Class', 'owl:ObjectProperty', 'owl:DatatypeProperty', 'owl:AnnotationProperty'])
const LABEL_PREDICATES = new Set(['rdfs:label', 'skos:prefLabel'])
const DEF_PREDICATES = new Set(['skos:definition', 'rdfs:comment'])
const KNOWN = new Set([...TERM_TYPES, ...LABEL_PREDICATES, ...DEF_PREDICATES, 'rdf:type', 'rdfs:subClassOf', 'owl:deprecated', 'owl:equivalentClass', 'owl:equivalentProperty'])

/**
 * OWL/TTL → 断言：
 * - 每个类/属性 → 一条 `<id> |kind| <类型>`
 * - 标签/定义 → `<id> |label| <文本>` / `<id> |definition| <文本>`（供语义检索与消歧）
 * - 父子关系 → `<子> |subClassOf| <父>`
 * - 等价/弃用 → 保留为可查询事实（漂移检出依赖它们）
 */
export function importOwl(ttl: string, opts: ImportOptions): ImportResult {
  const scope = opts.scope ?? 'gov'
  const rank = opts.rank ?? 100
  const { triples } = parseTurtle(ttl)
  const ops: Op[] = []
  const terms = new Set<string>()
  const labeled = new Set<string>()
  const unknown = new Set<string>()
  let seq = 0

  const push = (s: string, p: string, o: unknown): void => {
    seq += 1
    ops.push({
      op: 'assert',
      assertion: {
        id: 'import:' + String(seq),
        s, p, o, q: { source: opts.source },
        scope: scope + ':preset',
        status: 'candidate',
        authority: { rank, confidence: 1 },
        evidence: [{ kind: 'file', locator: opts.source }],
      },
    })
  }

  for (const t of triples as GraphTriple[]) {
    const s = t.s.kind === 'iri' ? t.s.value : null
    if (s === null) continue
    const oIri = t.o.kind === 'iri' ? t.o.value : null
    const oLit = t.o.kind === 'literal' ? t.o.value : null
    if (!KNOWN.has(t.p) && !t.p.startsWith('rdfs:') && !t.p.startsWith('owl:') && !t.p.startsWith('skos:')) unknown.add(t.p)

    if (t.p === 'rdf:type' && oIri !== null && TERM_TYPES.has(oIri)) {
      terms.add(s)
      push(s, 'kind', oIri.replace('owl:', ''))
      continue
    }
    if (LABEL_PREDICATES.has(t.p) && oLit !== null) { labeled.add(s); push(s, 'label', oLit); continue }
    if (DEF_PREDICATES.has(t.p) && oLit !== null) { push(s, 'definition', oLit); continue }
    if (t.p === 'rdfs:subClassOf' && oIri !== null) { push(s, 'subClassOf', oIri); continue }
    if (t.p === 'owl:deprecated' && oLit !== null) { push(s, 'deprecated', oLit === 'true'); continue }
    if ((t.p === 'owl:equivalentClass' || t.p === 'owl:equivalentProperty') && oIri !== null) {
      push(s, 'equivalentTo', oIri)
    }
  }
  return { ops, terms: terms.size, labeled: labeled.size, unknownPredicates: [...unknown].slice(0, 12) }
}
