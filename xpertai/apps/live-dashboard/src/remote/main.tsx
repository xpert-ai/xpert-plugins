import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod/v3'
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, Button, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, RefreshCw, Save, Plus, FileJson, Send } from '@xpert-ai/plugin-shadcn-ui'
import { dashboardSchema, type DashboardManifest } from '../lib/dashboard.schema'
import { dashboardSummarySchema as summarySchema, dashboardSavedSchema as savedSchema, dashboardViewDataSchema as listSchema } from '../lib/dashboard-view.schema'
import { startBridge, requestHost, selectDashboard, navigateDashboard } from './bridge'
import { messages } from './i18n'
import { dashboardNavigationSchema, dashboardNavigationKey } from '../lib/dashboard-navigation'
import './style.css'
import { HtmlDashboard, type HtmlDashboardHandle } from './html-dashboard'
import { DashboardPicker } from './dashboard-picker'
import { ShareDialog } from './share-dialog'
import { ViewerControls } from './viewer-controls'
import { installArtifactDocumentFramePolicy } from '@xpert-ai/plugin-sdk/artifact-document'

installArtifactDocumentFramePolicy(document)

declare global { interface Window { __ANALYTICS_RENDERER_HTML__: string; __DASHBOARD_READ_ONLY__?: boolean } }
const readOnly = window.__DASHBOARD_READ_ONLY__ === true
const actionSchema = z.object({ success: z.literal(true), data: z.unknown() })
const queryResultSchema = z.object({ payload: z.unknown(), datasets: z.array(z.object({ completeness: z.object({ truncated: z.boolean() }), freshness: z.object({ sourceFetchedAt: z.string() }) })) })
type Summary = z.infer<typeof summarySchema>
type Saved = z.infer<typeof savedSchema>
type ControlValue = string | number | boolean | null

function App() {
  const [t, setMessages] = React.useState(() => messages('en-US'))
  const [list, setList] = React.useState<Summary[]>([])
  const [sources, setSources] = React.useState<z.infer<typeof listSchema>['meta']['sources']>([])
  const [saved, setSaved] = React.useState<Saved | null>(null)
  const [versions, setVersions] = React.useState<Summary[]>([])
  const [controls, setControls] = React.useState<Record<string, ControlValue>>({})
  const [html, setHtml] = React.useState('')
  const [busy, setBusy] = React.useState(true)
  const [error, setError] = React.useState('')
  const [status, setStatus] = React.useState('')
  const [editor, setEditor] = React.useState<string | null>(null)
  const [confirmPublish, setConfirmPublish] = React.useState<Saved | null>(null)
  const [partial, setPartial] = React.useState(false)
  const [sharing, setSharing] = React.useState(false)
  const requestSequence = React.useRef(0), operationSequence = React.useRef(0)
  const navigationKey = React.useRef<string>()
  const htmlDashboard = React.useRef<HtmlDashboardHandle>(null)

  function clearDocument() {
    setHtml(''); setSaved(null); setEditor(null); setVersions([])
    setSharing(false); setConfirmPublish(null)
  }
  async function load(artifactId?: string, versionId?: string) {
    const sequence = requestSequence.current
    const result = listSchema.parse(await requestHost('requestData', { query: { parameters: artifactId ? { artifactId, ...(versionId ? { versionId } : {}) } : {} } })).meta
    if (sequence === requestSequence.current) { setList(result.dashboards); setSources(result.sources) }
    return result
  }
  async function query(target: Saved, values: Record<string, ControlValue>) {
    const sequence = ++requestSequence.current
    if (!target.versionId && !target.draftRevision) throw new Error('Missing saved definition')
    setHtml(''); setStatus(''); setPartial(false)
    const result = queryResultSchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'query', input: { artifactId: target.artifactId, versionId: target.versionId ?? undefined, ...(target.isDraft ? { draftRevision: target.draftRevision } : {}), controls: values } })).data)
    if (sequence !== requestSequence.current) return
    setHtml(rendererHtml(result.payload)); setPartial(result.datasets.some((dataset) => dataset.completeness.truncated))
    setStatus(result.datasets.map((dataset) => dataset.freshness.sourceFetchedAt).sort()[0] ?? '')
  }
  async function open(artifactId: string, versionId?: string, reflectNavigation = true) {
    const sequence = ++requestSequence.current
    clearDocument()
    const result = await load(artifactId, versionId), target = result.saved
    if (sequence !== requestSequence.current) return
    if (!target || !target.versionId && !target.draftRevision) throw new Error('Dashboard is unavailable')
    const defaults = Object.fromEntries(target.manifest.controls.filter((control) => control.defaultValue !== undefined).map((control) => [control.controlId, control.defaultValue ?? null]))
    setSaved(target); setVersions(result.versions ?? []); setControls(defaults); setStatus(''); setPartial(false)
    if (!readOnly && reflectNavigation) {
      navigationKey.current = dashboardNavigationKey({ artifactId, versionId })
      await navigateDashboard(result.navigationTarget, artifactId, versionId)
      if (sequence !== requestSequence.current) return
    }
    if (!readOnly) await selectDashboard({ artifactId: target.artifactId, versionId: target.versionId ?? undefined, draftRevision: target.draftRevision })
    if (sequence !== requestSequence.current) return
    if (!target.manifest.presentation) await query(target, defaults)
  }
  async function run(work: () => Promise<void>) {
    const operation = ++operationSequence.current
    setBusy(true); setError('')
    try { await work() } catch (error) { if (operation === operationSequence.current) setError(error instanceof Error ? error.message : t.error) } finally { if (operation === operationSequence.current) setBusy(false) }
  }
  async function openLatest() {
    const sequence = ++requestSequence.current
    clearDocument()
    const result = await load()
    if (sequence !== requestSequence.current) return
    const latest = [...result.dashboards].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0]
    if (latest) await open(latest.artifactId, undefined, false)
  }
  React.useEffect(() => startBridge((locale, query) => {
    setMessages(messages(locale))
    const parsed = dashboardNavigationSchema.safeParse(query ?? {})
    if (!parsed.success) {
      ++requestSequence.current; navigationKey.current = undefined; clearDocument()
      void run(async () => { throw new Error('DASHBOARD_NAVIGATION_INVALID') })
      return
    }
    const target = parsed.data, key = dashboardNavigationKey(target)
    if (key === navigationKey.current) return
    navigationKey.current = key
    void run(() => target.artifactId ? open(target.artifactId, target.versionId, false) : openLatest())
  },
    (artifactId) => { void run(() => open(artifactId)) }), [])

  async function save() {
    const manifest = dashboardSchema.parse(JSON.parse(editor ?? ''))
    const expectedVersionId = saved?.manifest.id === manifest.id ? saved.versionId ?? null : null
    const result = summarySchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'save', input: { manifest, expectedVersionId, expectedRevision: saved?.manifest.id === manifest.id ? saved.draftRevision ?? 0 : 0 } })).data)
    await open(result.artifactId)
  }
  async function publish() {
    if (!confirmPublish?.draftRevision) return
    const result = summarySchema.parse(actionSchema.parse(await requestHost('executeAction', { actionKey: 'publish', input: {
      artifactId: confirmPublish.artifactId, expectedRevision: confirmPublish.draftRevision, expectedCurrentVersionId: confirmPublish.baseVersionId ?? confirmPublish.versionId ?? null, confirmed: true
    } }).catch(error => {
      if (error instanceof Error && error.message === 'DASHBOARD_PUBLISH_SHARE_BLOCKED') {
        setConfirmPublish(null)
        throw new Error(t.publishShareBlocked)
      }
      throw error
    })).data)
    setConfirmPublish(null)
    await open(result.artifactId, result.versionId ?? undefined)
  }
  const toolbar = <header className="dashboard-toolbar border-b">
      <h1 className="toolbar-title text-base font-semibold">{readOnly ? saved?.title ?? t.title : t.title}</h1>
      {!readOnly && <DashboardPicker items={list} value={saved?.artifactId ?? ''} disabled={busy} label={t.select}
        searchLabel={t.search} emptyLabel={t.noResults} onChange={(id) => void run(() => open(id))}/>}
      {readOnly && saved && <span className="text-xs text-muted-foreground">{t.teamReadOnly} · {t.version} {saved.versionNumber}</span>}
      <span className="toolbar-loading text-muted-foreground" role="status" title={busy ? t.loading : undefined}>
        {busy && <><RefreshCw className="size-4 motion-safe:animate-spin" aria-hidden="true"/><span className="sr-only">{t.loading}</span></>}
      </span>
      {!readOnly && saved && <Select value={saved.isDraft ? 'draft' : saved.versionId ?? 'draft'} onValueChange={(id) => void run(() => open(saved.artifactId, id === 'draft' ? undefined : id))} disabled={busy}>
        <SelectTrigger className="toolbar-version" aria-label={t.history}><SelectValue placeholder={t.history}/></SelectTrigger>
        <SelectContent><SelectItem value="draft">{t.draft}{saved.isDraft ? ` · r${saved.draftRevision}` : ''}</SelectItem>{versions.filter(item => item.versionId).map(item => <SelectItem key={item.versionId} value={item.versionId!}>{t.version} {item.versionNumber}</SelectItem>)}</SelectContent>
      </Select>}
      {saved && status && <time className="toolbar-updated text-xs text-muted-foreground" dateTime={status}
        title={`${t.refreshed}: ${new Date(status).toLocaleString(document.documentElement.lang)}`}>
        <span className="toolbar-full-date">{new Date(status).toLocaleString(document.documentElement.lang)}</span>
        <span className="toolbar-short-date">{new Date(status).toLocaleTimeString(document.documentElement.lang)}</span>
      </time>}
      <div className="toolbar-actions">
        {!readOnly && saved?.isDraft && <Button disabled={busy} onClick={() => setConfirmPublish(saved)} aria-label={t.publish} title={t.publish}><Save/><span>{t.publish}</span></Button>}
        {!readOnly && saved && <Button variant="outline" disabled={busy} aria-label={t.edit} title={t.edit} onClick={() => void run(async () => {
          const result = await load(saved.artifactId)
          if (!result.saved) throw new Error(t.error)
          setSaved(result.saved); setVersions(result.versions ?? []); setEditor(JSON.stringify(result.saved.manifest, null, 2))
        })}><FileJson/><span>{t.edit}</span></Button>}
        {!readOnly && <Button variant="outline" disabled={busy} aria-label={t.import} title={t.import} onClick={() => setEditor('')}><Plus/><span>{t.import}</span></Button>}
        {!readOnly && saved && <Button variant="outline" onClick={() => setSharing(true)} disabled={busy} aria-label={t.share} title={t.share}><Send/><span>{t.share}</span></Button>}
        <Button disabled={busy} aria-label={t.refresh} title={t.refresh} onClick={() => { if (saved?.manifest.presentation) { setError(''); htmlDashboard.current?.refresh() } else void run(async () => { if (saved) { await load(); await query(saved, controls) } else await openLatest() }) }}><RefreshCw/><span>{t.refresh}</span></Button>
      </div>
    </header>
  const filters = saved && !saved.manifest.presentation && !!saved.manifest.controls.length && <section className="flex flex-wrap items-end gap-3 border-b px-4 py-3">
    {saved.manifest.controls.map((control) => <Filter key={control.controlId} control={control} value={controls[control.controlId] ?? null} disabled={busy} onChange={(value) => setControls((current) => ({ ...current, [control.controlId]: value }))}/>)}
    <Button type="button" variant="outline" disabled={busy} onClick={() => void run(() => query(saved, controls))}>{t.apply}</Button>
  </section>
  return <main className="dashboard-shell" data-read-only={readOnly || undefined}>
    {readOnly ? <ViewerControls busy={busy} t={t}>{toolbar}{filters}</ViewerControls> : toolbar}
    {!readOnly && sharing && saved && <ShareDialog artifactId={saved.artifactId} versionId={saved.versionId ?? undefined} versions={versions} t={t} onClose={() => setSharing(false)}/>}
    <AlertDialog open={!!confirmPublish} onOpenChange={open => { if (!open && !busy) setConfirmPublish(null) }}>
      <AlertDialogContent><AlertDialogTitle>{t.publish}</AlertDialogTitle>
        <AlertDialogDescription>{t.confirmPublish} {confirmPublish?.manifest.title} · r{confirmPublish?.draftRevision}</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t.cancel}</AlertDialogCancel>
          <Button disabled={busy} onClick={() => void run(publish)}>{t.confirm}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {error && <div role="alert" className="border-b px-4 py-3 text-destructive">{error}</div>}
    {editor !== null ? <section className="editor-panel p-4">
      <label className="text-sm font-medium" htmlFor="definition">{t.definition}</label>
      <Textarea id="definition" className="min-h-0 flex-1 font-mono text-xs" value={editor} onChange={(event) => setEditor(event.target.value)} disabled={busy}/>
      <details className="text-xs"><summary>{t.sources}</summary><pre className="max-h-32 overflow-auto">{JSON.stringify(sources, null, 2)}</pre></details>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)} disabled={busy}>{t.cancel}</Button><Button onClick={() => void run(save)} disabled={busy || !editor.trim()}><Save/>{t.save}</Button></div>
    </section> : <>
      {!readOnly && filters}
      {partial && <p role="status" className="px-4 py-2 text-sm">{t.partial}</p>}
      <section className="canvas-panel" aria-busy={busy}>
        {!busy && !html && !saved?.manifest.presentation && !error && <p className="p-6 text-muted-foreground">{t.empty}</p>}
        {saved?.manifest.presentation && <HtmlDashboard ref={htmlDashboard} artifactId={saved.artifactId} versionId={saved.versionId ?? undefined} draftRevision={saved.isDraft ? saved.draftRevision : undefined}
          manifest={saved.manifest} dependencies={saved.dependencies ?? []} onBusy={setBusy} onError={setError} onResult={result => { setError(''); setPartial(result.partial); setStatus(result.fetchedAt) }}/ >}
        {html && <iframe title={saved?.manifest.title ?? t.title} sandbox="allow-scripts" srcDoc={html} className="h-full w-full border-0"/>}
      </section>
    </>}
  </main>
}
function Filter({ control, value, onChange, disabled }: { control: DashboardManifest['controls'][number]; value: ControlValue; onChange: (value: ControlValue) => void; disabled: boolean }) {
  return <div className="grid gap-1.5"><label htmlFor={control.controlId} className="text-xs text-muted-foreground">{control.label}</label>
    {control.allowedValues ? <Select value={JSON.stringify(value)} onValueChange={(value) => onChange(z.union([z.string(), z.number(), z.boolean(), z.null()]).parse(JSON.parse(value)))} disabled={disabled}>
      <SelectTrigger id={control.controlId} className="w-44"><SelectValue/></SelectTrigger><SelectContent>{control.allowedValues.map((value) => <SelectItem key={JSON.stringify(value)} value={JSON.stringify(value)}>{String(value ?? '—')}</SelectItem>)}</SelectContent>
    </Select> : control.type === 'boolean' ? <Select value={String(value)} onValueChange={(value) => onChange(value === 'true')} disabled={disabled}>
      <SelectTrigger id={control.controlId} className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectContent>
    </Select> : <Input id={control.controlId} className="w-44" disabled={disabled} type={control.type === 'date' ? 'date' : control.type === 'number' ? 'number' : 'text'} value={value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : control.type === 'number' ? Number(event.target.value) : event.target.value)}/>}
  </div>
}
function rendererHtml(payload: unknown) {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  // The renderer's default fetch shim assumes an HTTP origin. srcDoc is opaque, so provide its
  // three read-only in-memory endpoints before the unchanged renderer bundle initializes.
  const setup = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><script>window.__DATASCIENCE_ARTIFACT_HOSTING__={mode:'site_creator',readOnly:true,controls:{edit:false,exportHostedLink:false,hostedLink:false}};window.xpertai={toolOutput:${json(payload)},toolResponseMetadata:${json(payload)},availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen',hostContext:{availableDisplayModes:['inline','fullscreen'],displayMode:'fullscreen'}};
  window.__datascienceArtifactFetchShimInstalled=true;
  window.fetch=async function(input,init){const path=new URL(typeof input==='string'?input:input.url,'https://renderer.invalid').pathname;const payload=window.xpertai.toolOutput;const data={'/api/manifest':payload.manifest,'/api/snapshot':payload.snapshot,'/api/package':{manifestPath:'live dashboard',snapshotPath:'live query'}};const ok=(!init||!init.method||init.method==='GET')&&Object.prototype.hasOwnProperty.call(data,path);return new Response(JSON.stringify(ok?data[path]:{error:'Unavailable in live read-only view'}),{status:ok?200:404,headers:{'Content-Type':'application/json'}})};<\/script>`
  return window.__ANALYTICS_RENDERER_HTML__.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${setup}`)
}
createRoot(document.getElementById('root')!).render(<App/> )
