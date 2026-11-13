/**
 * 本体注入门（纯判定）：L0 精确层 → 旧 L1 dense top1 阈值门。
 *
 * 这道门只决定“要不要把本体术语交给模型”，不决定“要不要回答”。
 * - L0 只认**具体表面形式**（多词名称、登记别名、物理 FQN、表名）；单字通用词
 *   （Order / Customer / Product …）在长句里不算精确命中，避免 “order of operations”
 *   这类误命中。
 * - L0 能自足（整个问题就是术语查询、或 2–3 个明确术语）时短路，不走向量；
 *   否则把精确命中作为种子交给 L1。
 * - L1 用 dense top1 与冻结阈值比较：低于阈值 → 整题不注入；高于阈值 → 交给 Jev 重排。
 * - gateVersion=auto-clarify-v1 的“非 exact 先澄清”由 term-retrieve 分流，不经过本判定。
 *
 * 纯计算：无 IO、无时钟、无随机、不调模型。dense/Jev 由调用方注入端口。
 */
import type { Assertion, Node } from './types.js'
import { enrichNodes } from './terms.js'

export type ExactKind = 'label' | 'alias' | 'table' | 'column' | 'id'

export interface ExactTermMatch {
  /** auto:term:<id> */
  termId: string
  surface: string
  kind: ExactKind
  /** 0..1；单字通用词在长句里会被降到 0.45 以下 */
  specificity: number
  confident: boolean
  /** 表名映射到 >2 个术语；此命中不参与精确短路 */
  ambiguous?: boolean
}

export interface ExactMatchResult {
  /** 按 specificity / 长度排序；保留全部命中供审计 */
  matches: ExactTermMatch[]
  /** 去重后的候选术语；自足时为全部命中，否则为可信种子 */
  termIds: string[]
  /** 精确层是否足以短路 dense/Jev */
  selfSufficient: boolean
  /** 表名命中映射到多个术语时置 true；此时不短路，交给 dense 消歧 */
  ambiguousTable: boolean
  /** 归一化后的问题文本（审计用） */
  query: string
  /** 自足/不自足的原因码（审计用） */
  reason: 'self_sufficient' | 'no_match' | 'weak_only' | 'ambiguous_table' | 'residual_terms'
}

export type InjectionStage = 'exact' | 'dense' | 'blocked' | 'ambiguous'

export interface InjectionDecision {
  stage: InjectionStage
  /** auto:term:<id>；blocked 时为空 */
  candidates: string[]
  exact: ExactMatchResult
  denseTop1: number | null
  /** Jev 门模式下的 top1；dense 门模式为 null */
  jevTop1: number | null
  threshold: number
  thresholdVersion: string
  gateOn: 'dense' | 'jev'
  reason: 'exact_match' | 'dense_above_threshold' | 'dense_below_threshold' | 'dense_unavailable'
    | 'jev_above_threshold' | 'jev_below_threshold' | 'jev_unavailable'
    | 'ambiguous_candidates'
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
const isAscii = (s: string): boolean => !/[^\x00-\x7f]/.test(s)

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

/** 单字通用术语：在长句里出现不等于“用户在问这个术语”。 */
const GENERIC = new Set([
  'order', 'customer', 'product', 'supplier', 'shipment', 'warehouse', 'agent', 'queue',
  'bundle', 'brand', 'ticket', 'invoice', 'payment', 'refund', 'revenue', 'margin', 'status',
  'priority', 'quantity', 'price', 'discount', 'item', 'case', 'account', 'units', 'client',
  'vendor', 'category', 'service', 'credit', 'score', 'model', 'metric',
  'amount', 'reason', 'channel', 'method', 'number', 'currency', 'email', 'region', 'tier', 'segment', 'rating',
])

/** 查询框架词：判断“精确命中后还剩多少实质内容”。 */
const STOPWORDS = new Set([
  'define', 'what', 'which', 'who', 'how', 'is', 'are', 'was', 'were', 'does', 'do', 'did',
  'the', 'a', 'an', 'of', 'for', 'in', 'on', 'at', 'to', 'by', 'with', 'and', 'or', 'per',
  'across', 'show', 'tell', 'me', 'explain', 'give', 'sql', 'expression', 'column', 'field',
  'table', 'term', 'metric', 'certified', 'governed', 'ontology', 'compute', 'computed',
  'calculated', 'definition', 'meaning', 'mean', 'include', 'includes', 'used', 'uses', 'use',
  'value', 'values', 'data', 'please', 'can', 'you', 'i', 'we', 'our', 'it', 'this', 'that',
  'these', 'those', 'join', 'compare', 'versus', 'vs', 'group', 'grouped', 'list', 'find', 'get',
  'fully', 'qualified', 'references', 'reference', 'exists', 'belongs', 'own', 'owns', 'responsible',
  'represent', 'represents', 'maps', 'map', 'owned',
  'last', 'this', 'current', 'previous', 'next', 'recent', 'quarter', 'month', 'year', 'week', 'day',
  'today', 'yesterday', 'tomorrow', 'ytd', 'mtd', 'q1', 'q2', 'q3', 'q4',
  'see', 'each', 'every', 'from', 'into', 'about', 'under', 'between',
  'received', 'receive', 'issued', 'handled', 'handle', 'applies', 'applied', 'holds', 'hold',
  'provides', 'provide', 'billed', 'billing', 'lines', 'items', 'item',
])

const CJK_STOP = new Set([...'的了吗呢是什么怎么如何哪哪些定义含义解释请问帮我一下在有和与按连接关联分组统计计算查询字段表术语口径取值多少上限目标存在张个这那它'])

/** 定义式问法：只认“整句就是在问这个术语”，不认任意以 what is 开头的长句。 */
function isDefinitional(query: string, surface: string): boolean {
  const q = query.replace(/[?!.。？]+$/g, '').trim()
  const s = norm(surface)
  if (s.length === 0) return false
  const exact = new Set([
    'define ' + s,
    'what is ' + s,
    'what is a ' + s,
    'what is an ' + s,
    'what is the ' + s,
    'what are ' + s,
    'what does ' + s + ' mean',
    'explain ' + s,
    'tell me about ' + s,
    'show me ' + s,
    'show me the ' + s,
    'which term represents the ' + s + ' table',
    'which certified term represents the ' + s + ' table',
    'which term is responsible for the ' + s + ' table',
    'which term owns the ' + s + ' table',
    'how is ' + s + ' computed',
    'how is ' + s + ' calculated',
    'how is ' + s + ' defined',
  ])
  if (exact.has(q)) return true
  if (q.startsWith('define ' + s) && q.slice(('define ' + s).length).trim().length <= 4) return true
  return false
}

interface SurfaceEntry {
  termId: string
  surface: string
  kind: ExactKind
  base: number
  /** 表名映射到多个术语时为 true */
  ambiguous?: boolean
}

function surfaceEntries(nodes: Node[], assertions: Assertion[]): SurfaceEntry[] {
  const enriched = enrichNodes(nodes, assertions)
  const index = indexBySubject(assertions)
  const entries: SurfaceEntry[] = []
  const seen = new Set<string>()
  const add = (termId: string, surface: string, kind: ExactKind, base: number, ambiguous = false): void => {
    const key = termId + '|' + kind + '|' + surface
    if (seen.has(key) || surface.trim().length < 2) return
    seen.add(key)
    entries.push({ termId, surface, kind, base, ...(ambiguous ? { ambiguous } : {}) })
  }

  const terms = enriched.filter((n) => n.id.startsWith('auto:term:'))
  for (const term of terms) {
    const forms = new Set([...(term.labels ?? []), ...(term.aliases ?? [])].map((x) => x.trim()).filter(Boolean))
    for (const form of forms) add(term.id, form, 'label', 0.9)
    add(term.id, term.id, 'id', 0.7)
  }

  for (const table of enriched.filter((n) => n.id.startsWith('auto:table:'))) {
    const owners = terms.filter((t) => objectsOf(index, t.id, 'represents_table').includes(table.id))
    const ambiguous = owners.length > 2
    // 表名命中多术语时不制造一堆候选；按术语名与表名的词面接近度取前 2 个
    const tableLabel = norm((table.labels ?? [])[0] ?? '')
    const ranked = owners.map((t) => {
      const label = norm((t.labels ?? [])[0] ?? '')
      const singular = tableLabel.endsWith('s') ? tableLabel.slice(0, -1) : tableLabel
      const score = label === singular || label === tableLabel ? 1
        : label.includes(singular) || singular.includes(label) ? 0.8
          : 0.4
      return { t, score }
    }).sort((a, b) => b.score - a.score || a.t.id.localeCompare(b.t.id))
    for (const { t } of ranked.slice(0, ambiguous ? 1 : 2)) {
      for (const label of table.labels ?? []) add(t.id, label, 'table', 0.85, ambiguous)
    }
  }

  for (const column of enriched.filter((n) => n.id.startsWith('auto:column:'))) {
    const owners = new Set<string>()
    for (const term of terms) {
      for (const attr of objectsOf(index, term.id, 'has_attribute')) {
        if (objectsOf(index, attr, 'maps_to_column').includes(column.id)) owners.add(term.id)
      }
      for (const sql of objectsOf(index, term.id, 'has_sql_attribute')) {
        if (objectsOf(index, sql, 'uses_column').includes(column.id)) owners.add(term.id)
      }
    }
    if (owners.size === 0) {
      for (const table of objectsOf(index, column.id, 'belongs_to_table')) {
        for (const term of terms) if (objectsOf(index, term.id, 'represents_table').includes(table)) owners.add(term.id)
      }
    }
    for (const physical of objectsOf(index, column.id, 'physical_name')) {
      for (const owner of owners) add(owner, physical, 'column', 1)
      const last = physical.split('.').pop()
      if (last !== undefined && last !== physical && last.length >= 5) for (const owner of owners) add(owner, last, 'column', 0.8)
    }
  }
  return entries
}

function occurrences(text: string, needle: string): number[] {
  if (needle.length === 0) return []
  if (!isAscii(needle)) {
    const out: number[] = []
    let i = text.indexOf(needle)
    while (i >= 0) { out.push(i); i = text.indexOf(needle, i + 1) }
    return out
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('(^|[^a-z0-9_])(' + escaped + ')(?=$|[^a-z0-9_])', 'g')
  const out: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m.index + m[1]!.length)
    if (m.index === re.lastIndex) re.lastIndex += 1
  }
  return out
}

/** L0：具体表面形式命中；不调模型。 */
export function matchExactTerms(input: { task: string; nodes: Node[]; assertions: Assertion[] }): ExactMatchResult {
  const query = norm(input.task)
  const entries = surfaceEntries(input.nodes, input.assertions)
  const matches: ExactTermMatch[] = []

  for (const entry of entries) {
    const surface = norm(entry.surface)
    if (surface.length < 2 || occurrences(query, surface).length === 0) continue
    const bare = query === surface
    const definitional = isDefinitional(query, entry.surface)
    const singular = surface.endsWith('s') ? surface.slice(0, -1) : surface
    const generic = !surface.includes(' ') && !surface.includes('_') && !surface.includes('.') && (GENERIC.has(surface) || GENERIC.has(singular))
    const penalty = generic && !bare && !definitional ? 0.45 : 1
    const specificity = Number((entry.base * penalty).toFixed(3))
    const confident = specificity >= 0.7
    matches.push({ termId: entry.termId, surface: entry.surface, kind: entry.kind, specificity, confident, ...(entry.ambiguous === true ? { ambiguous: true } : {}) })
  }

  // 最长匹配优先：Customer ID 命中时不再保留泛词 Customer。
  // 但关系型问法（Join Order with Order Line）里，Order 是独立术语，不能被 Order Line 吞掉。
  const relational = /\b(join|with|and|vs|versus|compare|by|per|across)\b|关联|连接|和|与|按/.test(query)
  const kept = matches.filter((m) => !matches.some((other) =>
    !relational && other !== m && other.confident && norm(other.surface).length > norm(m.surface).length &&
    norm(other.surface).includes(norm(m.surface))))
  kept.sort((a, b) => b.specificity - a.specificity || b.surface.length - a.surface.length || a.termId.localeCompare(b.termId))
  const ambiguousTable = kept.some((m) => m.ambiguous === true)

  const confident = kept.filter((m) => m.confident)
  const confidentTerms = new Set(confident.map((m) => m.termId))
  const allTerms = new Set(kept.map((m) => m.termId))
  const best = kept[0]
  const definitional = kept.some((m) => isDefinitional(query, m.surface))

  let reason: ExactMatchResult['reason'] = 'no_match'
  let selfSufficient = false
  if (kept.length === 0) reason = 'no_match'
  else if (confident.length === 0) reason = 'weak_only'
  else if (ambiguousTable) reason = 'ambiguous_table'
  else if (confidentTerms.size >= 2) {
    const terms = [...allTerms]
    // 精确层只短路“少量明确术语”；大候选集交给 dense 消歧
    selfSufficient = terms.length <= 3
    reason = selfSufficient ? 'self_sufficient' : 'residual_terms'
  } else if (best !== undefined && norm(best.surface) === query) {
    selfSufficient = true; reason = 'self_sufficient'
  } else if (definitional) {
    selfSufficient = true; reason = 'self_sufficient'
  } else {
    // 去掉命中表面与查询框架词，剩余实词很少才视为自足
    let rest = query
    for (const m of kept) rest = rest.split(norm(m.surface)).join(' ')
    const matchedTokens = new Set(kept.flatMap((m) => norm(m.surface).split(/[^a-z0-9_]+/)).filter((t) => t.length > 0))
    const restTokens = rest.toLowerCase().split(/[^a-z0-9_\u4e00-\u9fff]+/)
      .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !matchedTokens.has(t))
    const cjkRest = rest.replace(/[^\u4e00-\u9fff]/g, '').split('').filter((ch) => !CJK_STOP.has(ch))
    if (restTokens.length === 0 && cjkRest.length <= 2) { selfSufficient = true; reason = 'self_sufficient' }
    else reason = 'residual_terms'
  }

  // 自足时带上全部命中（含通用词，如 Join Net Revenue with Customer 的 Customer）；
  // 不自足时只给可信种子，避免把泛词噪声塞给 dense。
  const termIds = [...new Set((selfSufficient ? kept : confident).map((m) => m.termId))]
  return {
    matches: kept,
    termIds: termIds.slice(0, 6),
    selfSufficient,
    ambiguousTable,
    query,
    reason,
  }
}

/** L1 判定：dense 可用且 top1 低于阈值 → 全拦；否则放行（交给 Jev/编译）。 */
export function decideInjection(input: {
  exact: ExactMatchResult
  denseAvailable: boolean
  denseTop1?: number | null
  threshold: number
  thresholdVersion?: string
  /** 低于阈值但仍有 2+ 个可信候选时，转澄清而不是直接拦。 */
  ambiguousCandidates?: readonly string[]
}): InjectionDecision {
  const base = {
    exact: input.exact,
    threshold: input.threshold,
    thresholdVersion: input.thresholdVersion ?? 'unversioned',
    gateOn: 'dense' as const,
    jevTop1: null,
  }
  if (input.exact.selfSufficient) {
    return { ...base, stage: 'exact', candidates: input.exact.termIds, denseTop1: input.denseTop1 ?? null, reason: 'exact_match' }
  }
  if (!input.denseAvailable) {
    return { ...base, stage: 'dense', candidates: input.exact.termIds, denseTop1: null, reason: 'dense_unavailable' }
  }
  const top1 = input.denseTop1
  if (top1 === null || top1 === undefined || !Number.isFinite(top1)) {
    return { ...base, stage: 'dense', candidates: input.exact.termIds, denseTop1: null, reason: 'dense_unavailable' }
  }
  if (top1 < input.threshold) {
    const ambiguous = [...new Set(input.ambiguousCandidates ?? [])]
    if (ambiguous.length >= 2) {
      return { ...base, stage: 'ambiguous', candidates: ambiguous, denseTop1: top1, reason: 'ambiguous_candidates' }
    }
    return { ...base, stage: 'blocked', candidates: [], denseTop1: top1, reason: 'dense_below_threshold' }
  }
  return { ...base, stage: 'dense', candidates: input.exact.termIds, denseTop1: top1, reason: 'dense_above_threshold' }
}

/** Jev 门：精确层短路；否则先跑 Jev，再看 jevTop1 是否过阈值。 */
export function decideJevInjection(input: {
  exact: ExactMatchResult
  jevTop1?: number | null
  threshold: number
  thresholdVersion?: string
  /** 低于阈值但仍有 2+ 个可信候选时，转澄清而不是直接拦。 */
  ambiguousCandidates?: readonly string[]
}): InjectionDecision {
  const base = {
    exact: input.exact,
    threshold: input.threshold,
    thresholdVersion: input.thresholdVersion ?? 'unversioned',
    gateOn: 'jev' as const,
    denseTop1: null,
    jevTop1: input.jevTop1 ?? null,
  }
  if (input.exact.selfSufficient) {
    return { ...base, stage: 'exact', candidates: input.exact.termIds, reason: 'exact_match' }
  }
  const top1 = input.jevTop1
  if (top1 === null || top1 === undefined || !Number.isFinite(top1)) {
    return { ...base, stage: 'blocked', candidates: [], reason: 'jev_unavailable' }
  }
  if (top1 < input.threshold) {
    const ambiguous = [...new Set(input.ambiguousCandidates ?? [])]
    if (ambiguous.length >= 2) {
      return { ...base, stage: 'ambiguous', candidates: ambiguous, reason: 'ambiguous_candidates' }
    }
    return { ...base, stage: 'blocked', candidates: [], reason: 'jev_below_threshold' }
  }
  return { ...base, stage: 'dense', candidates: input.exact.termIds, reason: 'jev_above_threshold' }
}
