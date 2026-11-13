/** render：Packet → 确定性文本（同输入必得同输出；OA7：prompt 从 packet 生成）。 */
import type { Assertion, Node, Packet } from './types.js'
import { renderSchema, type SchemaSummary } from './schema.js'
import { renderPath, type PathHit } from './paths.js'
import { renderTermMap, type ResolveResult } from './terms.js'

export const CONTRACT_LINES: readonly string[] = [
  '# ONTOLOGY CONTRACT',
  '- 你收到的是「本体切片」(packet)，不是任务描述。',
  '- 写入只能提交 candidate；accepted 由 gate 签发，模型不得自称。',
  '- 非 sess 作用域的断言必须带 evidence（无证据不传播）。',
  '- 删除只能用 retract（tombstone），不得物理删除。',
  '- 提交增量必须带 base_version。',
]

export const CONTRACT_HEADER = CONTRACT_LINES.join('\n')

const renderNode = (n: Node): string =>
  '- ' + n.id + ' (' + n.kind + ', ' + (n.scope ?? '?') + ')' +
  (n.definition ? ' — ' + n.definition : '')

function qualifierText(a: Assertion): string {
  const q = a.q ?? {}
  const keys = Object.keys(q).sort()
  if (keys.length === 0) return ''
  return ' {' + keys.map((k) => k + '=' + String(q[k])).join(',') + '}'
}

function evidenceText(a: Assertion): string {
  const locators = (a.evidence ?? []).map((e) => e.locator).sort()
  return locators.length > 0 ? locators.join('|') : '∅'
}

const renderAssertion = (a: Assertion): string =>
  '- [' + a.id + '] ' + a.s + ' ' + a.p + ' ' + String(a.o) + qualifierText(a) +
  ' ⟨' + a.scope + '/' + a.status + '⟩ 证据:' + evidenceText(a)

export interface RenderOptions {
  /**
   * 是否在文本里带契约段（默认带）。
   * 生产部署里契约由 **system prompt 的稳定段**承担（可缓存），
   * 动态后缀只放 packet —— 否则同一段契约每轮被讲两遍。
   */
  contract?: boolean
  /**
   * 本体自描述（可用关系表）。给了就渲染在 packet 之前 ——
   * 先告诉模型"能说什么"，再给它"这次看到的实例"（SDSR 的双层指导）。
   */
  schema?: SchemaSummary
  /** 全库关系名（一行；让模型知道"还有哪些关系"，几乎不花 token） */
  relationIndex?: string[]
  /**
   * **适用规则（强制）**：规则型断言不能交给"可选检索"——agent 不查就违规。
   * 这块由确定性选出、**每轮注入**，与按需检索的事实分开。
   */
  rules?: { items: Assertion[]; total: number; truncated: boolean }
  /** 推理链（连通的路径，而不是散装三元组） */
  paths?: PathHit[]
  /** 术语归一（任务说法 → 环境本体概念）：先对齐词汇，再给证据 */
  terms?: ResolveResult
}

export function render(packet: Packet, task?: string, options?: RenderOptions): string {
  const out: string[] = options?.contract === false ? [] : [...CONTRACT_LINES, '']
  if (options?.rules !== undefined && options.rules.items.length > 0) {
    const r = options.rules
    out.push('## 适用规则（强制，' + String(r.items.length) + (r.truncated ? '/' + String(r.total) : '') + ' 条）')
    out.push('这些是**必须遵守**的约束，不是参考资料；违反会让提交被闸门拒绝。')
    for (const a of r.items) out.push(renderAssertion(a))
    out.push('')
  }
  if (options?.terms !== undefined) {
    out.push(...renderTermMap(options.terms))
    if (options.terms.matches.length > 0 || options.terms.unresolved.length > 0) out.push('')
  }
  if (options?.paths !== undefined && options.paths.length > 0) {
    out.push('## 推理链（' + String(options.paths.length) + ' 条；每跳都有证据）')
    for (const p of options.paths) out.push(renderPath(p))
    out.push('')
  }
  const index = options?.relationIndex ?? []
  if (options?.schema !== undefined || index.length > 0) {
    // 薄切片才给"详细描述"（带样例/计数）；厚切片只给一行全局索引 ——
    // 断言行本身已经带着关系名，再列一遍纯属冗余（实测占 30% token）。
    if (options?.schema !== undefined) out.push(...renderSchema(options.schema))
    if (index.length > 0) out.push('- 全库关系: ' + index.join(' / '))
    out.push('')
  }
  const base = packet.baseVersion ? ' (base=' + packet.baseVersion.hash.slice(0, 12) + ')' : ''
  out.push('# PACKET ' + packet.packetId + base)
  out.push('focus: ' + (packet.focus.length > 0 ? packet.focus.join(', ') : '(无)'))
  out.push('预算: maxAssertions=' + packet.budget.maxAssertions +
    (packet.budget.maxTokens !== undefined ? ' maxTokens=' + packet.budget.maxTokens : '') +
    (packet.truncated ? '（已截断）' : ''))
  out.push('')
  out.push('## 概念（' + packet.nodes.length + '）')
  for (const n of packet.nodes) out.push(renderNode(n))
  out.push('')
  out.push('## 断言（' + packet.assertions.length + '）')
  for (const a of packet.assertions) out.push(renderAssertion(a))
  if (task !== undefined) {
    out.push('', '# TASK', task)
  }
  return out.join('\n')
}