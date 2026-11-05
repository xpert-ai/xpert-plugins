import * as React from 'react'
import { createDashboardInspector } from '../lib/inspection-host'
import { dashboardComponents } from '../lib/dashboard-sources'
import type { DashboardManifest } from '../lib/dashboard.schema'

export function StandardDashboard({ html, manifest, inspect, onInspect, onExit }: {
  html: string; manifest: DashboardManifest; inspect: boolean
  onInspect(id: string | null): void; onExit(): void
}) {
  const frame = React.useRef<HTMLIFrameElement>(null)
  const host = React.useRef<ReturnType<typeof createDashboardInspector>>()
  const callbacks = React.useRef({ onInspect, onExit })
  callbacks.current = { onInspect, onExit }
  React.useEffect(() => {
    if (!frame.current) return
    // Renderer DOM block identities use kind:id, independent of manifest block IDs.
    const components = dashboardComponents(manifest).map(component => ({ ...component, elementId: `${component.kind}:${component.id}` }))
    const mounted = createDashboardInspector(frame.current, components, id => callbacks.current.onInspect(id), () => callbacks.current.onExit(), true)
    host.current = mounted
    mounted.setEnabled(inspect)
    frame.current.srcdoc = html.replace(/<head(\s[^>]*)?>/i, head => head + mounted.prefix)
    return () => { mounted.dispose(); host.current = undefined }
  }, [html, manifest.id])
  React.useEffect(() => { host.current?.setEnabled(inspect) }, [inspect])
  return <iframe ref={frame} title={manifest.title} sandbox="allow-scripts" className="h-full w-full border-0"/>
}
