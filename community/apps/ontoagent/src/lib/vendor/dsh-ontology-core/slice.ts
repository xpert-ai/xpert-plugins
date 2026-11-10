/** slice：focus → k-hop 闭包 → 权威序排序 → 预算截断 → Packet（确定性）。 */
import { contentDigest } from './digest.js'
import { rankOf } from './keys.js'
import type { Assertion, BaseVersion, Node, Packet } from './types.js'

export interface SliceInput {
  nodes: Node[] | Map<string, Node>
  assertions: Assertion[]
  focus: string[]
  maxAssertions: number
  maxTokens?: number
  hops?: number
  /** OA5：切片必须带版本（ADR-0012 §3.3） */
  baseVersion: BaseVersion
  /** 只允许这些来源断言进入切片（关系检索按命中边来源过滤；缺省=按 focus 邻接） */
  assertionIds?: string[]
  packetId?: string
}

const isNodeRef = (v: unknown, known: Set<string>): v is string =>
  typeof v === 'string' && known.has(v)

export function slice(input: SliceInput): Packet {
  const nodeList = input.nodes instanceof Map ? [...input.nodes.values()] : input.nodes
  const byId = new Map(nodeList.map((n) => [n.id, n]))
  const known = new Set(byId.keys())
  const allowed = input.assertionIds === undefined ? null : new Set(input.assertionIds)
  const acts = input.assertions.filter((a) => a.status !== 'retracted' && (allowed === null || allowed.has(a.id)))

  /**
   * 产线生成的实体未必先登记成 Node（模型给的是朴素名字，没有 n:/c:/t: 前缀）。
   * 若只认 knwon 里的节点，整片断言会被丢掉 —— "本体生成了却看不见"。
   * 因此 focus 里的条目**即使不是已知节点**也参与邻接收集；但**跳跃扩展只沿已知节点**，
   * 避免朴素名字把切片无限拉大。
   */
  const hops = Math.max(0, input.hops ?? 1)
  const reached = new Set<string>(input.focus)
  let frontier = new Set<string>(input.focus)
  const collected = new Map<string, Assertion>()

  // 惰性邻接：只对当前 frontier 扫描断言，不为 10^5 断言的每个端点建全量列表。
  // 语义与"先建 incident 索引再 BFS"一致（hops 默认 1；每多一跳多扫一遍）。
  for (let hop = 0; hop <= hops; hop++) {
    if (frontier.size === 0) break
    const next = new Set<string>()
    for (const a of acts) {
      const sRef = typeof a.s === 'string' ? a.s : undefined
      const oRef = typeof a.o === 'string' ? a.o : undefined
      const sIn = sRef !== undefined && frontier.has(sRef)
      const oIn = oRef !== undefined && frontier.has(oRef)
      if (!sIn && !oIn) continue
      collected.set(a.id, a)
      const other = sIn ? a.o : a.s
      if (isNodeRef(other, known) && !reached.has(other)) {
        reached.add(other)
        next.add(other)
      }
    }
    frontier = next
  }

  // 权威序 → id 序（确定性）
  const ordered = [...collected.values()].sort((x, y) => {
    const [rx, cx] = rankOf(x)
    const [ry, cy] = rankOf(y)
    if (rx !== ry) return ry - rx
    if (cx !== cy) return cy - cx
    return x.id.localeCompare(y.id)
  })

  let picked = ordered
  let truncated = false
  if (ordered.length > input.maxAssertions) {
    picked = ordered.slice(0, input.maxAssertions)
    truncated = true
  }
  if (input.maxTokens !== undefined) {
    // 粗略 token 预算：每条断言按 24 token 估，超出即截断（下界保守）
    const cap = Math.max(1, Math.floor(input.maxTokens / 24))
    if (picked.length > cap) {
      picked = picked.slice(0, cap)
      truncated = true
    }
  }

  const usedNodes = new Set<string>(input.focus)
  for (const a of picked) {
    if (known.has(a.s)) usedNodes.add(a.s)
    if (typeof a.o === 'string' && known.has(a.o)) usedNodes.add(a.o)
  }
  const nodes = [...usedNodes].sort().map((id) => byId.get(id) ?? ({
    // 未登记的实体：给一个最小占位节点，保证它在渲染里可见（kind 标 term，不臆测类型）
    id, kind: 'term' as const, scope: 'task:local',
  } as Node))

  const focus = [...input.focus].sort()
  // 默认 id 由切片内容决定：版本尾号 + 计数会让"同数量不同内容"撞号，
  // 进而混淆派生血缘（派生转交会被误判为复用父 packetId）。
  const content = {
    baseVersion: input.baseVersion,
    focus,
    nodes,
    assertions: picked,
    truncated,
    budget: { maxAssertions: input.maxAssertions, maxTokens: input.maxTokens },
  }
  return {
    packetId: input.packetId ?? 'pkt-' + contentDigest(content),
    focus,
    baseVersion: input.baseVersion,
    nodes,
    assertions: picked,
    truncated,
    budget: { maxAssertions: input.maxAssertions, maxTokens: input.maxTokens },
  }
}