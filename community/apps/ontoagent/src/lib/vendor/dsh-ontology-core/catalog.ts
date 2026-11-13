/**
 * 目录构建（Catalog）：把本体变成**可分层的目录树**，供 agent"看目录→判断→下钻"。
 *
 * 四档派生（先有结构用结构，没有就退化为确定性聚类）：
 *   D1 hierarchy 边（is-a / part-of）→ 真层级
 *   D2 scope / domain 字段        → 分组
 *   D3 IRI / 模块前缀             → 冷启动立即可用
 *   D4 名称+定义 token 聚类（平均链接，确定性）→ 兜底，标 provisional
 *
 * 纯计算（无 IO/时钟/随机/外部依赖）。
 */
import type { Node } from './types.js'

export type DerivedFrom = 'hierarchy' | 'scope' | 'iri' | 'cluster'

export interface CatalogNode {
  /** 路径式 id：'catalog:root/domain:work' */
  id: string
  /** 业务语汇标签（不是节点 id） */
  label: string
  kind: 'root' | 'group' | 'term'
  derivedFrom: DerivedFrom
  depth: number
  children: CatalogNode[]
  /** 直接挂在本节点的成员（term id） */
  members: string[]
  /** 子树成员总数（含自身 members） */
  memberCount: number
  /** 该子树里有多少成员带定义（衡量"这块有没有料"） */
  describedCount: number
  /** 聚类兜底时标记，提示"这不是真层级" */
  provisional: boolean
  /** 另见：本体是图，这个概念还有别的父（目录里只挂一处，其余在这里点名，避免重复读） */
  xrefs: string[]
  /** 只挂在根节点：从根走不到（成环 / 父在外部）而被兜底挂回来的概念数。0 才说明层级是连通的。 */
  recovered?: number
}

export interface BuildOptions {
  /** 每层最多几个子节点；超出则继续分组 */
  maxChildren?: number
  /** 聚类合并阈值（token-Jaccard 平均链接） */
  clusterThreshold?: number
  maxDepth?: number
  /** 命名空间最多切到第几段（FIBO 这种多段前缀需要 3–4） */
  maxNamespaceDepth?: number
  /**
   * 忽略命名空间（不做 D3 阶梯，只用层级边 + 聚类）。
   * 用途：对照实验——把"本体自带的组织体系"抽掉，看纯结构/纯语义聚类能编出什么。
   */
  ignoreNamespace?: boolean
}

export interface BuildInput {
  nodes: Node[]
  /** 显式层级边：parent -> child（来自 subClassOf / hierarchy / composition） */
  edges: Array<{ parent: string; child: string }>
  rootLabel?: string
}

/**
 * 默认预算按"谁更贵"定，而不是按人的 7±2 直觉：
 *   一层宽 N 项 → 渲染成 N 行文本，代价是 token（每行约 30–40 token）；
 *   多下一层   → 一次工具调用 + 一轮模型，代价是一整次模型往返。
 * 对 agent 而言后者贵一个数量级（HCI 菜单研究也表明最优 breadth 远大于 7，
 * Millers 7±2 不适用于 menu breadth，见 hcibook "menu breadth"）。所以宁宽勿深：
 * 每层 20 项 ≈ 700 token，深度上限 4 跳 ≈ 4 次往返。
 */
const DEFAULT_OPTS: Required<BuildOptions> = { maxChildren: 20, clusterThreshold: 0.34, maxDepth: 6, maxNamespaceDepth: 6, ignoreNamespace: false }

const labelOf = (n: Node): string => (n.labels?.[0] ?? (n.id.includes(':') ? n.id.slice(n.id.indexOf(':') + 1) : n.id))

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//

/**
 * id → 命名空间路径段。两类写法各按各自的分隔符切：
 *   绝对 IRI  `https://host/FND/Relations/Relations/Constituent` → ['FND','Relations','Relations','Constituent']
 *   前缀名    `fibo-be-oac-cpty:ContractualControl`             → ['fibo','be','oac','cpty','ContractualControl']
 * 后者按 '-' 切是刻意的：FIBO 的前缀名本身编码了模块层级（fibo-be-* = business entities）。
 */
export function idSegments(id: string): string[] {
  if (SCHEME_RE.test(id)) {
    const rest = id.slice(id.indexOf('://') + 3)
    const slash = rest.indexOf('/')
    if (slash < 0) return [rest]
    return rest.slice(slash + 1).split('/').filter((s) => s.length > 0)
  }
  const colon = id.indexOf(':')
  if (colon <= 0) return [id]
  const head = id.slice(0, colon)
  const local = id.slice(colon + 1)
  const headSegs = head.includes('-') ? head.split('-') : [head]
  return [...headSegs, ...(local.includes('/') ? local.split('/') : [local])]
}

/** 模块键：名称空间的前 depth 段（末段是概念自身名，不算模块）。切不出模块时返回 ''。 */
export function moduleOf(id: string, depth = 2): string {
  const segs = idSegments(id)
  const take = Math.min(depth, segs.length - 1)
  if (take < 1) return ''
  return segs.slice(0, take).join('/')
}

const TOKEN_RE = /[\u4e00-\u9fff]+|[A-Za-z][A-Za-z0-9_-]*/g
export function tokens(text: string): Set<string> {
  const out = new Set<string>()
  for (const run of text.toLowerCase().match(TOKEN_RE) ?? []) {
    if (/^[\u4e00-\u9fff]+$/.test(run)) {
      if (run.length === 1) out.add(run)
      else { for (let i = 0; i + 2 <= run.length; i += 1) out.add(run.slice(i, i + 2)); out.add(run) }
    } else if (run.length > 1) out.add(run)
  }
  return out
}

const searchText = (n: Node): string => [labelOf(n), n.definition ?? '', ...(n.labels ?? []), ...(n.aliases ?? [])].join(' ')

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

/**
 * 平均链接层次聚类（确定性：按 id 排序、相同相似度按字典序合并），聚到 <= maxChildren 或低于阈值。
 * force=true 时忽略阈值，一直合到 maxChildren —— 目录有硬预算（一屏能看完），
 * 宁可给出一个"临时凑的组"也不吐 72 个同级条目。
 */
export function clusterNodes(items: Node[], threshold: number, maxChildren: number, force = false): Node[][] {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id))
  const toks = new Map(sorted.map((n) => [n.id, tokens(searchText(n))]))
  let groups: Node[][] = sorted.map((n) => [n])
  const sim = (g1: Node[], g2: Node[]): number => {
    let sum = 0
    for (const a of g1) for (const b of g2) sum += jaccard(toks.get(a.id) as Set<string>, toks.get(b.id) as Set<string>)
    return sum / (g1.length * g2.length)
  }
  while (groups.length > maxChildren) {
    let best: { i: number; j: number; s: number; size: number } | null = null
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const s = sim(groups[i] as Node[], groups[j] as Node[])
        const size = (groups[i] as Node[]).length + (groups[j] as Node[]).length
        // 同分时先合小的：否则"全都相似"的语料会合成一个巨型组 + 一串单件组，
        // 巨型组再被递归切下去，层数越切越深（真实症状见 catalog-lab 的 40 概念用例）。
        if (best === null || s > best.s + 1e-12 || (Math.abs(s - best.s) <= 1e-12 && size < best.size)) best = { i, j, s, size }
      }
    }
    if (best === null) break
    if (!force && best.s < threshold) break
    const merged = [...(groups[best.i] as Node[]), ...(groups[best.j] as Node[])]
    groups = groups.filter((_, k) => k !== best.i && k !== best.j)
    groups.push(merged)
    groups.sort((x, y) => (x[0] as Node).id.localeCompare((y[0] as Node).id))
  }
  return groups
}

/** 组的业务标签：取组内出现最多的 2 字词；取不到就用成员数描述 */
function groupLabel(group: Node[]): string {
  const freq = new Map<string, number>()
  for (const n of group) for (const t of tokens(labelOf(n))) freq.set(t, (freq.get(t) ?? 0) + 1)
  const top = [...freq.entries()].filter(([t]) => t.length >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  if (top !== undefined && top[1] >= Math.max(2, Math.ceil(group.length / 2))) return top[0] + '…'
  return labelOf(group[0] as Node) + ' 等 ' + String(group.length) + ' 项'
}

interface Built { node: CatalogNode }

function makeNode(id: string, label: string, kind: CatalogNode['kind'], derivedFrom: DerivedFrom, depth: number, provisional: boolean): CatalogNode {
  return { id, label, kind, derivedFrom, depth, children: [], members: [], memberCount: 0, describedCount: 0, provisional, xrefs: [] }
}

function finalize(node: CatalogNode, byId: Map<string, Node>, depth: number): CatalogNode {
  node.depth = depth
  for (const [i, child] of node.children.entries()) node.children[i] = finalize(child, byId, depth + 1)
  const own = node.members.length
  const desc = node.members.filter((m) => (byId.get(m)?.definition ?? '').length > 0).length
  node.memberCount = own + node.children.reduce((s, c) => s + c.memberCount, 0)
  node.describedCount = desc + node.children.reduce((s, c) => s + c.describedCount, 0)
  return node
}

/** 输入与预算合成一个对象：调用方一次给全（早先分成两个参数时，第二个位置实际永远收不到值） */
export type CatalogSpec = BuildInput & BuildOptions

export function buildCatalog(spec: CatalogSpec): CatalogNode {
  const { nodes: inputNodes, edges: inputEdges, rootLabel, ...optionBag } = spec
  const opts = { ...DEFAULT_OPTS, ...optionBag }
  const byId = new Map(inputNodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, string[]>()
  const hasParent = new Set<string>()
  for (const e of inputEdges) {
    if (!byId.has(e.parent) || !byId.has(e.child)) continue
    childrenOf.set(e.parent, [...(childrenOf.get(e.parent) ?? []), e.child])
    hasParent.add(e.child)
  }
  const roots = inputNodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id)
  let recovered = 0
  const root = makeNode('catalog:root', rootLabel ?? '本体目录', 'root', 'hierarchy', 0, false)

  // 本体是 DAG（一个概念可以有两个父），目录是树：先到先挂，后来的父记成 xref。
  // 不这么做，同一个概念会在两个分支下各出现一次 —— agent 会重复读，也会以为那是两个概念。
  const assigned = new Set<string>()
  /** 挂不上的"第二父"按 parentId 暂存，建完树再贴回节点 */
  const pendingXref = new Map<string, string[]>()
  /** 某概念的全部后代（广度优先，防环） */
  function flattenDescendants(id: string): string[] {
    const out: string[] = []
    const seen = new Set<string>([id])
    const queue = [...(childrenOf.get(id) ?? [])].sort()
    while (queue.length > 0) {
      const cur = queue.shift() as string
      if (seen.has(cur)) continue
      seen.add(cur)
      out.push(cur)
      queue.push(...[...(childrenOf.get(cur) ?? [])].sort())
    }
    return out
  }
  function buildTerm(id: string, depth: number, nsDepth: number, parentId: string | null = null): CatalogNode | null {
    if (assigned.has(id)) {
      if (parentId !== null) {
        const holder = pendingXref.get(parentId) ?? []
        holder.push(id)
        pendingXref.set(parentId, holder)
      }
      return null
    }
    assigned.add(id)
    const n = byId.get(id) as Node
    const node = makeNode(id, labelOf(n), 'term', 'hierarchy', depth, false)
    let kids = [...(childrenOf.get(id) ?? [])].sort()
    // 单链压缩：一路只有一个子类时把中间层抽掉（类本身留在 members 里），
    // 否则长链会把目录顶到深度上限，长子链的后代整段丢失。
    for (let guard = 0; kids.length === 1 && guard < 8; guard += 1) {
      const mid = kids[0] as string
      const grand = [...(childrenOf.get(mid) ?? [])].sort()
      if (grand.length === 0 || assigned.has(mid)) break
      assigned.add(mid)
      node.members.push(mid)
      kids = grand
    }
    if (kids.length === 0) { node.members.push(id); return node }
    // 深度预算用尽：后代不再分层，但一个都不许丢 —— 全部列为本层成员
    if (depth >= opts.maxDepth + 2) {
      node.members.push(id)
      for (const id2 of flattenDescendants(id)) {
        if (assigned.has(id2)) continue
        assigned.add(id2)
        node.members.push(id2)
      }
      return node
    }
    // 一个概念的子孙同样受预算约束：子节点多到一屏放不下时，这一层也要分组，不能裸挂
    node.children = groupLevel(kids, depth + 1, nsDepth, id)
    node.members.push(id)
    return node
  }

  /**
   * 把一组同层条目按 maxChildren 分组（D2 scope → D3 命名空间阶梯 → D4 cluster）。
   * nsDepth = 命名空间切到第几段：模块多到一层放不下时继续加深，而不是退回聚类。
   */
  function groupLevel(ids: string[], depth: number, nsDepth = 1, parentId: string | null = null): CatalogNode[] {
    if (ids.length <= opts.maxChildren) {
      return ids.map((id) => buildTerm(id, depth, nsDepth, parentId)).filter((c): c is CatalogNode => c !== null)
    }
    // 硬深度上限：到顶就按预算切块摆平（浏览预算有上限，宁宽不深）。
    // 切块按名称序，纯确定性；组名用组内共同词，取不到就写序号——不假装那是语义分组。
    if (depth >= opts.maxDepth) {
      const sorted = [...ids].sort()
      const out: CatalogNode[] = []
      for (let i = 0; i < sorted.length; i += opts.maxChildren) {
        const chunk = sorted.slice(i, i + opts.maxChildren)
        const members = chunk.map((id) => byId.get(id) as Node)
        const g = makeNode('catalog:flat:' + String(depth) + ':' + String(i / opts.maxChildren), groupLabel(members), 'group', 'cluster', depth, true)
        g.children = chunk.map((id) => buildTerm(id, depth + 1, nsDepth, parentId)).filter((c): c is CatalogNode => c !== null)
        out.push(g)
      }
      return out
    }
    const scopes = new Map<string, string[]>()
    for (const id of ids) {
      const s = (byId.get(id)?.scope ?? '').split(':')[0] ?? ''
      scopes.set(s, [...(scopes.get(s) ?? []), id])
    }
    const meaningful = [...scopes.entries()].filter(([s]) => s.length > 0 && s !== 'task' && s !== 'gov')
    if (meaningful.length >= 2 && meaningful.length <= opts.maxChildren) {
      return meaningful.sort((a, b) => a[0].localeCompare(b[0])).map(([scope, members]) => {
        const g = makeNode('catalog:' + scope, '作用域 ' + scope, 'group', 'scope', depth, false)
        g.children = groupLevel(members.sort(), depth + 1, nsDepth, parentId)
        return g
      })
    }
    // 命名空间是"真结构"，聚类是"猜的结构"：宁可让这一层宽一点（<= 2 × 预算），
    // 也不把 69 个概念揉进一个 mush 组（宽层记 wide，stats 里可见）。
    const asGroups = (mods: Map<string, string[]>, at: number): CatalogNode[] =>
      [...mods.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mod, members]) => {
        const kids = groupLevel(members.sort(), depth + 1, at + 1, parentId)
        // 一个模块只含一个概念时，直接摆概念，不套模块壳
        if (kids.length === 1 && kids[0]?.kind === 'term') return kids[0] as CatalogNode
        const g = makeNode('catalog:module:' + mod, '模块 ' + mod, 'group', 'iri', depth, false)
        g.children = kids
        return g
      })
    let wide: { mods: Map<string, string[]>; d: number } | null = null
    for (let d = nsDepth; !opts.ignoreNamespace && d <= Math.min(Math.max(nsDepth, 2), opts.maxNamespaceDepth); d += 1) {
      const mods = new Map<string, string[]>()
      for (const id of ids) {
        const m = moduleOf(id, d)
        if (m.length === 0) continue
        mods.set(m, [...(mods.get(m) ?? []), id])
      }
      if (mods.size < 2) continue
      if (mods.size <= opts.maxChildren) return asGroups(mods, d)
      if (wide === null && mods.size <= opts.maxChildren * 2) wide = { mods, d }
    }
    if (wide !== null) return asGroups(wide.mods, wide.d)
    const nodes = ids.map((id) => byId.get(id) as Node)
    let clusters = clusterNodes(nodes, opts.clusterThreshold, opts.maxChildren)
    if (clusters.length > opts.maxChildren) clusters = clusterNodes(nodes, opts.clusterThreshold, opts.maxChildren, true)
    const out: CatalogNode[] = []
    for (const [i, group] of clusters.entries()) {
      // 单件组是白跑一层：直接出概念本身
      if (group.length === 1) {
        const only = buildTerm((group[0] as Node).id, depth, nsDepth, parentId)
        if (only !== null) out.push(only)
        continue
      }
      const g = makeNode('catalog:cluster:' + String(depth) + ':' + String(i), groupLabel(group), 'group', 'cluster', depth, true)
      g.children = groupLevel(group.map((n) => n.id).sort(), depth + 1, opts.maxNamespaceDepth, parentId)
      out.push(g)
    }
    return out
  }

  // 单链压缩（前置）：只有一个顶层概念时，直接从它的子铺起，
  // 否则 agent 的第一跳必然白跑一层。被压缩掉的概念留在 root.members，信息不丢。
  const hoisted: string[] = []
  let effective = [...roots].sort()
  while (effective.length === 1) {
    const only = effective[0] as string
    const kids = [...(childrenOf.get(only) ?? [])].sort()
    if (kids.length === 0) break
    hoisted.push(only)
    assigned.add(only)
    effective = kids
  }
  root.members.push(...hoisted)
  root.children = groupLevel(effective, 1)
  // 兜底：subClassOf 成环、或父在本体外部时，概念从"根"走不到。
  // 真实本体里这类环是存在的，静默丢概念比丢结构严重得多 —— 没挂上的一律当额外根再挂一次。
  const orphans = inputNodes.map((n) => n.id).filter((id) => !assigned.has(id)).sort()
  if (orphans.length > 0) {
    recovered = orphans.length
    root.children.push(...groupLevel(orphans, 1))
  }
  const attachXrefs = (node: CatalogNode): void => {
    const extra = pendingXref.get(node.id)
    if (extra !== undefined) node.xrefs = [...new Set(extra)].sort()
    for (const c of node.children) attachXrefs(c)
  }
  attachXrefs(root)
  const tree = finalize(root, byId, 0)
  tree.recovered = recovered
  return tree
}

export interface CatalogStats {
  depth: number
  levels: number[]
  branching: number[]
  leaves: number
  terms: number
  groups: number
  provisionalGroups: number
  derivedBy: Record<DerivedFrom, number>
  /** 跨分支重复引用数（本体是 DAG 的痕迹） */
  xrefs: number
  /** 平均叶深：agent 从根走到一个概念的跳数均值（成本指标，比"最大深度"更能说明浏览开销） */
  avgLeafDepth: number
}

export function catalogStats(root: CatalogNode): CatalogStats {
  const levels: number[] = []
  const branching: number[] = []
  const derivedBy: Record<DerivedFrom, number> = { hierarchy: 0, scope: 0, iri: 0, cluster: 0 }
  let leaves = 0
  let terms = 0
  let groups = 0
  let provisionalGroups = 0
  let maxDepth = 0
  let xrefs = 0
  let leafDepthSum = 0
  const walk = (n: CatalogNode): void => {
    xrefs += n.xrefs.length
    maxDepth = Math.max(maxDepth, n.depth)
    derivedBy[n.derivedFrom] += 1
    if (n.kind === 'group') { groups += 1; if (n.provisional) provisionalGroups += 1 }
    if (n.kind === 'term') terms += 1
    levels[n.depth] = (levels[n.depth] ?? 0) + 1
    if (n.children.length === 0) {
      leaves += 1
      leafDepthSum += n.depth
    } else branching.push(n.children.length)
    for (const c of n.children) walk(c)
  }
  walk(root)
  const avgBranch = branching.length === 0 ? 0 : branching.reduce((s, x) => s + x, 0) / branching.length
  return {
    depth: maxDepth, levels: levels.map((x) => x ?? 0), branching: [Number(avgBranch.toFixed(2))],
    leaves, terms, groups, provisionalGroups, derivedBy, xrefs,
    avgLeafDepth: leaves === 0 ? 0 : Number((leafDepthSum / leaves).toFixed(2)),
  }
}

/** 目录 → 渲染（一层一层给，配合 agent 下钻；不一次给全树） */
export function renderCatalogLevel(node: CatalogNode, limit = 12): string[] {
  const out = ['## ' + node.label + '（' + node.id + '，第 ' + String(node.depth) + ' 层）',
    '本层 ' + String(node.children.length) + ' 项；子树共 ' + String(node.memberCount) + ' 个概念']
  out.push(...node.children.slice(0, limit).map((c) => {
    const samples = [c, ...c.children].slice(0, 3).map((x) => x.label).join(' / ')
    const see = c.xrefs.length > 0 ? ' 另见 ' + String(c.xrefs.length) + ' 处' : ''
    return '- ' + c.label + '〔' + String(c.memberCount) + ' 概念' + (c.provisional ? '，聚类分组' : '') + see + '〕如：' + samples
  }))
  if (node.children.length > limit) out.push('- …还有 ' + String(node.children.length - limit) + ' 项（truncated）')
  return out
}
