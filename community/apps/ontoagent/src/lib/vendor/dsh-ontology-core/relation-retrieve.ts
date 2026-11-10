/**
 * 关系检索：稠密 top-40 → Jev/共享 JudgePort 重排 top-10 → 候选子图；
 * Jev 不可用降级稠密 top-20；稠密不可用降级词面检索。三臂显式标记，绝不伪装成同一臂。
 *
 * 纯编排：模型/嵌入调用走注入端口；本模块不 import 网络/SDK，不写 Store，不签发 accepted。
 * 依据：ADR-0011 §5、ADR-0009 的 top40→top10 实验、task-benchmark-first-run 的关系召回曲线。
 */
import type { RelationEdge, RelationIndex } from './relations.js'
import { tokenize } from './retrieve.js'

/** 宿主嵌入端口：批量文本 → 向量。真实实现经 agentgateway；测试用确定性假实现。 */
export type DenseVector = number[] | Float32Array | Float64Array
export interface DenseRecallPort {
  embed(texts: string[]): Promise<DenseVector[]> | DenseVector[]
  /** 上一次 embed 实际调用底层嵌入的文本数（缓存实现填；用于成本口径） */
  readonly lastEmbedded?: number
}

/** 按文本内容缓存的嵌入端口：文档按文本缓存，查询（最后一个文本）每次重嵌。 */
export function createCachedDensePort(port: DenseRecallPort): DenseRecallPort & { clear: () => void } {
  const cache = new Map<string, DenseVector>()
  let lastEmbedded = 0
  const cached = {
    get lastEmbedded() { return lastEmbedded },
    async embed(texts: string[]): Promise<DenseVector[]> {
      if (texts.length === 0) { lastEmbedded = 0; return [] }
      const query = texts[texts.length - 1]!
      const docs = texts.slice(0, -1)
      const missing = [...new Set(docs.filter((t) => !cache.has(t)))]
      const toEmbed = [...missing, query]
      lastEmbedded = toEmbed.length
      const out = await port.embed(toEmbed)
      if (!Array.isArray(out) || out.length !== toEmbed.length) throw new Error('dense_invalid')
      missing.forEach((t, i) => cache.set(t, out[i]!))
      return [...docs.map((t) => cache.get(t)!), out[out.length - 1]!]
    },
    clear(): void { cache.clear(); lastEmbedded = 0 },
  }
  return cached
}

/** 共享模型判定端口（ADR-0011 §8）：noul / choice / score 三种受约束判定。 */
export type JudgeMode = 'noul' | 'choice' | 'score'

export interface JudgeCandidate { id: string; text: string }

export interface JudgeScore {
  id: string
  score: number
  /** choice 模式下的选项；score/noul 模式可省略 */
  choice?: string
  rationale?: string
}

export interface JudgeRequest {
  mode: JudgeMode
  question: string
  candidates: JudgeCandidate[]
  /** 调用的硬约束（topK、索引版本等）；端口不得据此生成新结构或授权 */
  constraints?: Record<string, unknown>
}

export interface JudgePort {
  judge(request: JudgeRequest): Promise<JudgeScore[]> | JudgeScore[]
}

export type RetrievalArm = 'jev' | 'dense' | 'lexical'

export interface RelationHit {
  id: string
  score: number
  edge: RelationEdge
  stage: 'dense' | 'jev' | 'lexical'
}

export interface RelationRetrieval {
  arm: RetrievalArm
  indexVersion: string
  /** 最终注入的候选子图边（<= rerankLimit 或 fallbackLimit） */
  hits: RelationHit[]
  /** 稠密粗筛候选（审计/指标用） */
  candidates: RelationHit[]
  degraded: boolean
  reason?: string
  noSignal: boolean
  cost: { embedded: number; judged: number; injected: number; chars: number }
}

export interface RelationRetrievalInput {
  query: string
  index: RelationIndex
  dense?: DenseRecallPort
  judge?: JudgePort
  /** 稠密粗筛条数，默认 40 */
  denseLimit?: number
  /** 重排后注入条数，默认 10 */
  rerankLimit?: number
  /** 降级注入条数，默认 20 */
  fallbackLimit?: number
  /** 稠密不可用时是否允许退回词面检索，默认 true */
  allowLexical?: boolean
  /** 稠密余弦下限（排除近正交噪声，默认 0.02；不是按分数落差切 K） */
  minDenseScore?: number
}

const DEFAULT_DENSE = 40
const DEFAULT_RERANK = 10
const DEFAULT_FALLBACK = 20

const finite = (x: number): boolean => Number.isFinite(x)

function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0; let na = 0; let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] as number; const y = b[i] as number
    dot += x * y; na += x * x; nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

type DenseOutcome =
  | { ok: true; hits: RelationHit[]; embedded: number }
  | { ok: false; reason: string; embedded: number }

async function denseRecall(
  input: RelationRetrievalInput, limit: number,
): Promise<DenseOutcome> {
  const port = input.dense
  if (port === undefined) return { ok: false, reason: 'dense_unavailable', embedded: 0 }
  const minDenseScore = input.minDenseScore ?? 0.02
  const edges = input.index.edges
  const texts = [...edges.map((e) => e.text), input.query]
  try {
    const raw = await port.embed(texts)
    if (!Array.isArray(raw) || raw.length !== texts.length) {
      return { ok: false, reason: 'dense_invalid', embedded: texts.length }
    }
    const vectors = raw.map((v) => {
      if (!Array.isArray(v) && !(v instanceof Float32Array) && !(v instanceof Float64Array)) return null
      const arr = Array.from(v as ArrayLike<number>)
      return arr.length === 0 || arr.some((x) => !finite(x)) ? null : arr
    })
    if (vectors.some((v) => v === null)) {
      return { ok: false, reason: 'dense_invalid', embedded: texts.length }
    }
    const embedded = port.lastEmbedded ?? texts.length
    const queryVec = vectors[vectors.length - 1] as number[]
    const dim = queryVec.length
    if (vectors.some((v) => (v as number[]).length !== dim)) {
      return { ok: false, reason: 'dense_invalid', embedded: texts.length }
    }
    const hits: RelationHit[] = []
    for (let i = 0; i < edges.length; i += 1) {
      const score = cosine(vectors[i] as number[], queryVec)
      if (score >= minDenseScore && finite(score)) {
        hits.push({ id: edges[i]!.id, score, edge: edges[i]!, stage: 'dense' })
      }
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    return { ok: true, hits: hits.slice(0, limit), embedded }
  } catch {
    return { ok: false, reason: 'dense_error', embedded: texts.length }
  }
}

function lexicalRelations(query: string, edges: RelationEdge[], limit: number): RelationHit[] {
  const qt = [...new Set(tokenize(query))]
  if (qt.length === 0) return []
  const docs = edges.map((e) => ({ edge: e, tokens: new Set(tokenize(e.text)) }))
  const df = new Map<string, number>()
  for (const d of docs) for (const t of d.tokens) df.set(t, (df.get(t) ?? 0) + 1)
  const N = docs.length === 0 ? 1 : docs.length
  const idf = (t: string): number => Math.log(1 + N / (1 + (df.get(t) ?? 0)))
  const hits: RelationHit[] = []
  for (const d of docs) {
    let score = 0
    for (const t of qt) if (d.tokens.has(t)) score += idf(t)
    if (score > 0) hits.push({ id: d.edge.id, score, edge: d.edge, stage: 'lexical' })
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  return hits.slice(0, limit)
}

function costOf(hits: RelationHit[], embedded: number, judged: number): RelationRetrieval['cost'] {
  return {
    embedded,
    judged,
    injected: hits.length,
    chars: hits.reduce((s, h) => s + h.edge.text.length, 0),
  }
}

/**
 * 两段式关系检索。返回的是**候选子图**，不是 Packet/accepted；
 * 调用方可用 `relationFocus` 取焦点再切片。
 */
export async function retrieveRelations(
  input: RelationRetrievalInput,
): Promise<RelationRetrieval> {
  const denseLimit = input.denseLimit ?? DEFAULT_DENSE
  const rerankLimit = input.rerankLimit ?? DEFAULT_RERANK
  const fallbackLimit = input.fallbackLimit ?? DEFAULT_FALLBACK
  const allowLexical = input.allowLexical ?? true
  const minDenseScore = input.minDenseScore ?? 0.02
  const edges = input.index.edges
  const empty = (arm: RetrievalArm, reason: string, embedded = 0): RelationRetrieval => ({
    arm, indexVersion: input.index.version, hits: [], candidates: [],
    degraded: arm !== 'jev', reason, noSignal: true,
    cost: costOf([], embedded, 0),
  })
  if (edges.length === 0) return empty('dense', 'empty_index')

  const dense = await denseRecall(input, denseLimit)
  const candidates = dense.ok ? dense.hits : []

  const fallbackDense = (reason: string): RelationRetrieval => {
    const hits = candidates.slice(0, fallbackLimit)
    return {
      arm: 'dense', indexVersion: input.index.version, hits, candidates,
      degraded: true, reason, noSignal: hits.length === 0,
      cost: costOf(hits, dense.embedded, 0),
    }
  }
  const fallbackLexical = (reason: string): RelationRetrieval => {
    const hits = allowLexical ? lexicalRelations(input.query, edges, fallbackLimit) : []
    return {
      arm: 'lexical', indexVersion: input.index.version, hits, candidates,
      degraded: true, reason, noSignal: hits.length === 0,
      cost: costOf(hits, dense.embedded, 0),
    }
  }

  if (!dense.ok) return fallbackLexical((dense as { reason?: string }).reason ?? 'dense_failed')
  if (candidates.length === 0) {
    const lex = allowLexical ? lexicalRelations(input.query, edges, fallbackLimit) : []
    if (lex.length > 0) {
      return {
        arm: 'lexical', indexVersion: input.index.version, hits: lex, candidates: [],
        degraded: true, reason: 'dense_empty', noSignal: false,
        cost: costOf(lex, dense.embedded, 0),
      }
    }
    return empty('dense', 'dense_empty', dense.embedded)
  }

  if (input.judge === undefined) return fallbackDense('judge_unavailable')
  const judgeCandidates = candidates.map((h) => ({ id: h.id, text: h.edge.text }))
  let judged: JudgeScore[]
  try {
    judged = await input.judge.judge({
      mode: 'score',
      question: input.query,
      candidates: judgeCandidates,
      constraints: { topK: rerankLimit, indexVersion: input.index.version },
    })
  } catch {
    return fallbackDense('judge_error')
  }
  if (!Array.isArray(judged)) return fallbackDense('judge_invalid')
  const byId = new Map(candidates.map((h) => [h.id, h]))
  const best = new Map<string, number>()
  for (const j of judged) {
    if (typeof j?.id !== 'string' || typeof j.score !== 'number' || !finite(j.score)) continue
    if (!byId.has(j.id)) continue
    const prev = best.get(j.id)
    if (prev === undefined || j.score > prev) best.set(j.id, j.score)
  }
  if (best.size === 0) return fallbackDense('judge_empty')
  const hits: RelationHit[] = [...best.entries()]
    .map(([id, score]) => ({ id, score, edge: byId.get(id)!.edge, stage: 'jev' as const }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, rerankLimit)
  return {
    arm: 'jev', indexVersion: input.index.version, hits, candidates,
    degraded: false, noSignal: false,
    cost: costOf(hits, dense.embedded, judgeCandidates.length),
  }
}
