import * as React from 'react'
import { z } from 'zod/v3'
import { mountArtifactDocument, verifyArtifactDocumentDependencies, type ArtifactDocumentDependencyAsset } from '@xpert-ai/plugin-sdk/artifact-document'
import type { DashboardManifest } from '../lib/dashboard.schema'
import { requestHost } from './bridge'

const resultSchema = z.object({ success: z.literal(true), data: z.object({
  schema: z.literal('xpert.analytics.dataset'), datasetId: z.string(),
  fields: z.array(z.object({ id: z.string() }).passthrough()), rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  completeness: z.object({ truncated: z.boolean() }).passthrough(),
  freshness: z.object({ sourceFetchedAt: z.string() }).passthrough(), provenance: z.object({ executionId: z.string() }).passthrough()
}).passthrough() })
export interface HtmlDashboardHandle { refresh(): void }
interface Props {
  artifactId: string
  versionId?: string
  draftRevision?: number
  manifest: DashboardManifest
  dependencies: ArtifactDocumentDependencyAsset[]
  onBusy(value: boolean): void
  onError(code: string): void
  onResult(result: { partial: boolean; fetchedAt: string }): void
}
export const HtmlDashboard = React.forwardRef<HtmlDashboardHandle, Props>(function HtmlDashboard(props, ref) {
  const iframe = React.useRef<HTMLIFrameElement>(null)
  const host = React.useRef<ReturnType<typeof mountArtifactDocument> | null>(null)
  const callbacks = React.useRef(props)
  callbacks.current = props
  React.useImperativeHandle(ref, () => ({ refresh() { host.current?.refresh() } }), [])
  React.useEffect(() => {
    const frame = iframe.current
    if (!frame || !props.manifest.presentation) return
    const manifest = props.manifest
    let dependencies: ArtifactDocumentDependencyAsset[]
    try { dependencies = verifyArtifactDocumentDependencies(props.dependencies, manifest.presentation?.dependencies ?? []) }
    catch { callbacks.current.onError('DOCUMENT_DEPENDENCY_INTEGRITY_FAILED'); callbacks.current.onBusy(false); return }
    const mounted = mountArtifactDocument<z.infer<typeof resultSchema>['data']>(frame, {
      html: props.manifest.presentation.html,
      dependencies,
      context: { bindingIds: manifest.bindings.map(binding => binding.id),
        defaults: Object.fromEntries(manifest.controls.filter(control => control.defaultValue !== undefined).map(control => [control.controlId, control.defaultValue ?? null])),
        locale: document.documentElement.lang || 'en-US', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' },
      query: async input => resultSchema.parse(await requestHost('executeAction', { actionKey: 'query-binding',
        input: { artifactId: props.artifactId, versionId: props.versionId, draftRevision: props.draftRevision, bindingId: input.bindingId, controls: input.controls } })).data,
      onBusy: busy => callbacks.current.onBusy(busy),
      onError: code => callbacks.current.onError(code),
      onResult: result => callbacks.current.onResult({ partial: result.completeness.truncated, fetchedAt: result.freshness.sourceFetchedAt })
    })
    host.current = mounted
    return () => { mounted.dispose(); host.current = null }
  }, [props.artifactId, props.versionId, props.draftRevision])
  return <iframe ref={iframe} title={props.manifest.title} sandbox="allow-scripts" className="h-full w-full border-0"/>
})
