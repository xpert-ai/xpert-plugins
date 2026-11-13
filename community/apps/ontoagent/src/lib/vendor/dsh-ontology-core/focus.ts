/**
 * 焦点推导：产线要"自动注入"，就必须自己决定切哪一片——调用方不会知道节点 id。
 * 规则：任务文本里命中的节点/断言引用优先；无命中时退化为最近断言的若干主体。
 * 纯函数（无 IO/时钟/随机）。
 */
import type { Assertion, Node } from './types.js'

const stripPrefix = (id: string): string => (id.includes(':') ? id.slice(id.indexOf(':') + 1) : id)

export function deriveFocus(task: string, assertions: Assertion[], nodes: Node[], limit = 8): string[] {
  const text = task.toLowerCase()
  const hits: string[] = []
  const push = (id: string): void => { if (id.length > 0 && !hits.includes(id)) hits.push(id) }
  const probe = (id: string, labels: string[]): boolean => {
    const keys = [id, ...labels].map(stripPrefix).filter((k) => k.length >= 2)
    return keys.some((k) => text.includes(k.toLowerCase()))
  }
  for (const n of nodes) if (probe(n.id, [...(n.labels ?? []), ...(n.aliases ?? [])])) push(n.id)
  for (const a of assertions) {
    for (const ref of [a.s, a.o]) {
      if (typeof ref !== 'string') continue
      if (probe(ref, [])) push(ref)
    }
  }
  if (hits.length === 0) {
    const ordered = [...assertions].sort((x, y) => String(y.valid?.from ?? '').localeCompare(String(x.valid?.from ?? '')))
    for (const a of ordered) { push(a.s); if (hits.length >= limit) break }
  }
  return hits.slice(0, limit)
}
