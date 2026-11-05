import { parse, type DefaultTreeAdapterMap } from 'parse5'
import type { DashboardManifest } from './dashboard.schema'

export function assertComponentElements(manifest: DashboardManifest) {
  if (!manifest.presentation || !manifest.components?.length) return
  const ids = new Map<string, number>()
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) for (const attr of node.attrs) if (attr.name === 'id') ids.set(attr.value, (ids.get(attr.value) ?? 0) + 1)
    if ('childNodes' in node) node.childNodes.forEach(visit)
  }
  visit(parse(manifest.presentation.html))
  for (const component of manifest.components) if (ids.get(component.elementId) !== 1) throw new Error(`DASHBOARD_COMPONENT_ELEMENT_INVALID: ${component.id}`)
}
