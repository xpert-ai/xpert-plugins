import { parse, type DefaultTreeAdapterMap } from 'parse5'
import { z } from 'zod/v3'
import type { DashboardManifest } from './dashboard.schema'

export const removalsSchema = z.object({
  bindingIds: z.array(z.string()).max(8).default([]), controlIds: z.array(z.string()).max(24).default([]),
  viewIds: z.array(z.string()).max(40).default([]), htmlElementIds: z.array(z.string()).max(500).default([])
}).strict().optional().describe('Only explicitly requested removals. Arrays of changed components otherwise upsert by stable ID and preserve omitted components.')

export function upsertComponents<T>(existing: T[], changes: T[] | undefined, id: (item: T) => string, removed: string[] = []): T[] {
  if (new Set(changes?.map(id)).size !== (changes?.length ?? 0)) throw new Error('DASHBOARD_DUPLICATE_COMPONENT')
  if (removed.some(key => !existing.some(item => id(item) === key) || changes?.some(item => id(item) === key)))
    throw new Error('DASHBOARD_REMOVAL_INVALID: copy existing IDs and do not also update a removed component')
  const next = new Map(existing.filter(item => !removed.includes(id(item))).map(item => [id(item), item]))
  for (const item of changes ?? []) next.set(id(item), item)
  return [...next.values()]
}

export function htmlElementIds(html: string): Set<string> {
  const ids = new Set<string>()
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) for (const attr of node.attrs) if (attr.name === 'id' && attr.value) ids.add(attr.value)
    if ('childNodes' in node) node.childNodes.forEach(visit)
    if ('content' in node) visit(node.content)
  }
  visit(parse(html))
  return ids
}

/** IDs are an explicit preservation contract, not a semantic comparison of arbitrary HTML. */
export function assertHtmlPreserved(previous: DashboardManifest['presentation'], next: DashboardManifest['presentation'], removed: string[] = []) {
  if (!previous || !next || previous.html === next.html) return
  const before = htmlElementIds(previous.html), after = htmlElementIds(next.html)
  const missing = [...before].filter(id => !after.has(id) && !removed.includes(id))
  if (missing.length) throw new Error(`DASHBOARD_COMPONENT_REMOVAL_REQUIRED: preserve existing HTML IDs or explicitly declare user-requested removals: ${JSON.stringify(missing)}. Your editing file is retained.`)
}
