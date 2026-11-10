/**
 * 术语检索编排（纯编排，端口注入）：
 *   L0 精确层（自足则短路）
 *   → 旧门：dense top40，top1 阈值决定是否注入，Jev 重排 top10
 *   → auto-clarify-v1：dense top40，按 0.25 候选下限过滤，Jev 重排 top10，
 *     非 exact 一律澄清，不自动注入
 *
 * 不 import 网络/SDK；dense/Jev 走注入端口。失败返回 degraded，不回退 lexical。
 */
import type { Assertion, Node } from './types.js'
import { buildTermDocuments, type TermDocument } from './term-documents.js'
import { decideInjection, decideJevInjection, matchExactTerms, type ExactMatchResult, type InjectionDecision } from './retrieval-gate.js'
import { buildClarificationOptions, hasClarificationEvidence, type ClarificationRequest } from './clarification.js'
import { tokenize } from './retrieve.js'
import type { DenseRecallPort, JudgePort } from './relation-retrieve.js'

export interface TermRetrievalOptions {
  task: string
  nodes: Node[]
  assertions: Assertion[]
  dense: DenseRecallPort
  judge?: JudgePort
  /** 注入门基于哪个分数：dense top1（默认）或 Jev top1；clarifyFirst 时固定 dense */
  gateOn?: 'dense' | 'jev'
  /** 门阈值；clarifyFirst 时由冻结常量覆盖，仅旧门使用该值 */
  threshold: number
  thresholdVersion?: string
  denseLimit?: number
  rerankLimit?: number
  /**
   * auto-clarify-v1：非 exact 不自动注入。
   * dense top40 → 0.25 候选下限 → Jev 重排 top10 → 有足够候选则澄清。
   * 旧调用方不传，保持原 dense/Jev 门行为。
   */
  clarifyFirst?: boolean
  /** 调用方按版本缓存的术语文档；不传则现算 */
  documents?: TermDocument[]
  /** 模糊候选的分数下限；默认 threshold - 0.12，低于它不澄清。仅旧门使用。 */
  ambiguityFloor?: number
}

/** auto-clarify-v1 冻结的 dense 候选下限；由既有 dev 阈值 0.39 与澄清 floor 差额 0.14 得到。 */
export const CLARIFY_FIRST_DENSE_FLOOR = 0.25
/** auto-clarify-v1 冻结的 dense 召回与 Jev 重排上限。 */
export const CLARIFY_FIRST_DENSE_LIMIT = 40
export const CLARIFY_FIRST_RERANK_LIMIT = 10
/** auto-clarify-v1 冻结的澄清选项上限。 */
export const CLARIFY_FIRST_MAX_OPTIONS = 3

export interface DenseTermHit { termId: string; nodeId: string; score: number }

export interface TermRetrieval {
  stage: 'exact' | 'dense' | 'blocked' | 'ambiguous'
  /** auto:term:<id>；blocked/degraded 时为空；ambiguous 时为澄清选项 */
  candidates: string[]
  exact: ExactMatchResult
  decision: InjectionDecision
  denseHits: DenseTermHit[]
  denseTop1: number | null
  jevTop1: number | null
  jevCandidateCount: number
  degraded: boolean
  reason?: string
  /** 歧义澄清请求；有值时 candidates 是选项，不是已注入事实 */
  clarification?: ClarificationRequest
  cost: { embedded: number; judged: number }
}

const cosine = (a: readonly number[], b: readonly number[]): number => {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0; let na = 0; let nb = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!; const y = b[i]!
    dot += x * y; na += x * x; nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

const validVectors = (vectors: number[][], length: number): boolean => {
  if (vectors.length !== length) return false
  const dim = vectors[0]?.length ?? 0
  if (dim === 0) return false
  return vectors.every((v) => v.length === dim && v.every((x) => Number.isFinite(x)))
}

export async function retrieveTerms(input: TermRetrievalOptions): Promise<TermRetrieval> {
  const clarifyFirst = input.clarifyFirst === true
  const denseLimit = clarifyFirst ? CLARIFY_FIRST_DENSE_LIMIT : (input.denseLimit ?? 40)
  const rerankLimit = clarifyFirst ? CLARIFY_FIRST_RERANK_LIMIT : (input.rerankLimit ?? 10)
  const gateOn = clarifyFirst ? 'dense' as const : (input.gateOn ?? 'dense')
  const threshold = clarifyFirst ? CLARIFY_FIRST_DENSE_FLOOR : input.threshold
  const thresholdVersion = input.thresholdVersion ?? 'unversioned'
  const docs = input.documents ?? buildTermDocuments(input.nodes, input.assertions)
  const exact = matchExactTerms({ task: input.task, nodes: input.nodes, assertions: input.assertions })
  const ambiguityFloor = input.ambiguityFloor ?? Math.max(0, threshold - 0.14)
  const clarifyFrom = (termIds: readonly string[]): ClarificationRequest | undefined => {
    // 草稿/未认证问题不问“选哪个认证术语”，直接走未覆盖；避免把未认证意图误引导成认证口径。
    if (/draft|uncertified|未认证|草稿|待认证/i.test(input.task)) return undefined
    if (termIds.length < 2) return undefined
    const options = buildClarificationOptions({
      nodes: input.nodes, assertions: input.assertions, termIds,
      limit: CLARIFY_FIRST_MAX_OPTIONS,
      ...(clarifyFirst ? { preserveOrder: true } : { query: input.task }),
    })
    if (options.length < 2) return undefined
    // auto-clarify-v1：dense top40 → 0.25 → Jev top10 的候选即澄清证据；不再要求词面重叠。
    if (!clarifyFirst && !hasClarificationEvidence(input.task, options, tokenize)) return undefined
    return {
      question: clarifyFirst ? '你指的是哪些术语/字段？可选择一项或多项。' : '你指的是哪一个术语/字段？',
      options,
      allowNone: true,
    }
  }

  if (exact.selfSufficient) {
    const decision = gateOn === 'jev'
      ? decideJevInjection({ exact, jevTop1: null, threshold, thresholdVersion })
      : decideInjection({ exact, denseAvailable: true, denseTop1: null, threshold, thresholdVersion })
    return {
      stage: 'exact', candidates: exact.termIds, exact, decision,
      denseHits: [], denseTop1: null, jevTop1: null, jevCandidateCount: 0,
      degraded: false, reason: 'exact_match', cost: { embedded: 0, judged: 0 },
    }
  }

  if (docs.length === 0) {
    const decision = decideInjection({
      exact, denseAvailable: true, denseTop1: null, threshold, thresholdVersion,
    })
    return {
      stage: 'blocked', candidates: [], exact, decision,
      denseHits: [], denseTop1: null, jevTop1: null, jevCandidateCount: 0,
      degraded: true, reason: 'empty_index', cost: { embedded: 0, judged: 0 },
    }
  }

  let denseHits: DenseTermHit[]
  let denseTop1: number
  let embedded = 0
  try {
    const texts = [...docs.map((d) => d.text), input.task]
    const raw = await input.dense.embed(texts)
    if (!Array.isArray(raw)) throw new Error('dense_invalid')
    const vectors = raw.map((v) => Array.from(v as ArrayLike<number>))
    if (!validVectors(vectors, texts.length)) throw new Error('dense_invalid')
    embedded = input.dense.lastEmbedded ?? texts.length
    const docVectors = vectors.slice(0, -1)
    const query = vectors[vectors.length - 1]!
    const scored = docs.map((doc, i) => ({ termId: doc.nodeId, nodeId: doc.nodeId, score: cosine(docVectors[i]!, query) }))
    scored.sort((a, b) => b.score - a.score || a.termId.localeCompare(b.termId))
    denseHits = scored.slice(0, denseLimit)
    denseTop1 = denseHits[0]?.score ?? 0
  } catch (err) {
    const decision = decideInjection({
      exact, denseAvailable: true, denseTop1: null, threshold, thresholdVersion,
    })
    return {
      stage: 'blocked', candidates: [], exact, decision,
      denseHits: [], denseTop1: null, jevTop1: null, jevCandidateCount: 0,
      degraded: true, reason: 'dense_error:' + String((err as Error)?.message ?? err).slice(0, 160),
      cost: { embedded, judged: 0 },
    }
  }

  const docText = new Map(docs.map((d) => [d.nodeId, d.text]))
  const denseCandidates = denseHits.slice(0, rerankLimit).map((h) => h.termId)

  const scoreWithJudge = async (candidates: readonly DenseTermHit[] = denseHits): Promise<{ reranked: string[]; jevTop1: number }> => {
    const scored = await input.judge!.judge({
      mode: 'score',
      question: input.task,
      candidates: candidates.map((h) => ({ id: h.termId, text: docText.get(h.termId) ?? h.termId })),
      constraints: { topK: rerankLimit },
    })
    const rank = new Map(candidates.map((h, i) => [h.termId, i]))
    const best = new Map<string, number>()
    for (const s of scored) {
      if (typeof s?.id !== 'string' || typeof s.score !== 'number' || !Number.isFinite(s.score)) continue
      if (!rank.has(s.id)) continue
      const prev = best.get(s.id)
      if (prev === undefined || s.score > prev) best.set(s.id, s.score)
    }
    if (best.size === 0) throw new Error('jev_empty_scores')
    const reranked = [...best.entries()]
      .sort((a, b) => b[1] - a[1] || rank.get(a[0])! - rank.get(b[0])! || a[0].localeCompare(b[0]))
      .slice(0, rerankLimit)
      .map(([id]) => id)
    return { reranked, jevTop1: best.get(reranked[0]!) ?? 0 }
  }

  // auto-clarify-v1：非 exact 一律澄清；阈值只筛候选，Jev 只排序，不设注入门。
  if (clarifyFirst) {
    const decisionFor = (
      stage: InjectionDecision['stage'], reason: InjectionDecision['reason'], candidates: string[], jevTop1: number | null,
    ): InjectionDecision => ({
      exact, candidates, denseTop1, jevTop1, threshold, thresholdVersion, gateOn: 'dense', stage, reason,
    })

    if (input.judge === undefined) {
      return {
        stage: 'blocked', candidates: [], exact,
        decision: decisionFor('blocked', 'jev_unavailable', [], null),
        denseHits, denseTop1, jevTop1: null, jevCandidateCount: 0,
        degraded: true, reason: 'judge_required_for_jev_gate', cost: { embedded, judged: 0 },
      }
    }

    const eligible = denseHits.filter((h) => h.score >= CLARIFY_FIRST_DENSE_FLOOR)
    if (eligible.length === 0) {
      return {
        stage: 'blocked', candidates: [], exact,
        decision: decisionFor('blocked', 'dense_below_threshold', [], null),
        denseHits, denseTop1, jevTop1: null, jevCandidateCount: 0,
        degraded: false, reason: 'dense_below_threshold', cost: { embedded, judged: 0 },
      }
    }

    try {
      const { reranked, jevTop1 } = await scoreWithJudge(eligible)
      const clarification = clarifyFrom(reranked)
      if (clarification !== undefined) {
        const candidates = clarification.options.map((o) => o.termId)
        return {
          stage: 'ambiguous', candidates, exact,
          decision: decisionFor('ambiguous', 'ambiguous_candidates', candidates, jevTop1),
          denseHits, denseTop1, jevTop1, jevCandidateCount: eligible.length,
          degraded: false, reason: 'ambiguous_candidates', clarification,
          cost: { embedded, judged: eligible.length },
        }
      }
      // 可用候选不足或缺少词面证据：沿用 ambiguous_candidates 原因码，不新增 reason shape。
      return {
        stage: 'blocked', candidates: [], exact,
        decision: decisionFor('blocked', 'ambiguous_candidates', [], jevTop1),
        denseHits, denseTop1, jevTop1, jevCandidateCount: eligible.length,
        degraded: false, reason: 'ambiguous_candidates', cost: { embedded, judged: eligible.length },
      }
    } catch (err) {
      return {
        stage: 'blocked', candidates: [], exact,
        decision: decisionFor('blocked', 'jev_unavailable', [], null),
        denseHits, denseTop1, jevTop1: null, jevCandidateCount: eligible.length,
        degraded: true, reason: 'judge_error:' + String((err as Error)?.message ?? err).slice(0, 160),
        cost: { embedded, judged: eligible.length },
      }
    }
  }

  // Jev 门：dense 只负责 top40，最终是否注入由 Jev top1 决定。
  if (gateOn === 'jev') {
    if (input.judge === undefined) {
      const decision = decideJevInjection({
        exact, jevTop1: null, threshold, thresholdVersion,
      })
      return {
        stage: 'blocked', candidates: [], exact, decision,
        denseHits, denseTop1, jevTop1: null, jevCandidateCount: 0,
        degraded: true, reason: 'judge_required_for_jev_gate', cost: { embedded, judged: 0 },
      }
    }
    try {
      const { reranked, jevTop1 } = await scoreWithJudge()
      const jevClarify = jevTop1 < threshold && jevTop1 >= ambiguityFloor ? clarifyFrom(reranked) : undefined
      const decision = decideJevInjection({
        exact, jevTop1, threshold, thresholdVersion,
        ...(jevClarify === undefined ? {} : { ambiguousCandidates: jevClarify.options.map((o) => o.termId) }),
      })
      if (decision.stage === 'ambiguous') {
        return {
          stage: 'ambiguous', candidates: decision.candidates, exact, decision,
          denseHits, denseTop1, jevTop1, jevCandidateCount: denseHits.length,
          degraded: false, reason: decision.reason, clarification: jevClarify,
          cost: { embedded, judged: denseHits.length },
        }
      }
      if (decision.stage === 'blocked') {
        return {
          stage: 'blocked', candidates: [], exact, decision,
          denseHits, denseTop1, jevTop1, jevCandidateCount: denseHits.length,
          degraded: false, reason: decision.reason, cost: { embedded, judged: denseHits.length },
        }
      }
      const candidates = [...new Set([...decision.candidates, ...reranked])].slice(0, rerankLimit)
      return {
        stage: 'dense', candidates, exact, decision,
        denseHits, denseTop1, jevTop1, jevCandidateCount: denseHits.length,
        degraded: false, reason: 'jev_above_threshold', cost: { embedded, judged: denseHits.length },
      }
    } catch (err) {
      const decision = decideJevInjection({
        exact, jevTop1: null, threshold, thresholdVersion,
      })
      return {
        stage: 'blocked', candidates: [], exact, decision,
        denseHits, denseTop1, jevTop1: null, jevCandidateCount: denseHits.length,
        degraded: true, reason: 'judge_error:' + String((err as Error)?.message ?? err).slice(0, 160),
        cost: { embedded, judged: denseHits.length },
      }
    }
  }

  // dense 门：top1 低于阈值时不调 Jev；若仍有 2+ 个有实词证据的候选，转澄清。
  const denseClarify = denseTop1 < threshold && denseTop1 >= ambiguityFloor
    ? clarifyFrom(denseHits.slice(0, Math.max(10, rerankLimit)).map((h) => h.termId))
    : undefined
  const decision = decideInjection({
    exact, denseAvailable: true, denseTop1, threshold, thresholdVersion,
    ...(denseClarify === undefined ? {} : { ambiguousCandidates: denseClarify.options.map((o) => o.termId) }),
  })
  if (decision.stage === 'ambiguous') {
    return {
      stage: 'ambiguous', candidates: decision.candidates, exact, decision,
      denseHits, denseTop1, jevTop1: null, jevCandidateCount: 0,
      degraded: false, reason: decision.reason, clarification: denseClarify,
      cost: { embedded, judged: 0 },
    }
  }
  if (decision.stage === 'blocked') {
    return {
      stage: 'blocked', candidates: [], exact, decision,
      denseHits, denseTop1, jevTop1: null, jevCandidateCount: 0,
      degraded: false, reason: decision.reason, cost: { embedded, judged: 0 },
    }
  }

  if (input.judge === undefined) {
    const candidates = [...new Set([...decision.candidates, ...denseCandidates])].slice(0, rerankLimit)
    return {
      stage: 'dense', candidates, exact, decision,
      denseHits, denseTop1, jevTop1: null, jevCandidateCount: 0,
      degraded: false, reason: 'judge_unavailable', cost: { embedded, judged: 0 },
    }
  }

  try {
    const { reranked, jevTop1 } = await scoreWithJudge()
    const finalDecision: InjectionDecision = { ...decision, jevTop1 }
    const candidates = [...new Set([...finalDecision.candidates, ...reranked])].slice(0, rerankLimit)
    return {
      stage: 'dense', candidates, exact, decision: finalDecision,
      denseHits, denseTop1, jevTop1, jevCandidateCount: denseHits.length,
      degraded: false, reason: 'dense_above_threshold', cost: { embedded, judged: denseHits.length },
    }
  } catch (err) {
    return {
      stage: 'blocked', candidates: [], exact, decision,
      denseHits, denseTop1, jevTop1: null, jevCandidateCount: denseHits.length,
      degraded: true, reason: 'judge_error:' + String((err as Error)?.message ?? err).slice(0, 160),
      cost: { embedded, judged: denseHits.length },
    }
  }
}
