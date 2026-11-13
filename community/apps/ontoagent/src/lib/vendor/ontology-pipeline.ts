/**
 * Legacy 本体产线（P-gen / P-accum）：任务 / 语料 → candidate Delta → 增量回写。
 *
 * ADR-0018 后的产品默认是 Auto 只读镜像，不执行本模块。只有显式
 * `contextSource=legacy` 才能使用这里的生成与累积语义；Auto 故障不得转入本路径。
 *
 * 纯编排：模型调用走注入的 extract 端口（与 service 的 judge / askHuman 同构），
 * 本模块不 import 任何模型 SDK，也不读时钟/随机。
 */
import {
  asrtKey, buildRelationIndex, contentDigest, createCachedDensePort, deriveFocus, parseDelta, relationFocus, retrieve, retrieveRelations,
  type Assertion, type Delta, type DenseRecallPort, type JudgePort, type RetrievalArm,
} from './dsh-ontology-core/index.js'
import type { OntologyService } from './ontology-service.js'

/** 抽取端口：喂 prompt，回原始文本（真实实现由宿主接到 LLM；测试里用假实现）。 */
export type ExtractPort = (prompt: string) => Promise<string>

export interface CorpusDoc { id: string; text: string }

export type BootstrapStage = 'no-input' | 'extract' | 'parse' | 'gate' | 'conflict' | 'done'

export interface BootstrapResult {
  stage: BootstrapStage
  ok: boolean
  /** 模型声称提交的断言数 */
  proposed: number
  accepted: number
  /** 与库内已有断言键重复、未新增的数量 */
  duplicates: number
  rejected: number
  reasons: string[]
  version: string
  addedKeys: string[]
  /** base_version 是否与当前版本不符（模型抄错或抽取期间库前进）；必须可见 */
  baseVersionMismatch: boolean
  raw: string
}

export interface BootstrapInput {
  task?: string
  corpus?: CorpusDoc[]
  extract: ExtractPort
  service: PipelineService
  maxAssertions?: number
  /** 累积：把已有本体摘要放进 prompt（默认 true） */
  accumulate?: boolean
}

/** 产线只需要服务的一小片（便于测试替身） */
export type PipelineService = Pick<OntologyService, 'slice' | 'renderSlice' | 'commit' | 'health' | 'assertions' | 'nodes'>

/** 模型必须遵守的输出格式。这就是"入口格式"，缺了它真模型只能猜。 */
export const DELTA_FORMAT_LINES: readonly string[] = [
  '## 输出格式（严格 JSON，不要解释、不要 Markdown 围栏）',
  '{"deltaId":"<唯一>","baseVersion":{"hash":"<原样抄下面的 base_version>"},',
  ' "ops":[{"op":"assert","assertion":{"id":"a:<唯一>","s":"<主体>","p":"<关系>","o":"<客体>",',
  '         "q":{},"scope":"task:<范围>","status":"candidate",',
  '         "evidence":[{"kind":"quote","locator":"<语料 id 或段落锚>"}]}}]}',
  '硬规则：status 只能是 candidate（accepted 由闸门签发）；非 sess 作用域必须带 evidence；',
  '关系 p 只能取自下列关系表；没有可抽取内容时输出 {"ops":[]}。',
]

export { deriveFocus }

export interface PromptInput {
  task?: string
  corpus?: CorpusDoc[]
  existing: Assertion[]
  baseVersion: string
  maxAssertions?: number
}

/** 组装抽取 prompt：任务 + 语料 + 已有本体摘要（累积）+ 输出格式。 */
export function buildBootstrapPrompt(input: PromptInput): string {
  const out: string[] = [
    '# TASK（产线内部步骤：把下面材料转成本体断言）',
    input.task !== undefined && input.task.trim().length > 0 ? input.task : '(未给任务描述，只做语料本体)',
    '',
    '## base_version（必须原样抄进输出的 baseVersion.hash）',
    input.baseVersion,
    '',
  ]
  if (input.corpus !== undefined && input.corpus.length > 0) {
    out.push('## 语料（' + String(input.corpus.length) + ' 段）')
    const budget = input.maxAssertions ?? 40
    for (const d of input.corpus.slice(0, budget)) out.push('- [' + d.id + '] ' + d.text)
    out.push('')
  }
  if (input.existing.length > 0) {
    out.push('## 已有本体（不要重复提交，这些键已存在）')
    for (const a of input.existing.slice(0, 60)) out.push('- ' + a.s + ' ' + a.p + ' ' + String(a.o))
    out.push('')
  }
  out.push(...DELTA_FORMAT_LINES)
  return out.join('\n')
}

const asrtCount = (delta: Delta): number =>
  delta.ops.filter((o) => (o as { op: string }).op === 'assert').length

/** P-gen：一次生成 = 抽取 → 解析 → 闸门 → 落盘，并给出增量审计。 */
export async function bootstrapOntology(input: BootstrapInput): Promise<BootstrapResult> {
  const version0 = input.service.health().version
  const empty = (stage: BootstrapStage, reasons: string[], raw = ''): BootstrapResult => ({
    stage, ok: false, proposed: 0, accepted: 0, duplicates: 0, rejected: 0,
    reasons, version: version0, addedKeys: [], baseVersionMismatch: false, raw,
  })

  const hasTask = input.task !== undefined && input.task.trim().length > 0
  const hasCorpus = input.corpus !== undefined && input.corpus.length > 0
  if (!hasTask && !hasCorpus) return empty('no-input', ['既无任务也无语料：产线无事可做'])

  const before = new Set(input.service.assertions().map(asrtKey))
  const prompt = buildBootstrapPrompt({
    task: input.task,
    corpus: input.corpus,
    existing: input.accumulate === false ? [] : input.service.assertions(),
    baseVersion: version0,
    maxAssertions: input.maxAssertions,
  })

  let raw = ''
  try {
    raw = await input.extract(prompt)
  } catch (err) {
    return empty('extract', ['抽取端口抛错：' + String((err as Error)?.message ?? err)])
  }

  const parsed = parseDelta(raw)
  // strictNullChecks:false 下 discriminated union 不窄化：显式检查字段而不是 ok。
  if (!('delta' in parsed)) {
    const failed = parsed as { reason: string; detail: string }
    return empty('parse', [failed.reason + '：' + failed.detail], raw)
  }

  // 目标版本 CAS：不静默改写 base_version；错版本/抽取期间库前进都返回 conflict，不落盘
  const baseVersionMismatch = parsed.delta.baseVersion.hash !== version0
  const delta: Delta = parsed.delta

  const committed = await input.service.commit(delta)
  const after = new Set(input.service.assertions().map(asrtKey))
  const addedKeys = [...after].filter((k) => !before.has(k))
  const acceptedIds: string[] = committed.acceptedIds
  const proposed = asrtCount(delta)
  const reasons = [
    ...committed.rejected.map((f) => 'reject ' + f.code + ' ' + f.rule + ' ' + f.target + '：' + f.detail),
    ...committed.escalated.map((f) => 'escalate ' + f.code + ' ' + f.rule + ' ' + f.target + '：' + f.detail),
  ]
  return {
    stage: committed.versionConflict ? 'conflict' : (reasons.length > 0 && acceptedIds.length === 0 ? 'gate' : 'done'),
    ok: acceptedIds.length > 0,
    proposed,
    accepted: acceptedIds.length,
    duplicates: Math.max(0, proposed - addedKeys.length),
    rejected: committed.rejected.length,
    reasons,
    version: committed.version,
    addedKeys,
    baseVersionMismatch: baseVersionMismatch || committed.versionConflict,
    raw,
  }
}

export interface PipelineStats {
  /** 跑过多少次生成 */
  bootstraps: number
  /** 累计新增的断言键数（"本体在长大"的唯一证据） */
  totalAdded: number
  lastVersion: string
}

export interface PipelineOptions {
  service: PipelineService
  extract: ExtractPort
  maxAssertions?: number
  accumulate?: boolean
  /** 关系检索的嵌入端口；不配 → 词面检索（显式标记 lexical） */
  dense?: DenseRecallPort
  /** 共享 JudgePort（Jev 适配）；不配 → 稠密 top20 降级 */
  judge?: JudgePort
  /** 'relation' = 尽量用两段式；'lexical' = 显式走旧词面路径；缺省有 dense 就用关系 */
  retrieval?: 'relation' | 'lexical'
  denseLimit?: number
  rerankLimit?: number
  fallbackLimit?: number
}

export function renderRetrievalNote(r: RetrievalSummary): string {
  const lines = ['## 检索说明', '检索臂=' + r.arm + '；索引版本=' + r.indexVersion +
    '；注入 ' + String(r.hits) + ' 条' + (r.candidates > 0 ? '（粗筛 ' + String(r.candidates) + '）' : '') + '。']
  if (r.noSignal) lines.push('本次检索未命中；这不等于本体中不存在。')
  if (r.reason === 'relation_no_hits') lines.push('关系检索未命中；已回退词面检索，这仍不等于本体中不存在。')
  if (r.degraded && r.reason !== undefined && r.reason !== 'relation_no_hits') {
    lines.push('检索已降级（' + r.reason + '）；结果只作候选。')
  }
  lines.push('检索结果只是候选子图，不改变本体，也不签发 accepted。')
  return lines.join('\n')
}

const lexicalSummary = (
  found: ReturnType<typeof retrieve>, version: string,
  opts: { reason?: string; degraded: boolean; noSignal?: boolean },
): RetrievalSummary => ({
  arm: 'lexical', indexVersion: version, candidates: found.assertions.length,
  hits: found.assertions.length, noSignal: opts.noSignal ?? found.noSignal,
  degraded: opts.degraded, reason: opts.reason, relationIds: [],
  cost: { embedded: 0, judged: 0, injected: found.assertions.length, chars: 0 },
})

export interface RetrievalSummary {
  arm: RetrievalArm
  indexVersion: string
  /** 粗筛候选数（关系检索有；词面路径为命中断言数） */
  candidates: number
  /** 最终注入条数 */
  hits: number
  noSignal: boolean
  degraded: boolean
  reason?: string
  /** 关系边的稳定 id（仅关系检索臂） */
  relationIds: string[]
  /** 注入门阶段（Auto 分层检索；legacy 关系检索不填） */
  stage?: 'exact' | 'dense' | 'blocked' | 'ambiguous'
  denseTop1?: number | null
  jevTop1?: number | null
  threshold?: number
  thresholdVersion?: string
  gateOn?: 'dense' | 'jev'
  exactMatches?: number
  cost: { embedded: number; judged: number; injected: number; chars: number }
}

export interface PreparedPrompt {
  prompt: string
  focus: string[]
  bootstrapped: boolean
  bootstrapResults: BootstrapResult[]
  version: string
  /** 本次实际使用的检索臂与成本；未召回只写 noSignal，不写"本体不存在" */
  retrieval: RetrievalSummary
}

export interface Pipeline {
  /** 语料 → 语料本体 */
  ingestCorpus(corpus: CorpusDoc[]): Promise<BootstrapResult>
  /** 任务 → 任务本体；并返回可直接拼进 prompt 的切片文本（P-inject） */
  prepareForTask(task: string): Promise<PreparedPrompt>
  stats(): PipelineStats
}

/**
 * P-inject + P-accum 的粘合层：
 *   库空 → 先生成（语料本体或任务本体）→ 再按任务推导焦点切片 → 交给宿主拼 prompt。
 */
export function createPipeline(opts: PipelineOptions): Pipeline {
  let stats: PipelineStats = { bootstraps: 0, totalAdded: 0, lastVersion: opts.service.health().version }
  const dense = opts.dense === undefined ? undefined : createCachedDensePort(opts.dense)
  let indexCache: { key: string; index: ReturnType<typeof buildRelationIndex> } | undefined

  const run = async (input: { task?: string; corpus?: CorpusDoc[] }): Promise<BootstrapResult> => {
    const r = await bootstrapOntology({
      task: input.task,
      corpus: input.corpus,
      extract: opts.extract,
      service: opts.service,
      maxAssertions: opts.maxAssertions,
      accumulate: opts.accumulate,
    })
    stats = {
      bootstraps: stats.bootstraps + 1,
      totalAdded: stats.totalAdded + r.addedKeys.length,
      lastVersion: r.version,
    }
    return r
  }

  return {
    async ingestCorpus(corpus) {
      return await run({ corpus })
    },

    async prepareForTask(task) {
      const results: BootstrapResult[] = []
      // 库空 → 先让产线自己长出任务本体（这正是"任务进来生成任务本体"）
      if (opts.service.assertions().length === 0 && task.trim().length > 0) results.push(await run({ task }))
      const corpus = { nodes: opts.service.nodes(), assertions: opts.service.assertions() }
      const version = opts.service.health().version
      const relationWanted = opts.retrieval !== 'lexical'
      let focus: string[] = []
      let retrieval: RetrievalSummary
      let rrSources: string[] = []

      if (relationWanted && dense !== undefined) {
        const key = version + '|' + contentDigest(corpus.nodes)
        const cached = indexCache?.key === key ? indexCache : (indexCache = {
          key,
          index: buildRelationIndex({
            version, nodes: corpus.nodes, assertions: corpus.assertions,
            includeUnregistered: true, // 任务本体常用朴素名字，端点未必登记为 Node
          }),
        })
        const index = cached.index
        const rr = await retrieveRelations({
          query: task, index, dense, judge: opts.judge,
          denseLimit: opts.denseLimit, rerankLimit: opts.rerankLimit, fallbackLimit: opts.fallbackLimit,
        })
        if (rr.arm !== 'lexical' && rr.hits.length > 0) {
          focus = relationFocus(rr.hits.map((h) => h.edge), 12)
          rrSources = [...new Set(rr.hits.flatMap((h) => h.edge.sources))]
          retrieval = {
            arm: rr.arm, indexVersion: rr.indexVersion,
            candidates: rr.candidates.length, hits: rr.hits.length,
            noSignal: rr.noSignal, degraded: rr.degraded, reason: rr.reason,
            relationIds: rr.hits.map((h) => h.id), cost: rr.cost,
          }
        } else {
          // 稠密失败或关系未命中 → 保留既有词面路径；原因与"未命中≠不存在"必须可见
          const found = retrieve(task, corpus)
          focus = found.noSignal ? deriveFocus(task, corpus.assertions, corpus.nodes) : found.focus
          retrieval = lexicalSummary(found, version, {
            reason: rr.reason ?? 'relation_no_hits', degraded: true,
          })
          retrieval.cost = { ...rr.cost, injected: found.assertions.length, chars: 0 }
        }
      } else {
        const found = retrieve(task, corpus)
        focus = found.noSignal ? deriveFocus(task, corpus.assertions, corpus.nodes) : found.focus
        retrieval = lexicalSummary(found, version, opts.retrieval === 'lexical'
          ? { degraded: false }
          : { reason: 'dense_unavailable', degraded: true })
      }

      const sliceInput = {
        focus, maxAssertions: opts.maxAssertions,
        ...(rrSources.length === 0 ? {} : { assertionIds: rrSources }),
      }
      const body = focus.length === 0
        ? '' // 空库 + 空焦点：不注入，避免给模型一段空壳契约
        // 契约段由 system prompt 稳定段承担；这里只放 packet，避免每轮重复讲契约
        : opts.service.renderSlice(sliceInput, task, { contract: false })
      const injected = focus.length === 0 ? 0 : opts.service.slice(sliceInput).assertions.length
      retrieval = { ...retrieval, hits: injected, cost: { ...retrieval.cost, injected, chars: body.length } }
      const prompt = body.length === 0 ? '' : body + '\n\n' + renderRetrievalNote(retrieval)
      return {
        prompt,
        focus,
        bootstrapped: results.length > 0,
        bootstrapResults: results,
        version,
        retrieval,
      }
    },

    stats() { return { ...stats } },
  }
}