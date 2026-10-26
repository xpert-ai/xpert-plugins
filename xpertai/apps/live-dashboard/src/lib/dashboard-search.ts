import type { ContentSearchProjection } from '@xpert-ai/contracts'
import type { DashboardManifest } from './dashboard.schema'
/** Explicit allowlist: no Binding source, parameter values, HTML/script, credentials
 * or queried rows cross the shared knowledge boundary. Data access stays viewer-specific. */
export function dashboardSearchProjection(manifest: DashboardManifest, revision: string): ContentSearchProjection {
  return { revision, sections: [
    { anchor: { kind: 'document', id: manifest.id }, text: manifest.title },
    ...[...manifest.charts, ...manifest.tables].map(view => ({ anchor: { kind: 'widget', id: view.id }, text: view.title })),
    ...manifest.controls.map(control => ({ anchor: { kind: 'control', id: control.controlId }, text: control.label }))
  ] }
}
