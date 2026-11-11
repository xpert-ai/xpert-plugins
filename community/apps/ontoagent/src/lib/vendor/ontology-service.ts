/**
 * 本体服务（深模块）：slice / propose / commit。不依赖 DSH——插件只把它接到工具面。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  enrichNodes, gateG0, importOwl, predicateIndex, reconcileWrites, render, resolveTerms, retrieve, retrievePaths, selectRules, slice, summarizeSchema,
  type Assertion, type BaseVersion, type Delta, type Evidence, type EvidenceResolver,
  type Finding, type Node, type Op, type Packet,
} from './dsh-ontology-core/index.js'
import { OntologyStore } from './dsh-ontology-store/index.js'
import { checkInvariants, runGate, tierOfOps, type CommitOutcome, type G2Judge } from './dsh-ontology-gate/index.js'

export interface ServiceOptions {
  storeDir: string
  topScope?: string
  judge?: G2Judge
  sampleRate?: number
  askHuman?: (req: { tier: string; deltaId: string; reasons: string[] }) => boolean | Promise<boolean>
  onCommitted?: (r: { deltaId: string; acceptedIds: string[]; version: string }) => void
  /** 可选证据解析端口（记忆插件提供）；只在 gate 外预解析 mem: 引用 */
  evidenceResolver?: EvidenceResolver
  /** 调用方认证主体；用于拒绝跨主体 mem: 证据 */
  evidenceSubject?: string
  /** Auto 模式由插件强制只读；宿主不得依赖调用方额外传参 */
  readOnly?: boolean
}

export interface ProposeResult { ok: boolean; findings: Finding[]; tier: string }
export interface CommitResult extends CommitOutcome { version: string; acceptedIds: string[]; conflicts: number; versionConflict: boolean }
export interface CommitPlan { deltaId: string; base: string; baseOps: number; ops: Op[] }
export interface PublishResult { status: 'applied' | 'replayed' | 'conflict' | 'diverged'; version: string }

export interface OntologyService {
  readonly readOnly: boolean
  slice(input: { focus: string[]; maxAssertions?: number; maxTokens?: number; assertionIds?: string[] }): Packet
  renderSlice(input: { focus: string[]; maxAssertions?: number; maxTokens?: number; assertionIds?: string[] }, task?: string, options?: { contract?: boolean; schema?: boolean }): string
  propose(delta: Delta): Promise<ProposeResult>
  commit(delta: Delta): Promise<CommitResult>
  decide(delta: Delta): Promise<{ result: CommitResult; plan?: CommitPlan }>
  publish(plan: CommitPlan): PublishResult
  health(): {
    ok: boolean; version: string; ops: number; assertions: number; topScope: string
    invariantViolations: number
  }
  assertions(): Assertion[]
  nodes(): Node[]
  /** 本体自描述：可用关系 / 作用域 / 规模（S1） */
  schema(input?: { maxRelations?: number }): ReturnType<typeof summarizeSchema>
  /**
   * 受控查询（S2）：按 s/p/o 精确或前缀匹配取断言，带条数上限。
   * 比"猜 focus 再切片"更贴近"agent 自己按需取"——焦点推导猜不中时这是兜底通道。
   */
  query(input: { s?: string; p?: string; o?: string; limit?: number; prefix?: boolean }): Assertion[]
  /** 相关性检索（实体链接 + 两阶段重排）：命中带分数与命中词，可解释 */
  search(query: string, input?: { limit?: number; assertionLimit?: number }): ReturnType<typeof retrieve>
  /** 术语归一（消歧）：任务里的说法 → 环境本体概念 */
  resolve(task: string): ReturnType<typeof resolveTerms>
  /**
   * **既有本体导入**（管理操作，不是 agent 工具）：TTL/OWL → 断言并经闸门落盘。
   * 企业本体是权威，不该由模型转述。
   */
  importPreset(ttl: string, opts: { source: string; rank?: number }): Promise<{
    accepted: number; rejected: number; terms: number; labeled: number
    unknownPredicates: string[]; version: string
  }>
  /**
   * **测试夹具权威写入**（不是 agent 工具）：用于场景 setup/事件 effect。
   * 支持 assert/retract，绕过模型 gate 的 T2/人工/同键冲突，但仍过 G0 结构检查；
   * 任何 reject/不支持 op/no-op 都必须显式失败，不能静默吞掉。
   */
  commitFixture(delta: Delta): Promise<{ acceptedIds: string[]; version: string; changed: boolean }>
}

function deriveNodes(assertions: Assertion[], storeDir: string): Node[] {
  const nodesPath = join(storeDir, 'nodes.json')
  if (existsSync(nodesPath)) return JSON.parse(readFileSync(nodesPath, 'utf8')) as Node[]
  const ids = new Set<string>()
  for (const a of assertions) {
    for (const ref of [a.s, a.o]) {
      if (typeof ref !== 'string' || !ref.includes(':')) continue
      // 概念 id 的形状是"小写命名空间:局部名"（c:/dim:/fibo:/pop: 都算）。
      // 用形状而不是白名单，否则任何自定义命名空间（导入的 fibo:、产线生成的 dim:）
      // 都进不了节点视图 —— 术语归一和目录会一起瞎掉。'22:30'、'张伟' 这类不是这个形状，自然排除。
      const m = /^([a-z][a-z0-9_-]{0,15}):/.exec(ref)
      if (m !== null && ref.length > m[0].length) ids.add(ref)
    }
  }
  return [...ids].sort().map((id) => ({
    id,
    kind: id.startsWith('c:') ? 'class' : id.startsWith('r:') ? 'relation' : 'term',
    scope: 'task:local',
  }) as Node)
}

export function createOntologyService(opts: ServiceOptions): OntologyService {
  const store = new OntologyStore(opts.storeDir)
  const topScope = opts.topScope ?? 'gov:'
  // 读缓存：slice/query/search/health 共用同一份 fold 表；store 按日志 mtime/size 失效。
  const assertions = (): Assertion[] => [...store.foldCached().values()]
  const nodes = (): Node[] => deriveNodes(assertions(), opts.storeDir)
  const version = (): string => store.version()

  /** propose 与 commit 共用同一份闸门输入构造（此前是两处复制粘贴） */
  const buildGateInput = (delta: Delta, known: Assertion[] = assertions(), autoApprove = false) => ({
    deltaId: delta.deltaId,
    baseVersion: delta.baseVersion as BaseVersion,
    ops: delta.ops,
    knownNodeIds: new Set(nodes().map((n) => n.id)),
    knownAssertions: known,
    judge: opts.judge,
    sampleRate: opts.sampleRate,
    askHuman: autoApprove ? (() => true) : opts.askHuman,
    topScope,
  })

  const staleResult = (delta: Delta, base: string, current: string): CommitResult => ({
    accepted: [], rejected: [],
    escalated: [{
      code: 'G3', rule: 'base_version.stale', target: delta.deltaId,
      detail: '基于 ' + base + '，当前为 ' + current + '；未落盘，需按当前版本重新切片后重提',
      severity: 'warn',
    }],
    tier: tierOfOps(delta.ops, { topScope }), downgrades: [], needsHuman: false, sampledForReview: [],
    version: current, acceptedIds: [], conflicts: 0, versionConflict: true,
  })
  const conflictIfStale = (delta: Delta): CommitResult | null => {
    const base = delta.baseVersion?.hash
    const current = version()
    return !base || base === current ? null : staleResult(delta, base, current)
  }

  /** 收集 delta 里的 mem: 证据（assert + 结构操作）；target 用于定位断言/操作。 */
  const memEvidenceOf = (delta: Delta): Array<{ target: string; evidence: Evidence }> => {
    const out: Array<{ target: string; evidence: Evidence }> = []
    for (const op of delta.ops) {
      if (op.op === 'assert') {
        for (const e of op.assertion.evidence ?? []) {
          if (e.locator.startsWith('mem:')) out.push({ target: op.assertion.id, evidence: e })
        }
        continue
      }
      if ('evidence' in op) {
        for (const e of op.evidence) {
          if (e.locator.startsWith('mem:')) out.push({ target: op.from ?? op.op, evidence: e })
        }
      }
    }
    return out
  }

  const evidenceFindings = async (delta: Delta): Promise<Finding[]> => {
    const refs = memEvidenceOf(delta)
    if (refs.length === 0) return []
    const findings: Finding[] = []
    if (opts.evidenceResolver === undefined) {
      for (const r of refs) {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.resolver_unavailable', target: r.target,
          detail: '存在 mem: 证据但未注入 EvidenceResolver：' + r.evidence.locator, severity: 'reject',
        })
      }
      return findings
    }
    for (const r of refs) {
      if (r.evidence.digest === undefined) {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.digest_missing', target: r.target,
          detail: 'mem: 证据必须带 digest：' + r.evidence.locator, severity: 'reject',
        })
        continue
      }
      let resolved
      try {
        resolved = await opts.evidenceResolver.resolve(
          { locator: r.evidence.locator, digest: r.evidence.digest },
          { ...(opts.evidenceSubject === undefined ? {} : { subjectId: opts.evidenceSubject }) },
        )
      } catch (err) {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.resolver_error', target: r.target,
          detail: 'EvidenceResolver 抛错：' + String((err as Error)?.message ?? err), severity: 'reject',
        })
        continue
      }
      if (!resolved.exists) {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.mem_missing', target: r.target,
          detail: 'mem: 引用的原文不存在：' + r.evidence.locator, severity: 'reject',
        })
        continue
      }
      if (!resolved.digestOk) {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.digest_mismatch', target: r.target,
          detail: 'mem: 原文 digest 不符：' + r.evidence.locator, severity: 'reject',
        })
        continue
      }
      if (resolved.disposition === 'forgotten') {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.forgotten', target: r.target,
          detail: 'mem: 原文已普通遗忘（墓碑）：' + r.evidence.locator, severity: 'reject',
        })
      } else if (resolved.disposition === 'excluded') {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.subject_mismatch', target: r.target,
          detail: 'mem: 证据主体不符：' + r.evidence.locator + (resolved.reason === undefined ? '' : ' / ' + resolved.reason), severity: 'reject',
        })
      } else if (resolved.disposition === 'staged') {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.not_published', target: r.target,
          detail: 'mem: 原文未进入已发布 revision：' + r.evidence.locator, severity: 'reject',
        })
      } else if (resolved.disposition === 'unknown') {
        findings.push({
          code: 'EVIDENCE', rule: 'evidence.unknown', target: r.target,
          detail: 'mem: 证据无法解析：' + r.evidence.locator, severity: 'reject',
        })
      }
    }
    return findings
  }

  const evidenceRejected = (delta: Delta, findings: Finding[]): CommitResult => ({
    accepted: [], rejected: findings, escalated: [],
    tier: tierOfOps(delta.ops, { topScope }), downgrades: [], needsHuman: false, sampledForReview: [],
    version: version(), acceptedIds: [], conflicts: 0, versionConflict: false,
  })
  const readOnlyRejected = (delta: Delta): CommitResult => evidenceRejected(delta, [{
    code: 'READ_ONLY', rule: 'context_source.auto', target: delta.deltaId,
    detail: 'Auto-Ontology 模式只读；语义变更必须经 Auto 治理与快照同步', severity: 'reject',
  }])

  const service: OntologyService = {
    readOnly: opts.readOnly === true,
    slice(input) {
      return slice({
        nodes: nodes(),
        assertions: assertions(),
        focus: input.focus,
        maxAssertions: input.maxAssertions ?? 120,
        maxTokens: input.maxTokens,
        ...(input.assertionIds === undefined ? {} : { assertionIds: input.assertionIds }),
        hops: 1,
        baseVersion: { hash: version(), scope: 'task:local' },
      })
    },

    renderSlice(input, task, options) {
      const packet = service.slice(input)
      // 显式 assertionIds（关系命中来源）时，派生段也只用这批断言，避免同端点未入选断言从路径/规则泄漏
      const scoped = input.assertionIds === undefined
        ? assertions()
        : assertions().filter((a) => input.assertionIds!.includes(a.id))
      // schema 只描述**本切片里出现的关系**（相关优先、几乎不随库增长而变贵），
      // 全库关系只给一行名字。这是 token 成本与"能说什么"之间的折中。
      // 详细描述只在切片很薄时才有价值（否则断言行已含关系名，是纯冗余）
      const thin = packet.assertions.length <= 3
      const local = options?.schema === false || !thin
        ? undefined
        : summarizeSchema(packet.assertions, packet.nodes, 8, 2)
      const index = options?.schema === false ? undefined : predicateIndex(scoped, 30)
      // 规则：确定性选出并**强制注入**（不依赖 agent 主动检索）
      const rules = options?.schema === false || task === undefined
        ? undefined
        : (() => {
          const sel = selectRules(task, scoped, 12)
          return sel.rules.length === 0 ? undefined : { items: sel.rules, total: sel.total, truncated: sel.truncated }
        })()
      // 链式：从焦点实体出发走路径，优先覆盖规则的链
      // 种子（packet.focus）已经是检索选出的相关实体，这里不再要求路径与查询词面重合，
      // 否则"这张单该不该赔"这种不含实体的问法会一条链都走不出来
      // 术语归一：任务里的说法 → 环境本体概念（这是"输入里没有的外部信息"）
      const terms = options?.schema === false || task === undefined ? undefined : resolveTerms(task, enrichNodes(nodes(), scoped))
      const paths = task === undefined
        ? undefined
        : retrievePaths(task, { assertions: scoped }, packet.focus, { maxHops: 2, maxPaths: 6, requireMatch: false })
      return render(packet, task, { ...options, schema: local, relationIndex: index, rules, paths, terms })
    },

    async propose(delta) {
      if (opts.readOnly === true) return { ok: false, findings: readOnlyRejected(delta).rejected, tier: tierOfOps(delta.ops, { topScope }) }
      const evidence = await evidenceFindings(delta)
      if (evidence.length > 0) {
        return { ok: false, findings: evidence, tier: tierOfOps(delta.ops, { topScope }) }
      }
      const out = await runGate(buildGateInput(delta))
      return {
        ok: out.rejected.length === 0 && out.escalated.length === 0,
        findings: [...out.rejected, ...out.escalated],
        tier: out.tier,
      }
    },

    async decide(delta) {
      if (opts.readOnly === true) return { result: readOnlyRejected(delta) }
      const stale = conflictIfStale(delta)
      if (stale !== null) return { result: stale }
      const evidence = await evidenceFindings(delta)
      if (evidence.length > 0) return { result: evidenceRejected(delta, evidence) }
      const known = assertions()
      const out = await runGate(buildGateInput(delta, known))
      if (out.accepted.length === 0) {
        return { result: { ...out, version: version(), acceptedIds: [], conflicts: 0, versionConflict: false } }
      }
      const late = conflictIfStale(delta)
      if (late !== null) return { result: late }
      // 写入期冲突检测：同键异议按权威序裁定；被压过/同级的一律不落盘
      const { writable, conflicts } = reconcileWrites(known, out.accepted)
      const disputed = conflicts.filter((c) => c.disputed)
      const conflictFindings: Finding[] = disputed.map((c) => ({
        code: 'G3', rule: 'conflict.disputed',
        target: c.candidates.join('|'),
        detail: '同键同级异议，需人工裁定（胜者=' + c.winner + '）',
        severity: 'warn',
      }))
      const result: CommitResult = {
        ...out, accepted: writable,
        escalated: [...out.escalated, ...conflictFindings],
        needsHuman: out.needsHuman || disputed.length > 0,
        version: version(), acceptedIds: writable.map((a) => a.id), conflicts: conflicts.length, versionConflict: false,
      }
      if (writable.length === 0) return { result }
      const ops = writable.map((a) => ({ op: 'assert', assertion: a as Assertion }) as Op)
      const log = store.ops()
      return { result, plan: { deltaId: delta.deltaId, base: version(), baseOps: log.length, ops } }
    },
    publish(plan) {
      if (opts.readOnly === true) return { status: 'conflict', version: version() }
      const log = store.ops()
      const tail = log.slice(plan.baseOps)
      const same = (a: Op, b: Op): boolean => JSON.stringify(a) === JSON.stringify(b)
      if (tail.length >= plan.ops.length && plan.ops.every((op, i) => same(tail[i]!, op))) {
        return { status: 'replayed', version: version() }
      }
      if (tail.length === 0 && version() === plan.base) {
        store.append(plan.ops)
        store.snapshot()
        const v = version()
        opts.onCommitted?.({
          deltaId: plan.deltaId,
          acceptedIds: plan.ops.map((o) => (o as { assertion: Assertion }).assertion.id),
          version: v,
        })
        return { status: 'applied', version: v }
      }
      const partial = tail.length > 0 && tail.length < plan.ops.length && tail.every((op, i) => same(op, plan.ops[i]!))
      return { status: partial ? 'diverged' : 'conflict', version: version() }
    },
    async commit(delta) {
      const { result, plan } = await service.decide(delta)
      if (plan === undefined) return result
      const pub = service.publish(plan)
      if (pub.status === 'applied' || pub.status === 'replayed') return { ...result, version: pub.version }
      if (pub.status === 'conflict') return staleResult(delta, plan.base, pub.version)
      return {
        ...staleResult(delta, plan.base, pub.version),
        escalated: [{
          code: 'G3', rule: 'publish.partial_write', target: delta.deltaId,
          detail: '发布中途中断，日志出现部分写入；需人工核对，不自动修复',
          severity: 'warn',
        }],
      }
    },
    health() {
      // 不变式不是文档：每次读健康都跑一遍可执行检查
      const violations = checkInvariants({ assertions: assertions() })
      return {
        ok: violations.length === 0,
        version: version(), ops: store.ops().length, assertions: assertions().length, topScope,
        invariantViolations: violations.length,
      }
    },

    assertions,
    nodes,

    schema(input) {
      return summarizeSchema(assertions(), nodes(), input?.maxRelations)
    },

    resolve(task) {
      return resolveTerms(task, enrichNodes(nodes(), assertions()))
    },

    async commitFixture(delta) {
      const g0 = gateG0(
        { deltaId: delta.deltaId, baseVersion: delta.baseVersion, ops: delta.ops },
        new Set(nodes().map((n) => n.id)),
      )
      const rejects = g0.filter((f) => f.severity === 'reject')
      if (rejects.length > 0) throw new Error('fixture_rejected: ' + JSON.stringify(rejects))
      const ops: Op[] = delta.ops.map((op) => {
        if (op.op === 'assert') {
          return { op: 'assert', assertion: { ...op.assertion, status: 'accepted' } } as Op
        }
        if (op.op === 'retract') return op
        throw new Error('fixture_op_unsupported: ' + String((op as { op?: string }).op))
      })
      const before = version()
      store.append(ops)
      store.snapshot()
      const after = version()
      if (after === before) throw new Error('fixture_noop: ' + delta.deltaId)
      return {
        acceptedIds: ops
          .filter((op): op is { op: 'assert'; assertion: Assertion } => op.op === 'assert')
          .map((op) => op.assertion.id),
        version: after,
        changed: true,
      }
    },

    async importPreset(ttl, opts) {
      const imported = importOwl(ttl, { source: opts.source, rank: opts.rank })
      if (imported.ops.length === 0) {
        return { accepted: 0, rejected: 0, terms: 0, labeled: 0, unknownPredicates: imported.unknownPredicates, version: version() }
      }
      // 导入权威本体是**受治理行为**：gov 是 T2 档，必须显式走管理审批路径，
      // 并把来源写进限定符（q.source），避免被当成模型自产知识。
      const known = assertions()
      const out = await runGate(buildGateInput(
        { deltaId: 'import-' + opts.source, baseVersion: { hash: version() }, ops: imported.ops }, known, true))
      const { writable } = reconcileWrites(known, out.accepted)
      if (writable.length > 0) {
        store.append(writable.map((a) => ({ op: 'assert', assertion: a as Assertion }) as Op))
        store.snapshot()
      }
      const r = { acceptedIds: writable.map((a) => a.id), rejected: out.rejected, version: version() }
      return {
        accepted: r.acceptedIds.length,
        rejected: r.rejected.length,
        terms: imported.terms,
        labeled: imported.labeled,
        unknownPredicates: imported.unknownPredicates,
        version: r.version,
      }
    },

    search(query, input) {
      // 与 resolve 同源：label/alias/definition 常常是断言而不是 nodes.json 里的字段，
      // 不补进来就会出现"resolve 认得的说法，search 搜不到"这种自相矛盾。
      return retrieve(query, { nodes: enrichNodes(nodes(), assertions()), assertions: assertions() }, input)
    },

    query(input) {
      const match = (v: unknown, pat: string | undefined): boolean => {
        if (pat === undefined || pat.length === 0) return true
        const got = typeof v === 'string' ? v : String(v)
        return input.prefix === true ? got.startsWith(pat) : got === pat
      }
      return assertions()
        .filter((a) => a.status !== 'retracted' && match(a.s, input.s) && match(a.p, input.p) && match(a.o, input.o))
        .slice(0, input.limit ?? 30)
    },
  }
  return service
}