import { z } from 'zod/v3'
import type { DashboardManifest } from './dashboard.schema'

export const componentId = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/)
export const sourceMetadataSchema = z.array(z.object({
  bindingId: componentId, title: z.string().min(1).max(160), description: z.string().max(2000).optional()
}).strict()).max(8)
export const dashboardComponentsSchema = z.array(z.object({
  id: componentId, elementId: componentId, title: z.string().min(1).max(160),
  kind: z.enum(['metric', 'chart', 'table', 'filter', 'text']),
  sources: z.array(z.object({ bindingId: componentId, fieldIds: z.array(componentId).max(80).optional() }).strict()).max(8)
}).strict()).max(160)
export type DashboardComponent = z.infer<typeof dashboardComponentsSchema>[number]

export function dashboardComponents(manifest: DashboardManifest): DashboardComponent[] {
  if (manifest.presentation) return manifest.components ?? []
  return [...manifest.charts, ...manifest.tables].map(view => ({
    id: view.id, elementId: view.id, title: view.title, kind: 'fields' in view ? 'table' : 'chart',
    sources: manifest.bindings.filter(binding => binding.output.datasetId === view.datasetId)
      .map(binding => ({ bindingId: binding.id, fieldIds: 'fields' in view ? view.fields : [view.x, view.y, ...(view.color ? [view.color] : [])] }))
  }))
}

export function dashboardSources(manifest: DashboardManifest) {
  const components = dashboardComponents(manifest)
  return manifest.bindings.map(binding => ({
    binding, title: manifest.sourceMetadata?.find(item => item.bindingId === binding.id)?.title ?? binding.id,
    description: manifest.sourceMetadata?.find(item => item.bindingId === binding.id)?.description,
    components: components.filter(component => component.sources.some(source => source.bindingId === binding.id))
  }))
}

/** A rendering projection never exposes provider-native query configuration to a viewer. */
export function publicDashboardManifest(manifest: DashboardManifest): DashboardManifest {
  return { ...manifest, bindings: manifest.bindings.map(binding => ({ ...binding, payload: {} })) }
}
