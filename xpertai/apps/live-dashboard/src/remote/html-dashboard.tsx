import * as React from 'react'
import { z } from 'zod/v3'
import { verifyArtifactDocumentDependencies, type ArtifactDocumentDependencyAsset } from '@xpert-ai/plugin-sdk/artifact-document'
import { mountDashboardDocument } from '../lib/document-host'
import type { DashboardManifest } from '../lib/dashboard.schema'
import { requestHost } from './bridge'
import { createDashboardInspector } from '../lib/inspection-host'
import { dashboardComponents } from '../lib/dashboard-sources'
import { sourceDatasetSchema, type SourceEvent } from '../lib/source-executions'

const resultSchema = z.object({ success: z.literal(true), data: sourceDatasetSchema })
export interface HtmlDashboardHandle { refresh(bindingId?: string): void }
interface Props {
  artifactId: string
  versionId?: string
  draftRevision?: number
  manifest: DashboardManifest
  dependencies: ArtifactDocumentDependencyAsset[]
  inspect?: boolean
  onInspect?(id: string | null): void
  onInspectExit?(): void
  onExecution?(event: SourceEvent): void
  onBusy(value: boolean): void
  onError(code: string): void
  onResult(result: { partial: boolean; fetchedAt: string }): void
}
export const HtmlDashboard = React.forwardRef<HtmlDashboardHandle, Props>(function HtmlDashboard(props, ref) {
  const iframe = React.useRef<HTMLIFrameElement>(null)
  const host = React.useRef<ReturnType<typeof mountDashboardDocument> | null>(null)
  const inspector = React.useRef<ReturnType<typeof createDashboardInspector> | null>(null)
  const callbacks = React.useRef(props)
  callbacks.current = props
  React.useImperativeHandle(ref, () => ({ refresh(bindingId) { host.current?.refresh(bindingId) } }), [])
  React.useEffect(() => { inspector.current?.setEnabled(props.inspect === true) }, [props.inspect])
  React.useEffect(() => {
    const frame = iframe.current
    if (!frame || !props.manifest.presentation) return
    const manifest = props.manifest
    let dependencies: ArtifactDocumentDependencyAsset[]
    try { dependencies = verifyArtifactDocumentDependencies(props.dependencies, manifest.presentation?.dependencies ?? []) }
    catch { callbacks.current.onError('DOCUMENT_DEPENDENCY_INTEGRITY_FAILED'); callbacks.current.onBusy(false); return }
    const inspecting = createDashboardInspector(frame, dashboardComponents(manifest), id => callbacks.current.onInspect?.(id), () => callbacks.current.onInspectExit?.())
    inspector.current = inspecting
    inspecting.setEnabled(props.inspect === true)
    let disposed = false
    const requestIds = new Map<string, string>()
    let sequence = 0
    const mounted = mountDashboardDocument<z.infer<typeof resultSchema>['data']>(frame, {
      html: props.manifest.presentation.html,
      dependencies,
      context: { bindingIds: manifest.bindings.map(binding => binding.id),
        defaults: Object.fromEntries(manifest.controls.filter(control => control.defaultValue !== undefined).map(control => [control.controlId, control.defaultValue ?? null])),
        locale: document.documentElement.lang || 'en-US', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
      onQueryState: state => {
        if (disposed || !['queued', 'running', 'failed'].includes(state.state)) return
        if (state.state === 'queued') requestIds.set(state.bindingId, `source-${++sequence}`)
        const requestId = requestIds.get(state.bindingId)!
        if (state.state === 'failed') callbacks.current.onExecution?.({ type: 'failure', bindingId: state.bindingId, requestId, at: new Date().toISOString() })
        else callbacks.current.onExecution?.({ type: state.state === 'queued' ? 'queue' : 'start', bindingId: state.bindingId,
          requestId, controls: state.controls, at: new Date().toISOString() })
      },
      query: async input => {
        const identity = { bindingId: input.bindingId, requestId: requestIds.get(input.bindingId)! }
        const controls = Object.fromEntries(Object.entries(input.controls).filter(([id]) => manifest.bindings.find(b => b.id === input.bindingId)?.parameters.some(p => p.controlId === id)))

        try {
          const result = resultSchema.parse(await requestHost('executeAction', { actionKey: 'query-binding',
            input: { artifactId: props.artifactId, versionId: props.versionId, draftRevision: props.draftRevision, bindingId: input.bindingId, controls: input.controls } })).data
          if (!disposed) callbacks.current.onExecution?.({ ...identity, type: 'success', result, at: new Date().toISOString() })
          return result
        } catch (error) {
          if (!disposed) callbacks.current.onExecution?.({ ...identity, type: 'failure', at: new Date().toISOString() })
          throw error
        }
      },
      onBusy: busy => callbacks.current.onBusy(busy),
      onError: code => { if (!['DOCUMENT_QUERY_SUPERSEDED', 'DOCUMENT_DISPOSED'].includes(code)) callbacks.current.onError(code) },
      onResult: result => callbacks.current.onResult({ partial: result.completeness.truncated, fetchedAt: result.freshness.sourceFetchedAt })
    })
    // The SDK validates the original author document at its full size budget. Add only
    // our constant UI runtime to the already isolated srcdoc, synchronously before navigation.
    frame.srcdoc = frame.srcdoc.replace(/<head(\s[^>]*)?>/i, head => head + inspecting.prefix)
    host.current = mounted
    return () => { disposed = true; inspecting.dispose(); inspector.current = null; mounted.dispose(); host.current = null }
  }, [props.artifactId, props.versionId, props.draftRevision])
  return <iframe ref={iframe} title={props.manifest.title} sandbox="allow-scripts" className="h-full w-full border-0"/>
})
