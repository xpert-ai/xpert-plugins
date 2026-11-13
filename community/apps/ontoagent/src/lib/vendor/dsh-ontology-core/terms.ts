/**
 * 术语归一（消歧）：把任务里的说法映射到**环境本体里的概念**。
 *
 * 这是"环境本体带来外部信息"的最小可测形态：任务说"客人"、说"等级是 V7"，
 * 而企业本体里记的是 客户 / 客户等级 —— 不做这一步，agent 就在用任务的语言谈本体没有的东西。
 *
 * 匹配方式是**正着扫**：遍历本体的表面形式，看哪些出现在任务文本里。
 * （反着切中文要猜分词，会产生"这个/人算/算不"这类噪声，宁可少报也不污染上下文。）
 * 纯计算，无 IO/时钟/随机。
 */
import type { Assertion, Node } from './types.js'

export interface TermMatch {
  term: string
  concept: string
  score: number
  how: 'exact' | 'alias' | 'label' | 'definition' | 'prefix'
  alsoKnownAs: string[]
}

export interface ResolveResult {
  matches: TermMatch[]
  /** 任务里出现但本体没有对应概念的信号（编码型 token，或整段中文都没命中） */
  unresolved: string[]
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, '')

const surfaceForms = (n: Node): string[] => {
  const bare = n.id.includes(':') ? n.id.slice(n.id.indexOf(':') + 1) : n.id
  return [bare, ...(n.labels ?? []), ...(n.aliases ?? [])]
}

interface Scored { score: number; how: TermMatch['how'] }

function scoreFor(term: string, n: Node): Scored {
  const t = norm(term)
  const labels = (n.labels ?? []).map(norm)
  const aliases = (n.aliases ?? []).map(norm)
  const bare = norm(n.id.includes(':') ? n.id.slice(n.id.indexOf(':') + 1) : n.id)
  if (bare === t || labels.includes(t)) return { score: 1, how: 'exact' }
  if (aliases.includes(t)) return { score: 0.95, how: 'alias' }
  const def = norm(n.definition ?? '')
  if (def.length > 0 && t.length >= 2 && def.includes(t)) return { score: 0.7, how: 'definition' }
  if (t.length >= 2) return { score: 0.6, how: 'prefix' }
  return { score: 0.5, how: 'prefix' }
}

export function resolveTerms(task: string, nodes: Node[], opts: { max?: number } = {}): ResolveResult {
  const max = opts.max ?? 12
  const text = norm(task)
  const matches: TermMatch[] = []

  for (const n of nodes) {
    const forms = surfaceForms(n).filter((f) => norm(f).length >= 2)
    let bestForm = ''
    let bestScore = -1
    let bestHow: TermMatch['how'] = 'prefix'
    for (const form of forms) {
      if (text.indexOf(norm(form)) < 0) continue
      const scored = scoreFor(form, n)
      if (scored.score > bestScore) {
        bestForm = form
        bestScore = scored.score
        bestHow = scored.how
      }
    }
    if (bestForm === '') continue
    matches.push({
      term: bestForm,
      concept: n.id,
      score: Number(bestScore.toFixed(2)),
      how: bestHow,
      alsoKnownAs: forms.filter((f) => f !== bestForm).slice(0, 4),
    })
  }

  const unresolved: string[] = []
  for (const code of task.match(/[A-Za-z]*\d[A-Za-z0-9_-]*|[A-Z][A-Z0-9_-]{2,}/g) ?? []) {
    if (!matches.some((m) => norm(m.term) === norm(code))) unresolved.push(code)
  }
  if (matches.length === 0) {
    const runs = (task.match(/[\u4e00-\u9fff]{2,}/g) ?? []).sort((a, b) => b.length - a.length)
    const longest = runs[0]
    if (longest !== undefined) unresolved.unshift(longest.slice(0, 12))
  }

  matches.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
  return { matches: matches.slice(0, max), unresolved: [...new Set(unresolved)].slice(0, max) }
}

/** 渲染成便宜的一行一条（放进上下文几乎不花 token）。 */
export function renderTermMap(r: ResolveResult): string[] {
  if (r.matches.length === 0 && r.unresolved.length === 0) return []
  const out = ['## 术语归一（环境本体，' + String(r.matches.length) + ' 条）']
  for (const m of r.matches) {
    const aka = m.alsoKnownAs.length > 0 ? '（亦称 ' + m.alsoKnownAs.join('/') + '）' : ''
    out.push('- ' + m.term + ' → ' + m.concept + aka + '  [' + m.how + ' ' + String(m.score) + ']')
  }
  if (r.unresolved.length > 0) {
    out.push('- 本体中无对应概念：' + r.unresolved.slice(0, 8).join(' / ') + '（出现新说法时可提交为 candidate）')
  }
  return out
}

/**
 * 把"标签/定义/别名断言"补进 Node 的表面形式。
 * 导入的既有本体把 label/definition 存成断言（日志是事实源），Node 只是派生视图，
 * 术语归一必须两种来源都能看见。
 */
export function enrichNodes(nodes: Node[], assertions: Assertion[]): Node[] {
  const byId = new Map<string, Node>()
  for (const n of nodes) byId.set(n.id, { ...n, labels: [...(n.labels ?? [])], aliases: [...(n.aliases ?? [])] })
  for (const a of assertions) {
    if (a.status === 'retracted' || typeof a.s !== 'string') continue
    let node = byId.get(a.s)
    if (node === undefined) {
      node = { id: a.s, kind: 'term', scope: 'gov:preset', labels: [], aliases: [] }
      byId.set(a.s, node)
    }
    const o = a.o
    if (typeof o !== 'string') continue
    if (a.p === 'label' && !(node.labels ?? []).includes(o)) node.labels = [...(node.labels ?? []), o]
    else if (a.p === 'definition' && node.definition === undefined) node.definition = o
    else if (a.p === 'alias' && !(node.aliases ?? []).includes(o)) node.aliases = [...(node.aliases ?? []), o]
  }
  return [...byId.values()]
}
