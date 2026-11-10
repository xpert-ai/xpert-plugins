/**
 * 本体检索（R1/R2）：实体链接 → 粗筛候选 → 细粒度重排。纯计算（无 IO/时钟/随机、无外部依赖）。
 *
 * 依据（docs/research/context-injection-practices.md §5）：
 * - **实体链接优先**：短而含糊的用户问题对现成 EL 方法是难点（arXiv 2508.03865，agent 主动识别 mention→取候选→决策）；
 * - **粗到细两阶段**：单阶段/结构无关的检索在固定预算下会返回跑题三元组（SPIMP-RAG）；
 * - **关系规划**：把本体当结构用，先定要走的关系再取路径（RoG, 2310.01061）。
 *
 * 无依赖实现：CJK 用**二元组**、ASCII 用词；TF-IDF 打分；带"命中了什么"的可解释字段。
 */
import type { Assertion, Node } from './types.js'

export interface Indexed {
  tokens: Map<string, number>
  text: string
}

const ASCII = /[a-z0-9_]+/g
const CJK = /[\u4e00-\u9fff]+/g

/** 分词：ASCII 词 + CJK 二元组（CJK 单字太吵，二元组是无分词器时的稳妥折中）。 */
export function tokenize(text: string): string[] {
  const low = text.toLowerCase()
  const out: string[] = []
  for (const w of low.match(ASCII) ?? []) out.push(w)
  for (const run of low.match(CJK) ?? []) {
    if (run.length === 1) { out.push(run); continue }
    for (let i = 0; i + 2 <= run.length; i += 1) out.push(run.slice(i, i + 2))
    out.push(run) // 整段保留：支持"理赔单A-1024"这种整体命中
  }
  return out
}

export function indexOf(text: string): Indexed {
  const tokens = new Map<string, number>()
  for (const t of tokenize(text)) tokens.set(t, (tokens.get(t) ?? 0) + 1)
  return { tokens, text }
}

export interface Corpus { nodes: Node[]; assertions: Assertion[] }

export interface SearchHit {
  id: string
  score: number
  /** 命中的查询词（解释性：为什么它被选中） */
  matched: string[]
}

export interface RetrieveResult {
  /** 粗筛：候选实体（按相关性） */
  entities: SearchHit[]
  /** 细排：候选断言（按相关性） */
  assertions: SearchHit[]
  /** 可直接喂给 slice 的焦点（实体 id + 命中断言的端点） */
  focus: string[]
  /** 查询词里没有任何词进入语料（检索必然空手，调用方应改走"最近断言"兜底） */
  noSignal: boolean
}

interface Scored { docTokens: Map<string, number>; id: string; raw: string }

function buildScorer(docs: Scored[]): (queryTokens: string[]) => SearchHit[] {
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.docTokens.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length === 0 ? 1 : docs.length
  const idf = (t: string): number => Math.log(1 + N / (1 + (df.get(t) ?? 0)))
  return (queryTokens: string[]): SearchHit[] => {
    const q = [...new Set(queryTokens)]
    const hits: SearchHit[] = []
    for (const d of docs) {
      let score = 0
      const matched: string[] = []
      for (const t of q) {
        const tf = d.docTokens.get(t) ?? 0
        if (tf === 0) continue
        score += idf(t) * (1 + Math.log(tf))
        matched.push(t)
      }
      if (score <= 0) continue
      const norm = Math.sqrt([...d.docTokens.values()].reduce((s, x) => s + x, 0))
      hits.push({ id: d.id, score: Number((score / Math.max(1, norm)).toFixed(4)), matched })
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  }
}

/** 节点文档文本：id + 标签 + 别名 + 定义（别名与定义是实体链接的关键表面形式）。 */
const nodeText = (n: Node): string =>
  [n.id, ...(n.labels ?? []), ...(n.aliases ?? []), n.definition ?? ''].join(' ')

/** 断言文档文本：主宾 + 关系 + 证据定位（证据 locator 常含业务单号/段落锚）。 */
const assertionText = (a: Assertion): string =>
  [a.s, a.p, typeof a.o === 'string' ? a.o : String(a.o), ...(a.evidence ?? []).map((e) => e.locator)].join(' ')

/**
 * 两阶段检索：粗筛实体（label/alias/definition）→ 细排断言（含证据 locator）。
 * 只返回**同一批候选**内的排序结果，不做多跳扩展（扩展交给 slice 的 hops）。
 */
export function retrieve(query: string, corpus: Corpus, opts: { limit?: number; assertionLimit?: number } = {}): RetrieveResult {
  const limit = opts.limit ?? 8
  const aLimit = opts.assertionLimit ?? 40
  const qt = tokenize(query)
  const actives = corpus.assertions.filter((a) => a.status !== 'retracted')

  // 隐含实体：断言端点未必登记成 Node（模型给的是朴素名字），但它们天然就是可检索实体
  const known = new Set(corpus.nodes.map((n) => n.id))
  // 端点若已经是某个概念的表面形式（label/alias/别名），就不再另造一个同名实体：
  // 否则"夜班"和"shift:night"会各占一个候选，把分数劈成两半，人也看不懂哪个才是概念。
  const surface = new Set<string>()
  for (const n of corpus.nodes) {
    for (const form of [n.id.includes(':') ? n.id.slice(n.id.indexOf(':') + 1) : n.id, ...(n.labels ?? []), ...(n.aliases ?? [])]) {
      const key = form.trim().toLowerCase()
      if (key.length > 0) surface.add(key)
    }
  }
  const endpoints = new Set<string>()
  for (const a of actives) {
    if (typeof a.s === 'string' && a.s.length > 0) endpoints.add(a.s)
    if (typeof a.o === 'string' && a.o.length > 0) endpoints.add(a.o)
  }
  const implicit: Node[] = [...endpoints]
    .filter((e) => !known.has(e) && !surface.has(e.trim().toLowerCase()))
    .map((e) => ({ id: e, kind: 'term', scope: 'task:local' }))
  const allNodes = [...corpus.nodes, ...implicit]
  const scoreEntities = buildScorer(allNodes.map((n) => ({ id: n.id, docTokens: indexOf(nodeText(n)).tokens, raw: nodeText(n) })))
  const entities = scoreEntities(qt).slice(0, limit)

  // 细排：候选断言 = 命中的实体相关断言 ∪ 直接命中的断言（保证"谈到的实体还没登记成 node"也能命中）
  const scoreAssertions = buildScorer(actives.map((a) => ({ id: a.id, docTokens: indexOf(assertionText(a)).tokens, raw: assertionText(a) })))
  const directHits = scoreAssertions(qt)
  const entityIds = new Set(entities.map((e) => e.id))
  const incident = actives.filter((a) => entityIds.has(String(a.s)) || (typeof a.o === 'string' && entityIds.has(a.o))).length
  const assertions = directHits.slice(0, aLimit)

  const focus: string[] = []
  const push = (id: string): void => { if (id.length > 0 && !focus.includes(id)) focus.push(id) }
  for (const e of entities) push(e.id)
  for (const hit of assertions) {
    const a = actives.find((x) => x.id === hit.id)
    if (a === undefined) continue
    push(String(a.s))
    if (typeof a.o === 'string') push(a.o)
  }

  return {
    entities,
    assertions,
    focus: focus.slice(0, limit),
    noSignal: entities.length === 0 && directHits.length === 0 && incident === 0,
  }
}