import { contentDigest } from './digest.js'
import { render } from './render.js'
import { resolveTerms, enrichNodes } from './terms.js'
import { retrieve } from './retrieve.js'
import type { Assertion, BaseVersion, Node, Packet } from './types.js'
import type { ClarificationRequest } from './clarification.js'

export interface GovernedContextInput {
  task: string
  nodes: Node[]
  assertions: Assertion[]
  baseVersion: BaseVersion
  sourceDigest?: string
  stale?: boolean
  maxTerms?: number
  maxAssertions?: number
  maxChars?: number
  /**
   * 外部候选术语（已按相关性排序）。
   *
   * 给出时**只替换候选生成这一层**（标签/别名匹配 → TF-IDF 降级 → 物理表补充），
   * 术语包闭包、join 展开、预算裁切、未命中处理与渲染仍走同一实现。
   * 用于检索臂对比（lexical / dense+Jev / dense-only）；候选是纯数据，不在这里调模型。
   * 未知 id 直接拒绝，避免把非术语节点或拼写错误静默注入上下文。
   */
  candidateTerms?: readonly string[]
  /**
   * 候选来自用户明确选择（通常是 exact 层选中的 2–3 个术语）。
   * 预算不足时整体放弃，不返回只包含部分选中术语的 Packet。
   * 默认 false，保持检索臂按候选顺序做预算裁切的既有行为。
   */
  requireAllCandidates?: boolean
  /**
   * 未命中原因（审计用）：no_match = 没有候选；low_relevance = 注入门判定相关性不足。
   * 两者都不阻止 agent 回答通用问题，只说明本体未覆盖。
   */
  noCoverageReason?: 'no_match' | 'low_relevance'
  /**
   * 歧义澄清：给出时本轮不注入术语事实，只渲染候选和“用宿主选择卡提问”的合同。
   * 候选必须来自已认证术语；渲染由宿主负责，core 不依赖 UI。
   */
  clarification?: ClarificationRequest
}

export interface GovernedContextResult {
  packet: Packet
  prompt: string
  focus: string[]
  truncated: boolean
  noCoverage: boolean
  matchedTerms: string[]
  /** 候选来源：内置词法，或调用方注入（审计用） */
  candidateSource: 'lexical' | 'injected'
  /** 本轮是澄清而非注入；focus/packet 为空 */
  clarification?: ClarificationRequest
  /** requireAllCandidates 因预算不足整体放弃时的原因。 */
  budgetFailure?: 'candidate_budget_exceeded'
}

const active = (assertions: Assertion[]): Assertion[] => assertions.filter((a) => a.status !== 'retracted')

function bundleFor(termId: string, assertions: Assertion[]): Map<string, Assertion> {
  const byId = new Map(assertions.map((a) => [a.id, a]))
  const out = new Map<string, Assertion>()
  const include = (a: Assertion | undefined): void => { if (a !== undefined) out.set(a.id, a) }
  const includeSubject = (id: string): void => { for (const a of assertions) if (a.s === id) include(a) }
  includeSubject(termId)
  for (const a of [...out.values()]) {
    if ((a.p === 'has_attribute' || a.p === 'has_sql_attribute' || a.p === 'represents_table') && typeof a.o === 'string') {
      includeSubject(a.o)
      for (const mapped of assertions) {
        if (mapped.s === a.o && (mapped.p === 'maps_to_column' || mapped.p === 'uses_column' || mapped.p === 'belongs_to_table') && typeof mapped.o === 'string') includeSubject(mapped.o)
      }
    }
  }
  for (const a of [...out.values()]) {
    if (a.p === 'maps_to_column' && typeof a.o === 'string') includeSubject(a.o)
  }
  for (const a of [...out.values()]) {
    if (a.p === 'belongs_to_table' && typeof a.o === 'string') includeSubject(a.o)
  }
  return new Map([...out].filter(([id]) => byId.has(id)))
}

function joinsFor(termIds: string[], assertions: Assertion[]): Map<string, Assertion> {
  if (termIds.length < 2) return new Map()
  const selected = new Set(termIds)
  const bundles = termIds.map((id) => bundleFor(id, assertions))
  const out = new Map<string, Assertion>()
  for (const a of assertions) {
    if (a.p !== 'references_attribute' || typeof a.o !== 'string') continue
    const targetOwner = bundles.findIndex((bundle) => [...bundle.values()].some((x) => x.s === a.o || x.o === a.o))
    const sourceTable = assertions.find((x) => x.s === a.s && x.p === 'belongs_to_table')?.o
    const sourceOwner = bundles.findIndex((bundle) => [...bundle.values()].some((x) =>
      x.s === a.s || x.o === a.s || (sourceTable !== undefined && (x.p === 'represents_table' || x.p === 'belongs_to_table') && x.o === sourceTable)))
    if (targetOwner < 0 || sourceOwner < 0 || targetOwner === sourceOwner) continue
    if (!selected.has(termIds[targetOwner]!) || !selected.has(termIds[sourceOwner]!)) continue
    out.set(a.id, a)
    // 关系两端显式带入：源列本身、目标属性的映射列及其物理字段；仍只限已选术语的 join。
    const includeEndpoint = (subject: string): void => {
      for (const extra of assertions) {
        if (extra.s !== subject) continue
        if (extra.p === 'physical_name' || extra.p === 'data_type' || extra.p === 'belongs_to_table') {
          out.set(extra.id, extra)
        } else if (extra.p === 'maps_to_column' && typeof extra.o === 'string') {
          out.set(extra.id, extra)
          for (const mapped of assertions) {
            if (mapped.s === extra.o && (mapped.p === 'physical_name' || mapped.p === 'data_type' || mapped.p === 'belongs_to_table')) {
              out.set(mapped.id, mapped)
            }
          }
        }
      }
    }
    includeEndpoint(a.s)
    includeEndpoint(a.o)
  }
  return out
}

function makePacket(input: GovernedContextInput, termIds: string[], assertions: Assertion[], nodes: Node[]): Packet {
  const bundles = termIds.map((id) => bundleFor(id, assertions))
  const selected = new Map<string, Assertion>()
  for (const bundle of bundles) for (const [id, assertion] of bundle) selected.set(id, assertion)
  for (const [id, assertion] of joinsFor(termIds, assertions)) selected.set(id, assertion)
  const picked = [...selected.values()].sort((a, b) => a.id.localeCompare(b.id))
  const used = new Set<string>(termIds)
  for (const a of picked) {
    used.add(a.s)
    if (typeof a.o === 'string' && a.o.startsWith('auto:')) used.add(a.o)
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const packetNodes = [...used].sort().map((id) => byId.get(id) ?? ({ id, kind: 'term', scope: 'gov:auto' } as Node))
  const focus = [...termIds].sort()
  const content = { baseVersion: input.baseVersion, focus, nodes: packetNodes, assertions: picked }
  return {
    packetId: 'pkt-auto-' + contentDigest(content),
    focus,
    baseVersion: input.baseVersion,
    nodes: packetNodes,
    assertions: picked,
    truncated: false,
    budget: { maxAssertions: input.maxAssertions ?? 120 },
  }
}

function renderPacket(input: GovernedContextInput, packet: Packet, truncated: boolean): string {
  const header = [
    '# GOVERNED ONTOLOGY CONTEXT',
    '- 以下来自已认证治理资产，只用于当前任务；不得据此修改本体。',
    '- 未提供的口径、字段或关系不得臆造；覆盖不足必须明确说明。',
    '- source=' + (input.sourceDigest ?? 'unknown') + '；mirror=' + input.baseVersion.hash + (input.stale === true ? '；stale=true' : ''),
    ...(truncated ? ['- 上下文已按完整术语包截断；未包含的术语不得猜测。'] : []),
    '',
  ]
  return header.join('\n') + render({ ...packet, truncated }, input.task, { contract: false })
}

function renderClarification(input: GovernedContextInput, clarification: ClarificationRequest): string {
  const lines = [
    '# GOVERNED ONTOLOGY CONTEXT',
    '- 用户问题存在歧义；本轮不注入术语事实，先向用户确认。',
    '- source=' + (input.sourceDigest ?? 'unknown') + '；mirror=' + input.baseVersion.hash + (input.stale === true ? '；stale=true' : ''),
    '',
    '# CLARIFICATION',
    '- 优先调用宿主提供的选择卡/提问工具，把下面的候选原样作为选项；按问题要求选择适用项，不要自行扩展候选。',
    '- 如果没有选择卡工具，用编号列表问用户。',
    '- 用户选择前，不要把这些候选当成事实，也不要猜测字段或口径。',
    '- 原问题：' + input.task,
    '- 问题：' + clarification.question,
    '- 选项：',
  ]
  for (let i = 0; i < clarification.options.length; i += 1) {
    const o = clarification.options[i]!
    const fields = o.fields.length === 0 ? '无声明字段' : o.fields.join(' / ')
    lines.push('  ' + String(i + 1) + '. ' + o.label + ' — ' + fields + (o.description.length === 0 ? '' : ' — ' + o.description))
  }
  if (clarification.allowNone) lines.push('  ' + String(clarification.options.length + 1) + '. 都不是 — 按通用知识回答（非认证口径）')
  lines.push('- 用户选择后，用选中的术语 label/id 组成明确、定义式/自足的术语准备 task（不要把原问题拼进准备 task），重新调用现有本体准备/检索；原问题保留在对话上下文用于最终回答，不要继续使用未选候选或自行补全未选项。')
  return lines.join('\n')
}

export function compileGovernedContext(input: GovernedContextInput): GovernedContextResult {
  const assertions = active(input.assertions)
  const nodes = enrichNodes(input.nodes, assertions)
  if (input.clarification !== undefined) {
    const packet = makePacket(input, [], assertions, nodes)
    return {
      packet: { ...packet, focus: [], nodes: [], assertions: [], truncated: false },
      prompt: renderClarification(input, input.clarification),
      focus: [], truncated: false, noCoverage: false,
      matchedTerms: input.clarification.options.map((o) => o.termId),
      candidateSource: 'injected',
      clarification: input.clarification,
    }
  }
  const termNodes = nodes.filter((n) => n.id.startsWith('auto:term:'))
  let candidates: string[]
  if (input.candidateTerms !== undefined) {
    const known = new Set(termNodes.map((n) => n.id))
    const unknown = [...new Set(input.candidateTerms.filter((id) => !known.has(id)))].sort()
    if (unknown.length > 0) throw new Error('governed_context_unknown_candidate:' + unknown.join(','))
    // 保留调用方排序；重复项只留第一次出现
    candidates = [...new Set(input.candidateTerms)]
  } else {
    const candidateLimit = Math.max(12, input.maxTerms ?? 6)
    const resolved = resolveTerms(input.task, termNodes, { max: candidateLimit })
    const ranked = new Map<string, number>()
    for (const match of resolved.matches) ranked.set(match.concept, match.score)
    if (ranked.size === 0) {
      const found = retrieve(input.task, { nodes: termNodes, assertions }, { limit: candidateLimit, assertionLimit: 0 })
      for (const hit of found.entities) if (hit.id.startsWith('auto:term:')) ranked.set(hit.id, hit.score)
    }
    const tableNodes = nodes.filter((n) => n.id.startsWith('auto:table:'))
    const tables = resolveTerms(input.task, tableNodes, { max: candidateLimit })
    for (const match of tables.matches) {
      for (const a of assertions) {
        if (a.p !== 'represents_table' || a.o !== match.concept || !a.s.startsWith('auto:term:')) continue
        ranked.set(a.s, Math.max(ranked.get(a.s) ?? 0, Number((match.score * 0.9).toFixed(2))))
      }
    }
    candidates = [...ranked].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id)
  }
  const maxTerms = Math.max(1, input.maxTerms ?? 6)
  const maxAssertions = Math.max(1, input.maxAssertions ?? 120)
  const maxChars = Math.max(1, input.maxChars ?? 16000)
  const selected: string[] = []
  let packet = makePacket(input, selected, assertions, nodes)
  let prompt = renderPacket(input, packet, false)
  let truncated = false
  if (input.requireAllCandidates === true) {
    // 用户明确选中的术语必须整体成功或整体失败；不能因为后一个包超预算就只注入前一个。
    if (candidates.length > maxTerms) {
      truncated = true
    } else if (candidates.length > 0) {
      const trialPacket = makePacket(input, candidates, assertions, nodes)
      const trialPrompt = renderPacket(input, trialPacket, false)
      if (trialPacket.assertions.length > maxAssertions || trialPrompt.length > maxChars) {
        truncated = true
      } else {
        selected.push(...candidates)
        packet = trialPacket
        prompt = trialPrompt
      }
    }
  } else {
    for (const termId of candidates) {
      if (selected.length >= maxTerms) {
        truncated = true
        continue
      }
      const trialIds = [...selected, termId]
      const trialPacket = makePacket(input, trialIds, assertions, nodes)
      const trialPrompt = renderPacket(input, trialPacket, truncated)
      if (trialPacket.assertions.length > maxAssertions || trialPrompt.length > maxChars) {
        truncated = true
        continue
      }
      selected.push(termId)
      packet = trialPacket
      prompt = trialPrompt
    }
  }
  if (truncated && selected.length > 0) {
    packet = makePacket(input, selected, assertions, nodes)
    prompt = renderPacket(input, packet, true)
  }
  const noCoverage = selected.length === 0
  const budgetFailure = input.requireAllCandidates === true && truncated && selected.length === 0
    ? 'candidate_budget_exceeded' as const
    : undefined
  if (noCoverage) {
    packet = { ...packet, focus: [], nodes: [], assertions: [], truncated }
    prompt = budgetFailure === undefined
      ? [
          '# GOVERNED ONTOLOGY CONTEXT',
          '- 未匹配到已治理术语；可以回答通用问题，但不得把通用知识说成已认证本体口径。',
          '- 不得猜测业务口径、物理字段或连接关系。',
          ...(input.noCoverageReason === 'low_relevance'
            ? ['- 检索相关性低于阈值，已主动不注入本体，避免把不相关术语当成依据。']
            : []),
          '- source=' + (input.sourceDigest ?? 'unknown') + '；mirror=' + input.baseVersion.hash,
          ...(truncated ? ['- 候选术语超出上下文预算。'] : []),
        ].join('\n')
      : [
          '# GOVERNED ONTOLOGY CONTEXT',
          '- 精确命中/用户选中的完整术语包超出预算，本轮未注入任何术语。',
          '- 不得只注入部分选中术语，也不得猜测未提供的口径、物理字段或连接关系。',
          '- 可以回答通用问题，但不得把通用知识说成已认证本体口径。',
          '- source=' + (input.sourceDigest ?? 'unknown') + '；mirror=' + input.baseVersion.hash + (input.stale === true ? '；stale=true' : ''),
        ].join('\n')
  }
  return {
    packet, prompt, focus: selected, truncated, noCoverage, matchedTerms: candidates,
    candidateSource: input.candidateTerms !== undefined ? 'injected' : 'lexical',
    ...(budgetFailure === undefined ? {} : { budgetFailure }),
  }
}
